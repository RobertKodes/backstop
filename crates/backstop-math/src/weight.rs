//! Chest-fee distribution weight.
//!
//! The spec defines `weight = balance × tenure_multiplier` with
//! `tenure_multiplier = 1 + 2 × min(avg_age / 90d, 1)`. Because the multiplier
//! grows continuously for *every* holder, a classic reward-per-share
//! accumulator (which requires piecewise-constant weights) cannot be used, and
//! looping over holders is forbidden.
//!
//! ## Exact piecewise-linear representation
//!
//! Rewards are distributed at discrete **epoch boundaries** `k` (time
//! `genesis + k × epoch_secs`). Between two checkpoints of a wallet, its weight
//! evaluated at boundary `k` is
//!
//! ```text
//! w(k) = min(α + β·k, c)
//! ```
//!
//! i.e. linear until it hits the cap `c = S·b·(1 + extra)` and constant after.
//! `α, β, c` are integers computed once at the checkpoint (rounded down) and
//! stored. The **global** total weight is maintained as
//! `W(k) = A + B·k + C` where `A = Σα`, `B = Σβ` over still-linear wallets and
//! `C = Σc` over capped wallets. A wallet's transition from linear to capped is
//! scheduled at its cap epoch `e` in a ring buffer (veCRV-style slope
//! schedule). Since global sums are exact sums of the stored per-wallet values,
//! `W(k) == Σ_wallets w(k)` holds *exactly* at every boundary — the property the
//! reward accumulator relies on (see `rewards.rs`, verified by property tests
//! against a brute-force model).
//!
//! Rounding of `α, β` makes the stored weight differ from the ideal
//! real-valued weight by less than `1 + k` weight units (out of ≥ `S·b`), i.e.
//! a relative error below `1e-6` for any wallet holding ≥ 1 base unit.

use crate::error::{MathError, MathResult, OrOverflow};
use crate::tenure::Tenure;
use crate::u256::{ceil_div, mul_div_floor, mul_div_floor_signed};
use crate::BPS;

/// Weight scale `S`: weight units per base-unit token at multiplier 1.0.
pub const WEIGHT_SCALE: u128 = 1_000_000;

/// Sentinel cap epoch: the wallet never reaches the cap (β == 0).
pub const NEVER: u64 = u64::MAX;

/// Ring-buffer length for the cap schedule and accumulator snapshots.
/// The cap of any wallet must be scheduled < `RING` epochs ahead, which the
/// parameter validation below guarantees (`cap_secs / epoch_secs + 3 < RING`).
pub const RING: usize = 512;

/// Parameters governing tenure → weight conversion for one market.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WeightParams {
    /// Average age at which the multiplier caps (default 90 days).
    pub cap_secs: u64,
    /// Multiplier above 1.0 reached at the cap, in bps (default 20_000 = +2.0).
    pub extra_bps: u32,
    /// Distribution epoch length (default 6 h). Immutable after genesis.
    pub epoch_secs: u64,
    /// Market genesis timestamp; boundary `k` is at `genesis + k·epoch_secs`.
    pub genesis_ts: i64,
}

impl WeightParams {
    pub fn validate(&self) -> MathResult<()> {
        if self.cap_secs == 0 || self.epoch_secs == 0 || self.extra_bps > 100_000 {
            return Err(MathError::InvalidParameter);
        }
        let horizon = self.cap_secs / self.epoch_secs + 3;
        if horizon >= RING as u64 {
            return Err(MathError::InvalidParameter);
        }
        Ok(())
    }

    /// Number of epoch boundaries that have passed at `now` (boundary 0 is
    /// genesis itself and never carries a distribution).
    pub fn epoch_at(&self, now: i64) -> u64 {
        if now <= self.genesis_ts {
            0
        } else {
            ((now - self.genesis_ts) as u64) / self.epoch_secs
        }
    }

    /// Timestamp of boundary `k`.
    pub fn boundary_ts(&self, k: u64) -> MathResult<i64> {
        let off = k.checked_mul(self.epoch_secs).or_overflow()?;
        self.genesis_ts
            .checked_add(i64::try_from(off).map_err(|_| MathError::Overflow)?)
            .or_overflow()
    }
}

/// A wallet's stored linear weight form, valid from the boundary after the
/// checkpoint epoch onwards.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct LinearWeight {
    pub alpha: i128,
    pub beta: i128,
    pub cap: u128,
    /// First boundary at which the weight equals `cap`. `0` = capped from the
    /// start; [`NEVER`] = never caps.
    pub cap_epoch: u64,
}

