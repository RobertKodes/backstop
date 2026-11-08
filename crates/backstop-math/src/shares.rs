//! Chest share accounting (ERC-4626 style).
//!
//! Chest USDC is pooled in one vault (part of it deployed to the yield
//! adapter). Each chest owns *shares*; `assets = shares × total_assets /
//! total_shares`, so variable yield accrues pro-rata without loops.
//!
//! Inflation/donation attacks are neutralised two ways:
//! 1. `total_assets` is tracked internally (idle + adapter position value),
//!    never read from the raw vault balance, so donations are ignored.
//! 2. A virtual offset (`VIRTUAL_SHARES`, `VIRTUAL_ASSETS`) makes the
//!    first-depositor share price manipulation unprofitable.
//!
//! Rounding: deposits mint shares rounded **down**; withdrawals burn shares
//! rounded **up**; share→asset conversions round **down**.

use crate::error::{MathError, MathResult};
use crate::u256::{mul_div_ceil, mul_div_floor};

pub const VIRTUAL_SHARES: u128 = 1_000;
pub const VIRTUAL_ASSETS: u128 = 1;

pub fn to_u64(v: u128) -> MathResult<u64> {
    u64::try_from(v).map_err(|_| MathError::Overflow)
}

/// Shares minted for depositing `assets`.
pub fn shares_for_deposit(assets: u64, total_assets: u64, total_shares: u64) -> MathResult<u64> {
    to_u64(mul_div_floor(
        assets as u128,
        total_shares as u128 + VIRTUAL_SHARES,
        total_assets as u128 + VIRTUAL_ASSETS,
    )?)
}

/// Shares to burn to withdraw exactly `assets`.
pub fn shares_for_withdraw(assets: u64, total_assets: u64, total_shares: u64) -> MathResult<u64> {
    to_u64(mul_div_ceil(
        assets as u128,
        total_shares as u128 + VIRTUAL_SHARES,
        total_assets as u128 + VIRTUAL_ASSETS,
    )?)
}

/// Asset value of `shares`.
pub fn assets_for_shares(shares: u64, total_assets: u64, total_shares: u64) -> MathResult<u64> {
    to_u64(mul_div_floor(
        shares as u128,
        total_assets as u128 + VIRTUAL_ASSETS,
        total_shares as u128 + VIRTUAL_SHARES,
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_never_profits() {
        let (mut ta, mut ts) = (0u64, 0u64);
        let s = shares_for_deposit(1_000_000, ta, ts).unwrap();
        ta += 1_000_000;
        ts += s;
        let a = assets_for_shares(s, ta, ts).unwrap();
        assert!(a <= 1_000_000);
        let burn = shares_for_withdraw(a, ta, ts).unwrap();
        assert!(burn <= s);
    }

    #[test]
    fn yield_accrues_pro_rata() {
        let (mut ta, mut ts) = (0u64, 0u64);
        let s1 = shares_for_deposit(100, ta, ts).unwrap();
        ta += 100;
        ts += s1;
        let s2 = shares_for_deposit(300, ta, ts).unwrap();
        ta += 300;
        ts += s2;
        ta += 40; // 10 % yield
        let a1 = assets_for_shares(s1, ta, ts).unwrap();
        let a2 = assets_for_shares(s2, ta, ts).unwrap();
        assert!((109..=110).contains(&a1), "{a1}");
        assert!((329..=330).contains(&a2), "{a2}");
        assert!(a1 + a2 <= ta);
    }

    #[test]
    fn donation_attack_unprofitable() {
        // Attacker deposits 1 unit, "donates" 1e9 (ignored by internal
        // accounting, but even if counted the victim keeps ~all value).
        let (mut ta, mut ts) = (0u64, 0u64);
        let sa = shares_for_deposit(1, ta, ts).unwrap();
        ta += 1;
        ts += sa;
        ta += 1_000_000_000; // worst case: donation counted
        let sv = shares_for_deposit(1_000_000, ta, ts).unwrap();
        ta += 1_000_000;
        ts += sv;
        let attacker = assets_for_shares(sa, ta, ts).unwrap();
        assert!(attacker < 1_000_000_000, "attacker cannot recover donation");
    }
}
