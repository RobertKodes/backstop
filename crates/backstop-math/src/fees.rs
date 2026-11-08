//! Fee splitting and treasury redemption math.

use crate::error::{MathError, MathResult, OrOverflow};
use crate::u256::{mul_div_ceil, mul_div_floor};
use crate::BPS;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FeeSplitParams {
    /// Share credited to holder chests (default 7_000).
    pub chest_bps: u32,
    /// Share credited to Shield rewards (default 1_000).
    pub shield_bps: u32,
    /// Treasury receives the remainder (default 2_000).
    /// Share of the *gross* fee routed to the parent market (launchpad
    /// children: 3_000; BACKSTOP itself: 0).
    pub parent_bps: u32,
}

impl Default for FeeSplitParams {
    fn default() -> Self {
        Self {
            chest_bps: 7_000,
            shield_bps: 1_000,
            parent_bps: 0,
        }
    }
}

impl FeeSplitParams {
    pub fn validate(&self) -> MathResult<()> {
        if self.chest_bps as u64 + self.shield_bps as u64 > BPS || self.parent_bps as u64 > BPS {
            return Err(MathError::InvalidParameter);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct FeeSplit {
    pub parent: u64,
    pub chest: u64,
    pub shield: u64,
    pub treasury: u64,
}

impl FeeSplit {
    pub fn total(&self) -> u64 {
        self.parent + self.chest + self.shield + self.treasury
    }
}

/// Split `amount`; components always sum exactly to `amount` (the treasury
/// absorbs rounding).
pub fn split(amount: u64, p: &FeeSplitParams) -> MathResult<FeeSplit> {
    p.validate()?;
    let parent = mul_div_floor(amount as u128, p.parent_bps as u128, BPS as u128)? as u64;
    let rest = amount - parent;
    let chest = mul_div_floor(rest as u128, p.chest_bps as u128, BPS as u128)? as u64;
    let shield = mul_div_floor(rest as u128, p.shield_bps as u128, BPS as u128)? as u64;
    let treasury = rest
        .checked_sub(chest)
        .and_then(|r| r.checked_sub(shield))
        .ok_or(MathError::Underflow)?;
    Ok(FeeSplit {
        parent,
        chest,
        shield,
        treasury,
    })
}

/// `ceil(amount × bps / 10_000)` – fees round up.
pub fn fee_ceil(amount: u64, bps: u32) -> MathResult<u64> {
    if bps as u64 > BPS {
        return Err(MathError::InvalidParameter);
    }
    let f = mul_div_ceil(amount as u128, bps as u128, BPS as u128)?;
    u64::try_from(f).map_err(|_| MathError::Overflow)
}

/// Treasury redemption: burn `amount` tokens for their pro-rata SOL.
///
/// Returns `(gross_lamports, fee_lamports, net_lamports)` where
/// `gross = floor(amount × treasury / circulating)` and the fee is rounded up.
pub fn redemption(
    amount: u64,
    treasury_lamports: u64,
    circulating: u64,
    fee_bps: u32,
) -> MathResult<(u64, u64, u64)> {
    if circulating == 0 || amount > circulating {
        return Err(MathError::InvalidParameter);
    }
    let gross = mul_div_floor(
        amount as u128,
        treasury_lamports as u128,
        circulating as u128,
    )? as u64;
    let fee = fee_ceil(gross, fee_bps)?;
    let net = gross.checked_sub(fee).or_overflow()?;
    Ok((gross, fee, net))
}

/// Floor price in lamports per token, scaled by `PRICE_SCALE`.
pub fn floor_price(treasury_lamports: u64, circulating: u64) -> MathResult<u128> {
    if circulating == 0 {
        return Ok(0);
    }
    mul_div_floor(
        treasury_lamports as u128,
        crate::allocation::PRICE_SCALE,
        circulating as u128,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_split() {
        let s = split(1_000_000, &FeeSplitParams::default()).unwrap();
        assert_eq!(
            (s.chest, s.shield, s.treasury, s.parent),
            (700_000, 100_000, 200_000, 0)
        );
    }

    #[test]
    fn split_exact_with_rounding() {
        for a in [0u64, 1, 7, 999, 1_000_001, u64::MAX / 3] {
            let s = split(a, &FeeSplitParams::default()).unwrap();
            assert_eq!(s.total(), a);
        }
    }

    #[test]
    fn child_split() {
        let p = FeeSplitParams {
            parent_bps: 3_000,
            ..Default::default()
        };
        let s = split(1_000_000, &p).unwrap();
        assert_eq!(s.parent, 300_000);
        assert_eq!(s.chest, 490_000);
        assert_eq!(s.shield, 70_000);
        assert_eq!(s.treasury, 140_000);
    }

    #[test]
    fn redeem() {
        let (g, f, n) = redemption(1_000, 10_000, 100_000, 100).unwrap();
        assert_eq!((g, f, n), (100, 1, 99));
        assert!(redemption(1, 1, 0, 100).is_err());
    }
}