impl LinearWeight {
    pub const ZERO: LinearWeight = LinearWeight {
        alpha: 0,
        beta: 0,
        cap: 0,
        cap_epoch: 0,
    };

    /// Weight at boundary `k` (only meaningful for `k` after the checkpoint).
    pub fn weight_at(&self, k: u64) -> MathResult<u128> {
        if k >= self.cap_epoch {
            return Ok(self.cap);
        }
        let lin = self
            .alpha
            .checked_add(self.beta.checked_mul(k as i128).or_overflow()?)
            .or_overflow()?;
        // Mathematically lin ∈ [0, cap); clamp defensively.
        Ok(if lin <= 0 {
            0
        } else {
            (lin as u128).min(self.cap)
        })
    }

    pub fn is_zero(&self) -> bool {
        self.cap == 0 && self.alpha == 0 && self.beta == 0
    }

    /// Whether the wallet's contribution sits in the capped bucket `C` once
    /// the global accumulator has processed boundary `processed_epoch`.
    pub fn is_capped_by(&self, processed_epoch: u64) -> bool {
        self.cap_epoch == 0 || (self.cap_epoch != NEVER && self.cap_epoch <= processed_epoch)
    }
}

/// Compute the linear weight form of a wallet whose tenure has been
/// materialised at `now`, valid for boundaries `> processed_epoch`.
///
/// `processed_epoch` must be the global accumulator's last processed boundary,
/// which callers guarantee equals `params.epoch_at(now)` (catch-up first).
pub fn linear_weight(
    tenure: &Tenure,
    now: i64,
    processed_epoch: u64,
    params: &WeightParams,
) -> MathResult<LinearWeight> {
    let b = tenure.balance as u128;
    if b == 0 {
        return Ok(LinearWeight::ZERO);
    }
    let t_cap = params.cap_secs as u128;
    let extra = params.extra_bps as u128;
    let bps = BPS as u128;

    // Only tenure up to the cap matters; clamping keeps intermediates bounded.
    let tau0 = tenure
        .tenure_at(now)?
        .min(t_cap.checked_mul(b).or_overflow()?);

    // Ideal: w(t) = S·b + S·extra/(BPS·T) · (τ0 + b·(t − now)),  t_k = G + k·E.
    //   α = S·b + floor(S·extra·(τ0 + b·(G − now)) / (BPS·T))
    //   β = floor(S·extra·b·E / (BPS·T))
    let sb = WEIGHT_SCALE.checked_mul(b).or_overflow()?;
    let g_minus_now = (params.genesis_ts as i128)
        .checked_sub(now as i128)
        .or_overflow()?;
    let num_alpha = (tau0 as i128)
        .checked_add((b as i128).checked_mul(g_minus_now).or_overflow()?)
        .or_overflow()?;
    let scale_num = WEIGHT_SCALE.checked_mul(extra).or_overflow()?;
    let scale_den = bps.checked_mul(t_cap).or_overflow()?;
    let alpha = (sb as i128)
        .checked_add(mul_div_floor_signed(num_alpha, scale_num, scale_den)?)
        .or_overflow()?;
    let beta_u = mul_div_floor(
        scale_num.checked_mul(b).or_overflow()?,
        params.epoch_secs as u128,
        scale_den,
    )?;
    let beta = i128::try_from(beta_u).map_err(|_| MathError::Overflow)?;
    let cap = mul_div_floor(sb, bps + extra, bps)?;
    let cap_i = i128::try_from(cap).map_err(|_| MathError::Overflow)?;

    let next = processed_epoch.checked_add(1).or_overflow()?;
    let at_next = alpha
        .checked_add(beta.checked_mul(next as i128).or_overflow()?)
        .or_overflow()?;
    let cap_epoch = if at_next >= cap_i {
        0
    } else if beta == 0 {
        NEVER
    } else {
        // smallest k with α + β·k ≥ c  ⇒  k = ceil((c − α) / β)
        let need = cap_i.checked_sub(alpha).or_overflow()?;
        let k = ceil_div(need as u128, beta as u128)?;
        let k = u64::try_from(k).map_err(|_| MathError::Overflow)?;
        debug_assert!(k > next);
        if k - processed_epoch >= RING as u64 {
            return Err(MathError::RingHorizonExceeded);
        }
        k
    };
    Ok(LinearWeight {
        alpha,
        beta,
        cap,
        cap_epoch,
    })
}

