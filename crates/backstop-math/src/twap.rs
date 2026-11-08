//! On-chain TWAP oracle (Uniswap-v2 style cumulative price + observation ring).
//!
//! * `price = quote_reserve × PRICE_SCALE / base_reserve`.
//! * At the start of every swap the cumulative is advanced with the
//!   **pre-swap** price × elapsed seconds, so an in-transaction manipulation
//!   only counts once time has passed (it must be held across blocks, exposed
//!   to other traders).
//! * An observation `(ts, cumulative)` is pushed at most every
//!   `min_interval` seconds into a fixed ring; TWAPs over arbitrary past
//!   windows interpolate linearly between observations.
//! * The cumulative wraps; only wrapping differences are consumed.

use crate::allocation::PRICE_SCALE;
use crate::error::{MathError, MathResult};
use crate::u256::mul_div_floor;

pub const OBSERVATIONS: usize = 96;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Observation {
    pub ts: i64,
    pub cumulative: u128,
}

/// Spot price of a constant-product pool.
pub fn spot_price(quote_reserve: u64, base_reserve: u64) -> MathResult<u128> {
    if base_reserve == 0 {
        return Err(MathError::DivisionByZero);
    }
    mul_div_floor(quote_reserve as u128, PRICE_SCALE, base_reserve as u128)
}

/// Oracle state embedded in a pool.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Oracle {
    pub cumulative: u128,
    pub last_ts: i64,
    pub last_price: u128,
    pub obs: [Observation; OBSERVATIONS],
    /// Index of the most recent observation.
    pub head: u16,
    /// Number of valid observations (≤ OBSERVATIONS).
    pub len: u16,
    pub min_interval: u32,
}

impl Oracle {
    pub fn new(now: i64, price: u128, min_interval: u32) -> Self {
        let mut obs = [Observation::default(); OBSERVATIONS];
        obs[0] = Observation {
            ts: now,
            cumulative: 0,
        };
        Self {
            cumulative: 0,
            last_ts: now,
            last_price: price,
            obs,
            head: 0,
            len: 1,
            min_interval,
        }
    }

    /// Advance the cumulative to `now` with the current (pre-swap) price and
    /// record an observation if due. Call **before** changing reserves.
    pub fn update(&mut self, now: i64) {
        if now > self.last_ts {
            let dt = (now - self.last_ts) as u128;
            self.cumulative = self
                .cumulative
                .wrapping_add(self.last_price.wrapping_mul(dt));
            self.last_ts = now;
        }
        let head = self.obs[self.head as usize];
        if now - head.ts >= self.min_interval as i64 {
            let next = (self.head as usize + 1) % OBSERVATIONS;
            self.obs[next] = Observation {
                ts: now,
                cumulative: self.cumulative,
            };
            self.head = next as u16;
            if (self.len as usize) < OBSERVATIONS {
                self.len += 1;
            }
        }
    }

    /// Record the post-swap price. Call **after** changing reserves.
    pub fn set_price(&mut self, price: u128) {
        self.last_price = price;
    }

    /// Cumulative extrapolated to `now` (no state change).
    pub fn cumulative_now(&self, now: i64) -> u128 {
        if now > self.last_ts {
            self.cumulative
                .wrapping_add(self.last_price.wrapping_mul((now - self.last_ts) as u128))
        } else {
            self.cumulative
        }
    }

    fn oldest_index(&self) -> usize {
        if (self.len as usize) < OBSERVATIONS {
            (self.head as usize + OBSERVATIONS + 1 - self.len as usize) % OBSERVATIONS
        } else {
            (self.head as usize + 1) % OBSERVATIONS
        }
    }

    /// Cumulative at an arbitrary time `t ≤ now`, interpolated.
    pub fn cumulative_at(&self, t: i64, now: i64) -> MathResult<u128> {
        if t > now {
            return Err(MathError::InvalidParameter);
        }
        let head = self.obs[self.head as usize];
        if t >= head.ts {
            // between the latest observation and now
            let end_c = self.cumulative_now(now);
            return Ok(interpolate(head.ts, head.cumulative, now, end_c, t));
        }
        let oldest = self.obs[self.oldest_index()];
        if t < oldest.ts {
            return Err(MathError::Unavailable);
        }
        // Walk backwards from head (ring is small and bounded).
        let mut i = self.head as usize;
        for _ in 0..self.len {
            let prev = (i + OBSERVATIONS - 1) % OBSERVATIONS;
            let (a, b) = (self.obs[prev], self.obs[i]);
            if t >= a.ts && t <= b.ts {
                return Ok(interpolate(a.ts, a.cumulative, b.ts, b.cumulative, t));
            }
            i = prev;
        }
        Err(MathError::Unavailable)
    }

