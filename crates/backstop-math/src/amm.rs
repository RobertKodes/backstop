//! Constant-product AMM math with protocol fees taken in the quote token.
//!
//! The pool never keeps fees in its reserves (they are routed to the fee
//! vault), so the invariant `k = base × quote` must be non-decreasing across
//! every swap (rounding favours the pool).

use crate::error::{MathError, MathResult, OrOverflow};
use crate::fees::fee_ceil;
use crate::u256::{mul_div_floor, U256};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SwapResult {
    /// Amount the pool receives into its reserve (excludes the fee).
    pub reserve_in: u64,
    /// Amount the pool pays out of its reserve (before fee for sells).
    pub reserve_out: u64,
    /// Fee in quote units.
    pub fee: u64,
    /// Net amount delivered to the trader.
    pub user_out: u64,
}

/// Buy: trader pays `quote_in` (gross, fee included) and receives base.
pub fn buy(
    quote_in: u64,
    base_reserve: u64,
    quote_reserve: u64,
    fee_bps: u32,
) -> MathResult<SwapResult> {
    if base_reserve == 0 || quote_reserve == 0 {
        return Err(MathError::InsufficientLiquidity);
    }
    let fee = fee_ceil(quote_in, fee_bps)?;
    let net_in = quote_in.checked_sub(fee).or_overflow()?;
    let out = mul_div_floor(
        base_reserve as u128,
        net_in as u128,
        (quote_reserve as u128) + net_in as u128,
    )? as u64;
    if out == 0 || out >= base_reserve {
        return Err(MathError::InsufficientLiquidity);
    }
    Ok(SwapResult {
        reserve_in: net_in,
        reserve_out: out,
        fee,
        user_out: out,
    })
}

/// Sell: trader pays `base_in` and receives quote net of the fee.
pub fn sell(
    base_in: u64,
    base_reserve: u64,
    quote_reserve: u64,
    fee_bps: u32,
) -> MathResult<SwapResult> {
    if base_reserve == 0 || quote_reserve == 0 {
        return Err(MathError::InsufficientLiquidity);
    }
    let gross = mul_div_floor(
        quote_reserve as u128,
        base_in as u128,
        (base_reserve as u128) + base_in as u128,
    )? as u64;
    if gross >= quote_reserve {
        return Err(MathError::InsufficientLiquidity);
    }
    let fee = fee_ceil(gross, fee_bps)?;
    let user_out = gross.checked_sub(fee).or_overflow()?;
    Ok(SwapResult {
        reserve_in: base_in,
        reserve_out: gross,
        fee,
        user_out,
    })
}

/// Largest gross quote input whose fee-free base output does not exceed
/// `max_base_out` (used to size Return-Ticket purchases).
pub fn max_quote_for_base_out(
    max_base_out: u64,
    base_reserve: u64,
    quote_reserve: u64,
) -> MathResult<u64> {
    if max_base_out >= base_reserve {
        return Err(MathError::InsufficientLiquidity);
    }
    // out = B·q/(Q+q) ≤ m  ⇔  q ≤ m·Q/(B−m)
    let q = mul_div_floor(
        max_base_out as u128,
        quote_reserve as u128,
        (base_reserve - max_base_out) as u128,
    )?;
    u64::try_from(q).map_err(|_| MathError::Overflow)
}

/// `k = base × quote` as U256 for invariant checks.
pub fn k(base: u64, quote: u64) -> U256 {
    U256::from(base) * U256::from(quote)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buy_sell_basic() {
        let b = buy(1_000, 1_000_000, 1_000_000, 300).unwrap();
        assert_eq!(b.fee, 30);
        assert_eq!(b.reserve_in, 970);
        assert_eq!(b.user_out, 969);
        let s = sell(1_000, 1_000_000, 1_000_000, 300).unwrap();
        assert_eq!(s.reserve_out, 999);
        assert_eq!(s.fee, 30);
        assert_eq!(s.user_out, 969);
    }

    #[test]
    fn k_never_decreases() {
        let (mut b, mut q) = (1_000_000_000u64, 50_000_000u64);
        for i in 1..200u64 {
            let k0 = k(b, q);
            if i % 2 == 0 {
                let r = buy(i * 1_000, b, q, 300).unwrap();
                q += r.reserve_in;
                b -= r.reserve_out;
            } else {
                let r = sell(i * 10_000, b, q, 300).unwrap();
                b += r.reserve_in;
                q -= r.reserve_out;
            }
            assert!(k(b, q) >= k0);
        }
    }

    #[test]
    fn ticket_sizing() {
        let (b, q) = (1_000_000u64, 2_000_000u64);
        let qmax = max_quote_for_base_out(10_000, b, q).unwrap();
        let out = buy(qmax, b, q, 0).unwrap().user_out;
        assert!(out <= 10_000);
        assert!(out >= 9_999);
    }
}
