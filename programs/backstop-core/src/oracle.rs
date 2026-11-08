//! SOL/quote reference price used to bound keeper fee swaps (Jupiter route
//! poisoning defence, see THREAT_MODEL.md).

use anchor_lang::prelude::*;
use backstop_math::u256::mul_div_floor;
use backstop_math::BPS;

use crate::errors::CoreError;
use crate::state::OracleConfig;

pub const LAMPORTS_PER_SOL: u128 = 1_000_000_000;

/// Quote base units per 1 SOL.
pub fn quote_per_sol(cfg: &OracleConfig, feed: Option<&AccountInfo>, now: i64) -> Result<u64> {
    match cfg.kind {
        0 => {
            require!(cfg.manual_quote_per_sol > 0, CoreError::OracleUnavailable);
            Ok(cfg.manual_quote_per_sol)
        }
        1 => {
            let ai = feed.ok_or(error!(CoreError::OracleUnavailable))?;
            require_keys_eq!(ai.key(), cfg.feed, CoreError::OracleUnavailable);
            pyth::read(ai, now, cfg.max_staleness_secs)
        }
        _ => err!(CoreError::OracleUnavailable),
    }
}

/// Minimum acceptable lamports for selling `quote_in` quote units.
pub fn min_lamports_out(quote_in: u64, quote_per_sol: u64, slippage_bps: u16) -> Result<u64> {
    let fair = mul_div_floor(quote_in as u128, LAMPORTS_PER_SOL, quote_per_sol as u128).map_err(|_| error!(CoreError::MathOverflow))?;
    let min = mul_div_floor(fair, (BPS - slippage_bps as u64) as u128, BPS as u128).map_err(|_| error!(CoreError::MathOverflow))?;
    u64::try_from(min).map_err(|_| error!(CoreError::MathOverflow))
}

/// Minimum acceptable quote units for selling `lamports_in`.
pub fn min_quote_out(lamports_in: u64, quote_per_sol: u64, slippage_bps: u16) -> Result<u64> {
    let fair = mul_div_floor(lamports_in as u128, quote_per_sol as u128, LAMPORTS_PER_SOL).map_err(|_| error!(CoreError::MathOverflow))?;
    let min = mul_div_floor(fair, (BPS - slippage_bps as u64) as u128, BPS as u128).map_err(|_| error!(CoreError::MathOverflow))?;
    u64::try_from(min).map_err(|_| error!(CoreError::MathOverflow))
}

/// Minimal Pyth `PriceUpdateV2` reader (pull oracle). Enabled with the
/// `pyth` feature; otherwise Pyth configs are rejected.
mod pyth {
    use super::*;

    #[cfg(feature = "pyth")]
    pub fn read(ai: &AccountInfo, now: i64, max_staleness: u32) -> Result<u64> {
        // Layout: disc(8) | write_authority(32) | verification_level(1 or 2)
        //         | feed_id(32) | price i64 | conf u64 | exponent i32
        //         | publish_time i64 | prev_publish_time i64 | ema_price i64 | ema_conf u64 | posted_slot u64
        const RECEIVER: Pubkey = Pubkey::from_str_const("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");
        require_keys_eq!(*ai.owner, RECEIVER, CoreError::OracleUnavailable);
        let d = ai.try_borrow_data()?;
        require!(d.len() >= 8 + 32 + 1, CoreError::OracleUnavailable);
        let mut o = 8 + 32;
        // verification level: 0 = Partial{num_signatures: u8}, 1 = Full
        o += if d[o] == 0 { 2 } else { 1 };
        // Only fully verified updates are accepted.
        require!(d[8 + 32] == 1, CoreError::OracleUnavailable);
        o += 32; // feed id
        let rd = |off: usize, n: usize| -> Result<&[u8]> { d.get(off..off + n).ok_or(error!(CoreError::OracleUnavailable)) };
        let price = i64::from_le_bytes(rd(o, 8)?.try_into().unwrap());
        let conf = u64::from_le_bytes(rd(o + 8, 8)?.try_into().unwrap());
        let expo = i32::from_le_bytes(rd(o + 16, 4)?.try_into().unwrap());
        let publish_time = i64::from_le_bytes(rd(o + 20, 8)?.try_into().unwrap());
        require!(price > 0 && (conf as i128) * 50 < price as i128, CoreError::OracleUnavailable); // conf < 2 %
        require!(now - publish_time <= max_staleness as i64, CoreError::OracleUnavailable);
        // price × 10^expo USD per SOL → quote base units (USDC, 6 decimals)
        let scale = 6 + expo;
        let v = if scale >= 0 {
            (price as u128).checked_mul(10u128.pow(scale as u32))
        } else {
            Some(price as u128 / 10u128.pow((-scale) as u32))
        };
        v.and_then(|x| u64::try_from(x).ok()).ok_or(error!(CoreError::OracleUnavailable))
    }

    #[cfg(not(feature = "pyth"))]
    pub fn read(_ai: &AccountInfo, _now: i64, _max_staleness: u32) -> Result<u64> {
        err!(CoreError::OracleUnavailable)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounds() {
        // 150 USDC/SOL, swapping 1_500 USDC → ≥ 9.95 SOL at 0.5 % slippage
        let q = 150_000_000;
        assert_eq!(min_lamports_out(1_500_000_000, q, 50).unwrap(), 9_950_000_000);
        assert_eq!(min_quote_out(10_000_000_000, q, 50).unwrap(), 1_492_500_000);
    }
}