    /// Time-weighted average price over `[now − window_end_ago − window, now − window_end_ago]`.
    pub fn twap(&self, now: i64, window: u32, end_ago: u32) -> MathResult<u128> {
        if window == 0 {
            return Err(MathError::InvalidParameter);
        }
        let t2 = now - end_ago as i64;
        let t1 = t2 - window as i64;
        let c2 = self.cumulative_at(t2, now)?;
        let c1 = self.cumulative_at(t1, now)?;
        Ok(c2.wrapping_sub(c1) / window as u128)
    }

    /// TWAP over the trailing window, falling back to the longest available
    /// history (or the spot price for a brand-new pool).
    pub fn twap_or_available(&self, now: i64, window: u32) -> MathResult<u128> {
        match self.twap(now, window, 0) {
            Ok(p) => Ok(p),
            Err(MathError::Unavailable) => {
                let oldest = self.obs[self.oldest_index()];
                let span = now - oldest.ts;
                if span <= 0 {
                    Ok(self.last_price)
                } else {
                    self.twap(now, span as u32, 0)
                }
            }
            Err(e) => Err(e),
        }
    }
}

fn interpolate(t0: i64, c0: u128, t1: i64, c1: u128, t: i64) -> u128 {
    if t1 <= t0 {
        return c0;
    }
    let d = c1.wrapping_sub(c0);
    let num = (t - t0) as u128;
    let den = (t1 - t0) as u128;
    // d * num / den without overflow: d < 2^128, num ≤ den
    let part = mul_div_floor(d, num, den).unwrap_or(d / den * num);
    c0.wrapping_add(part)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constant_price_twap() {
        let mut o = Oracle::new(0, 1_000, 60);
        for t in (60..=7_200).step_by(60) {
            o.update(t);
        }
        assert_eq!(o.twap(7_200, 300, 0).unwrap(), 1_000);
        assert_eq!(o.twap(7_200, 300, 3_600).unwrap(), 1_000);
    }

    #[test]
    fn price_change_reflected() {
        let mut o = Oracle::new(0, 1_000, 60);
        let mut t = 0;
        while t < 3_600 {
            t += 60;
            o.update(t);
        }
        o.set_price(2_000);
        while t < 7_200 {
            t += 60;
            o.update(t);
        }
        assert_eq!(o.twap(7_200, 300, 0).unwrap(), 2_000);
        assert_eq!(o.twap(7_200, 300, 3_900).unwrap(), 1_000);
    }

    #[test]
    fn in_block_manipulation_has_no_weight() {
        let mut o = Oracle::new(0, 1_000, 60);
        o.update(600);
        // pump and dump inside the same timestamp
        o.set_price(1_000_000);
        o.update(600);
        o.set_price(1_000);
        o.update(900);
        assert_eq!(o.twap(900, 300, 0).unwrap(), 1_000);
    }

    #[test]
    fn unavailable_history() {
        let o = Oracle::new(1_000, 5, 60);
        assert_eq!(o.twap(1_100, 300, 0), Err(MathError::Unavailable));
        assert_eq!(o.twap_or_available(1_100, 300).unwrap(), 5);
        assert_eq!(o.twap_or_available(1_000, 300).unwrap(), 5);
    }

    #[test]
    fn ring_wraps() {
        let mut o = Oracle::new(0, 7, 60);
        for t in (60..=60 * 500).step_by(60) {
            o.update(t);
        }
        assert_eq!(o.len as usize, OBSERVATIONS);
        assert_eq!(o.twap(30_000, 3_000, 0).unwrap(), 7);
        assert!(o.twap(30_000, 60, 60 * 200).is_err());
    }
}