/// Global weight sums. `W(k) = a + b·k + c`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct WeightTotals {
    pub a: i128,
    pub b: i128,
    pub c: u128,
}

impl WeightTotals {
    pub fn total_at(&self, k: u64) -> MathResult<u128> {
        let lin = self
            .a
            .checked_add(self.b.checked_mul(k as i128).or_overflow()?)
            .or_overflow()?;
        if lin < 0 {
            // Impossible when sums are consistent; surface as an error.
            return Err(MathError::Underflow);
        }
        (lin as u128).checked_add(self.c).or_overflow()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tenure::SECONDS_PER_DAY;

    fn params() -> WeightParams {
        WeightParams {
            cap_secs: 90 * SECONDS_PER_DAY,
            extra_bps: 20_000,
            epoch_secs: 6 * 3600,
            genesis_ts: 1_000_000,
        }
    }

    /// Ideal real-valued weight for comparison.
    fn ideal(t: &Tenure, at: i64, p: &WeightParams) -> f64 {
        let b = t.balance as f64;
        let tau = t.tenure_at(at).unwrap() as f64;
        let m = 1.0 + (p.extra_bps as f64 / 10_000.0) * (tau / (p.cap_secs as f64 * b)).min(1.0);
        WEIGHT_SCALE as f64 * b * m
    }

    #[test]
    fn validate_params() {
        assert!(params().validate().is_ok());
        let mut p = params();
        p.cap_secs = 200 * SECONDS_PER_DAY; // 800 epochs > ring
        assert!(p.validate().is_err());
    }

    #[test]
    fn fresh_wallet_grows_then_caps() {
        let p = params();
        let now = p.genesis_ts + 100;
        let mut t = Tenure::new(now);
        t.on_inbound(1_000_000_000, now).unwrap(); // 1 token
        let k0 = p.epoch_at(now);
        let lw = linear_weight(&t, now, k0, &p).unwrap();
        assert!(lw.cap_epoch > k0 + 1 && lw.cap_epoch != NEVER);
        // ~360 epochs to reach the 90-day cap
        assert!((359..=362).contains(&(lw.cap_epoch - k0)));
        for k in (k0 + 1)..(k0 + 400) {
            let w = lw.weight_at(k).unwrap() as f64;
            let id = ideal(&t, p.boundary_ts(k).unwrap(), &p);
            assert!((w - id).abs() / id < 1e-6, "k={k} w={w} ideal={id}");
        }
        assert_eq!(lw.weight_at(k0 + 1000).unwrap(), lw.cap);
        assert_eq!(lw.cap, 3 * WEIGHT_SCALE * 1_000_000_000);
    }

    #[test]
    fn old_wallet_is_capped_immediately() {
        let p = params();
        let mut t = Tenure::new(p.genesis_ts);
        t.on_inbound(5_000, p.genesis_ts).unwrap();
        let now = p.genesis_ts + 100 * SECONDS_PER_DAY as i64;
        t.materialize(now).unwrap();
        let lw = linear_weight(&t, now, p.epoch_at(now), &p).unwrap();
        assert_eq!(lw.cap_epoch, 0);
        assert_eq!(lw.weight_at(p.epoch_at(now) + 1).unwrap(), lw.cap);
    }

    #[test]
    fn zero_balance_is_zero() {
        let p = params();
        let t = Tenure::new(p.genesis_ts);
        let lw = linear_weight(&t, p.genesis_ts + 5, 0, &p).unwrap();
        assert!(lw.is_zero());
        assert_eq!(lw.weight_at(10).unwrap(), 0);
    }

    #[test]
    fn huge_supply_no_overflow() {
        let p = params();
        let now = p.genesis_ts + 30 * 365 * SECONDS_PER_DAY as i64;
        let mut t = Tenure::new(p.genesis_ts);
        t.on_inbound(u64::MAX, p.genesis_ts).unwrap();
        let lw = linear_weight(&t, now, p.epoch_at(now), &p).unwrap();
        assert_eq!(lw.cap_epoch, 0);
        let mut t2 = Tenure::new(now);
        t2.on_inbound(u64::MAX, now).unwrap();
        let lw2 = linear_weight(&t2, now, p.epoch_at(now), &p).unwrap();
        assert!(lw2.cap_epoch != 0 && lw2.cap_epoch != NEVER);
        let tot = WeightTotals {
            a: lw2.alpha,
            b: lw2.beta,
            c: lw.cap,
        };
        tot.total_at(lw2.cap_epoch - 1).unwrap();
    }
}
