//! Counter-cyclical offer discount.
//!
//! ```text
//! discount = clamp(base + k_up·max(m,0) − k_down·max(−m,0), min, max)
//! ```
//!
//! `m` is the trailing-hour price change from the on-chain TWAP. Defaults:
//! base 5 %, k_up 0.25, k_down 0.15, clamp [2 %, 12 %].
//! Examples: +20 %/h → 10 %; −20 %/h → 2 %. Frozen at offer creation.

use crate::error::{MathError, MathResult, OrOverflow};
use crate::u256::mul_div_floor;
use crate::BPS;

/// Momentum is clamped to ±1000 % to bound intermediate math.
pub const MAX_ABS_MOMENTUM_BPS: i64 = 100_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DiscountParams {
    pub base_bps: u32,
    /// Sensitivity to rising prices, in bps of the momentum (2_500 = 0.25).
    pub k_up_bps: u32,
    /// Sensitivity to falling prices, in bps of the momentum (1_500 = 0.15).
    pub k_down_bps: u32,
    pub min_bps: u32,
    pub max_bps: u32,
}

impl Default for DiscountParams {
    fn default() -> Self {
        Self {
            base_bps: 500,
            k_up_bps: 2_500,
            k_down_bps: 1_500,
            min_bps: 200,
            max_bps: 1_200,
        }
    }
}

impl DiscountParams {
    pub fn validate(&self) -> MathResult<()> {
        if self.min_bps > self.max_bps
            || self.max_bps >= BPS as u32
            || self.base_bps > self.max_bps
            || self.base_bps < self.min_bps
        {
            return Err(MathError::InvalidParameter);
        }
        Ok(())
    }
}

/// Price change `p_now / p_then − 1` in bps, clamped to ±[`MAX_ABS_MOMENTUM_BPS`].
pub fn momentum_bps(p_now: u128, p_then: u128) -> MathResult<i64> {
    if p_then == 0 {
        return Err(MathError::DivisionByZero);
    }
    let (diff, neg) = if p_now >= p_then {
        (p_now - p_then, false)
    } else {
        (p_then - p_now, true)
    };
    // Clamp before multiplying so extreme ratios cannot overflow.
    let mag = if diff / p_then >= (MAX_ABS_MOMENTUM_BPS as u128) / BPS as u128 {
        MAX_ABS_MOMENTUM_BPS
    } else {
        mul_div_floor(diff, BPS as u128, p_then)?.min(MAX_ABS_MOMENTUM_BPS as u128) as i64
    };
    Ok(if neg { -mag } else { mag })
}

/// Discount in bps for momentum `m_bps`.
pub fn discount_bps(m_bps: i64, p: &DiscountParams) -> MathResult<u32> {
    let m = m_bps.clamp(-MAX_ABS_MOMENTUM_BPS, MAX_ABS_MOMENTUM_BPS);
    let up = if m > 0 {
        m * p.k_up_bps as i64 / BPS as i64
    } else {
        0
    };
    let down = if m < 0 {
        (-m) * p.k_down_bps as i64 / BPS as i64
    } else {
        0
    };
    let raw = (p.base_bps as i64)
        .checked_add(up)
        .or_overflow()?
        .checked_sub(down)
        .or_overflow()?;
    Ok(raw.clamp(p.min_bps as i64, p.max_bps as i64) as u32)
}

/// `twap × (1 − discount)`, floored (favours the absorbers).
pub fn fill_price(twap: u128, discount_bps: u32) -> MathResult<u128> {
    if discount_bps as u64 >= BPS {
        return Err(MathError::InvalidParameter);
    }
    mul_div_floor(twap, (BPS - discount_bps as u64) as u128, BPS as u128)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spec_examples() {
        let p = DiscountParams::default();
        assert_eq!(discount_bps(0, &p).unwrap(), 500);
        assert_eq!(discount_bps(2_000, &p).unwrap(), 1_000); // +20 % → 10 %
        assert_eq!(discount_bps(-2_000, &p).unwrap(), 200); // −20 % → 2 %
        assert_eq!(discount_bps(100_000, &p).unwrap(), 1_200); // clamp max
        assert_eq!(discount_bps(-100_000, &p).unwrap(), 200); // clamp min
        assert_eq!(discount_bps(-1_000, &p).unwrap(), 350);
    }

    #[test]
    fn momentum() {
        assert_eq!(momentum_bps(120, 100).unwrap(), 2_000);
        assert_eq!(momentum_bps(80, 100).unwrap(), -2_000);
        assert_eq!(
            momentum_bps(u128::MAX / 2, 1).unwrap(),
            MAX_ABS_MOMENTUM_BPS
        );
    }

    #[test]
    fn fill_price_floor() {
        assert_eq!(fill_price(1_000, 500).unwrap(), 950);
        assert_eq!(fill_price(999, 1_000).unwrap(), 899);
        assert!(fill_price(1, 10_000).is_err());
    }

    #[test]
    fn monotone_in_momentum() {
        let p = DiscountParams::default();
        let mut prev = 0;
        for m in (-50_000..=50_000).step_by(37) {
            let d = discount_bps(m, &p).unwrap();
            assert!(d >= prev);
            assert!((200..=1_200).contains(&d));
            prev = d;
        }
    }
}
