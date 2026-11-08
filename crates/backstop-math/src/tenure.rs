//! Tenure: a time-weighted holding score.
//!
//! `tenure(wallet, t) = Σ_lots amount × seconds_held`, maintained in O(1) as an
//! accumulator (`acc`) that is "materialised" on every balance change:
//!
//! ```text
//! tenure(t) = acc + balance × (t − last_ts)
//! ```
//!
//! Properties (all covered by tests):
//! * **Split invariance** – tenure is linear in `balance`, so ten wallets with
//!   ten tokens accrue exactly what one wallet with a hundred tokens accrues.
//! * **Inbound tokens start at zero** – receiving tokens adds balance but no
//!   accumulated tenure.
//! * **Reset on exit** – any sell or outbound wallet-to-wallet transfer sets
//!   `acc = 0` (the whole wallet's tenure, as specified).
//! * **Monotone** – `acc` never decreases except on a reset.
//! * **Absorb transfer** – an absorber may be credited an `extra` amount of
//!   tenure (40 % of the seller's lot tenure, computed by the caller).

use crate::error::{MathError, MathResult, OrOverflow};
use crate::u256::mul_div_floor;
use crate::BPS;

pub const SECONDS_PER_DAY: u64 = 86_400;

/// Per-wallet tenure state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Tenure {
    /// Tracked token balance (base units) across all of the wallet's accounts.
    pub balance: u64,
    /// Accumulated token-seconds as of `last_ts`.
    pub acc: u128,
    /// Unix timestamp at which `acc` was last materialised.
    pub last_ts: i64,
}

impl Tenure {
    pub fn new(now: i64) -> Self {
        Self {
            balance: 0,
            acc: 0,
            last_ts: now,
        }
    }

    /// Seconds elapsed since the last update. Clock regressions are treated as
    /// zero elapsed time (Solana's clock is not strictly monotonic).
    #[inline]
    fn elapsed(&self, now: i64) -> u64 {
        if now > self.last_ts {
            (now - self.last_ts) as u64
        } else {
            0
        }
    }

    /// Tenure (token-seconds) at `now` without mutating state.
    pub fn tenure_at(&self, now: i64) -> MathResult<u128> {
        let accrued = (self.balance as u128)
            .checked_mul(self.elapsed(now) as u128)
            .or_overflow()?;
        self.acc.checked_add(accrued).or_overflow()
    }

    /// Fold accrued tenure into `acc` and advance `last_ts` (never backwards).
    pub fn materialize(&mut self, now: i64) -> MathResult<()> {
        self.acc = self.tenure_at(now)?;
        if now > self.last_ts {
            self.last_ts = now;
        }
        Ok(())
    }

    /// Tokens received (buy or inbound transfer): they start at tenure 0.
    pub fn on_inbound(&mut self, amount: u64, now: i64) -> MathResult<()> {
        self.materialize(now)?;
        self.balance = self.balance.checked_add(amount).or_overflow()?;
        Ok(())
    }

    /// Tokens leaving the wallet (sell, offer escrow, outbound transfer, burn):
    /// tenure resets to zero. The tracked balance saturates at zero because it
    /// may legitimately under-count tokens that arrived before registration.
    pub fn on_outbound_reset(&mut self, amount: u64, now: i64) -> MathResult<()> {
        self.materialize(now)?;
        self.balance = self.balance.saturating_sub(amount);
        self.acc = 0;
        Ok(())
    }

    /// Credit extra tenure (absorb transfer). Monotone increase.
    pub fn credit(&mut self, extra: u128, now: i64) -> MathResult<()> {
        self.materialize(now)?;
        self.acc = self.acc.checked_add(extra).or_overflow()?;
        Ok(())
    }

    /// Resynchronise the tracked balance from a verified on-chain sum. New
    /// tokens (if any) start at tenure 0; a lower value is treated as an exit.
    pub fn resync(&mut self, verified_balance: u64, now: i64) -> MathResult<()> {
        if verified_balance >= self.balance {
            let delta = verified_balance - self.balance;
            self.on_inbound(delta, now)
        } else {
            let delta = self.balance - verified_balance;
            self.on_outbound_reset(delta, now)
        }
    }

    /// Tenure attributable to `amount` tokens of this wallet (pro-rata share of
    /// the wallet's total tenure). Used to price the tenure an offer carries.
    pub fn lot_tenure(&self, amount: u64, now: i64) -> MathResult<u128> {
        if self.balance == 0 || amount == 0 {
            return Ok(0);
        }
        let amount = amount.min(self.balance);
        mul_div_floor(self.tenure_at(now)?, amount as u128, self.balance as u128)
    }

    /// Average holding age in seconds (`tenure / balance`).
    pub fn avg_age_secs(&self, now: i64) -> MathResult<u64> {
        if self.balance == 0 {
            return Ok(0);
        }
        let age = self.tenure_at(now)? / self.balance as u128;
        Ok(u64::try_from(age).unwrap_or(u64::MAX))
    }

    /// `tenure_multiplier = 1 + extra × min(avg_age / cap, 1)` in bps
    /// (default extra = 2.0 → range 1.0–3.0, i.e. 10_000–30_000 bps).
    pub fn multiplier_bps(&self, now: i64, cap_secs: u64, extra_bps: u32) -> MathResult<u64> {
        if cap_secs == 0 {
            return Err(MathError::InvalidParameter);
        }
        let age = self.avg_age_secs(now)?.min(cap_secs);
        let extra = mul_div_floor(extra_bps as u128, age as u128, cap_secs as u128)? as u64;
        Ok(BPS + extra)
    }
}

/// `amount × bps / 10_000`, floored, for tenure transfer shares.
pub fn apply_bps_u128(amount: u128, bps: u32) -> MathResult<u128> {
    mul_div_floor(amount, bps as u128, BPS as u128)
}

#[cfg(test)]
mod tests {
    use super::*;

    const DAY: i64 = SECONDS_PER_DAY as i64;

    #[test]
    fn accrues_linearly() {
        let mut t = Tenure::new(0);
        t.on_inbound(100, 0).unwrap();
        assert_eq!(t.tenure_at(10).unwrap(), 1_000);
        t.on_inbound(50, 10).unwrap();
        assert_eq!(t.tenure_at(20).unwrap(), 1_000 + 150 * 10);
    }

    #[test]
    fn split_invariant() {
        let mut one = Tenure::new(0);
        one.on_inbound(100, 0).unwrap();
        let mut ten: Vec<Tenure> = (0..10).map(|_| Tenure::new(0)).collect();
        for w in ten.iter_mut() {
            w.on_inbound(10, 0).unwrap();
        }
        let sum: u128 = ten.iter().map(|w| w.tenure_at(12_345).unwrap()).sum();
        assert_eq!(sum, one.tenure_at(12_345).unwrap());
    }

    #[test]
    fn outbound_resets() {
        let mut t = Tenure::new(0);
        t.on_inbound(100, 0).unwrap();
        t.on_outbound_reset(1, 50).unwrap();
        assert_eq!(t.acc, 0);
        assert_eq!(t.balance, 99);
        assert_eq!(t.tenure_at(60).unwrap(), 990);
    }

    #[test]
    fn outbound_saturates() {
        let mut t = Tenure::new(0);
        t.on_inbound(10, 0).unwrap();
        t.on_outbound_reset(25, 1).unwrap();
        assert_eq!(t.balance, 0);
    }

    #[test]
    fn multiplier_range() {
        let mut t = Tenure::new(0);
        t.on_inbound(1_000, 0).unwrap();
        let cap = 90 * SECONDS_PER_DAY;
        assert_eq!(t.multiplier_bps(0, cap, 20_000).unwrap(), 10_000);
        assert_eq!(t.multiplier_bps(45 * DAY, cap, 20_000).unwrap(), 20_000);
        assert_eq!(t.multiplier_bps(90 * DAY, cap, 20_000).unwrap(), 30_000);
        assert_eq!(t.multiplier_bps(400 * DAY, cap, 20_000).unwrap(), 30_000);
    }

    #[test]
    fn lot_tenure_pro_rata() {
        let mut t = Tenure::new(0);
        t.on_inbound(100, 0).unwrap();
        assert_eq!(t.lot_tenure(25, 100).unwrap(), 2_500);
        assert_eq!(t.lot_tenure(1_000, 100).unwrap(), 10_000); // capped at balance
    }

    #[test]
    fn clock_regression_is_harmless() {
        let mut t = Tenure::new(100);
        t.on_inbound(10, 100).unwrap();
        t.materialize(90).unwrap();
        assert_eq!(t.last_ts, 100);
        assert_eq!(t.acc, 0);
    }

    #[test]
    fn resync_up_and_down() {
        let mut t = Tenure::new(0);
        t.on_inbound(10, 0).unwrap();
        t.resync(30, 10).unwrap();
        assert_eq!(t.balance, 30);
        assert_eq!(t.acc, 100);
        t.resync(5, 20).unwrap();
        assert_eq!(t.balance, 5);
        assert_eq!(t.acc, 0);
    }
}
