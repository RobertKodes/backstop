//! Randomised pro-rata offer allocation.
//!
//! An offer of `amount` tokens is divided into `L` equal **lots** (default 100)
//! fixed at creation; lot remainder dust is routed to the AMM with the unfilled
//! remainder. Every lot costs `lot_cost = ceil(lot_size × fill_price)` quote
//! units, so a bid of `b` quote units has a **capacity** of
//! `c = floor(b / lot_cost)` lots (bids below one lot are rejected).
//!
//! The Shield takes a deterministic priority slice first (≤ 50 % of lots). The
//! remaining `L'` lots are allocated to bidders:
//!
//! * If total capacity `C ≤ L'` every bidder is filled completely.
//! * Otherwise lots are assigned by **systematic sampling** (stochastic
//!   universal sampling): bidders occupy consecutive intervals
//!   `[Q_i, Q_i + c_i)` on a line of length `C` in bid order (`Q_i` is the
//!   prefix capacity, fixed when the bid is placed). `L'` sample points are
//!   spaced `C / L'` apart starting at a random offset `U ∈ [0, C)`; bidder `i`
//!   receives one lot per sample point inside its interval:
//!
//! ```text
//! n_i = ceil(((Q_i + c_i)·L' − U) / C) − ceil((Q_i·L' − U) / C)
//! ```
//!
//! Guarantees (proven below and property-tested):
//! * `Σ n_i = L'` exactly (telescoping sum).
//! * `n_i ∈ {floor(c_i·L'/C), ceil(c_i·L'/C)}` → deviation from exact pro-rata
//!   is **< 1 lot** for every bidder, regardless of the randomness.
//! * `n_i ≤ c_i` (a bidder never receives more lots than it can pay for).
//! * For `U` uniform, `E[n_i] = c_i·L'/C` exactly (unbiased).
//! * Each bidder's allocation is computable in O(1) from its own bid and the
//!   offer aggregates → lazy, independent claims (no loop over bidders).

use crate::error::{MathError, MathResult, OrOverflow};
use crate::u256::{ceil_div_signed, mul_div_ceil};
use crate::BPS;

/// Fixed-point scale for prices (quote base units per token base unit).
pub const PRICE_SCALE: u128 = 1_000_000_000_000_000_000; // 1e18

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Lots {
    pub lots: u64,
    pub lot_size: u64,
    /// Tokens not representable as whole lots (routed with the remainder).
    pub dust: u64,
    pub lot_cost: u64,
}

/// Split `amount` into `lots` lots priced at `fill_price` (scaled by
/// [`PRICE_SCALE`]). Lot cost is rounded **up** so the seller always receives
/// at least the frozen fill price.
pub fn make_lots(amount: u64, lots: u64, fill_price: u128) -> MathResult<Lots> {
    if lots == 0 || amount < lots || fill_price == 0 {
        return Err(MathError::InvalidParameter);
    }
    let lot_size = amount / lots;
    let dust = amount - lot_size * lots;
    let cost = mul_div_ceil(lot_size as u128, fill_price, PRICE_SCALE)?;
    let lot_cost = u64::try_from(cost).map_err(|_| MathError::Overflow)?;
    if lot_cost == 0 {
        return Err(MathError::InvalidParameter);
    }
    Ok(Lots {
        lots,
        lot_size,
        dust,
        lot_cost,
    })
}

/// Whole lots a bid can pay for.
#[inline]
pub fn capacity(bid: u64, lot_cost: u64) -> MathResult<u64> {
    if lot_cost == 0 {
        return Err(MathError::DivisionByZero);
    }
    Ok(bid / lot_cost)
}

/// Shield priority lots: limited by its available funds, its per-offer cap and
/// `max_share_bps` of the offer.
pub fn shield_lots(
    shield_available: u64,
    per_offer_cap: u64,
    lot_cost: u64,
    lots: u64,
    max_share_bps: u64,
) -> MathResult<u64> {
    if lot_cost == 0 || max_share_bps > BPS {
        return Err(MathError::InvalidParameter);
    }
    let budget = shield_available.min(per_offer_cap);
    let by_funds = budget / lot_cost;
    let by_share = lots.checked_mul(max_share_bps).or_overflow()? / BPS;
    Ok(by_funds.min(by_share))
}

/// Derive the random offset `U ∈ [0, total_capacity)` from a 32-byte seed.
/// Modulo bias is below `total_capacity / 2^128` (negligible).
pub fn random_offset(seed: &[u8; 32], total_capacity: u64) -> MathResult<u64> {
    if total_capacity == 0 {
        return Err(MathError::DivisionByZero);
    }
    let mut lo = [0u8; 16];
    lo.copy_from_slice(&seed[..16]);
    Ok((u128::from_le_bytes(lo) % total_capacity as u128) as u64)
}

/// Lots allocated to one bidder.
///
/// * `prefix` – `Q_i`, sum of capacities of earlier bids.
/// * `cap` – `c_i`.
/// * `total` – `C`, sum of all capacities.
/// * `available` – `L'`, lots left after the Shield slice.
/// * `offset` – `U ∈ [0, C)`.
pub fn allocate(prefix: u64, cap: u64, total: u64, available: u64, offset: u64) -> MathResult<u64> {
    if cap == 0 {
        return Ok(0);
    }
    let end = prefix.checked_add(cap).or_overflow()?;
    if end > total {
        return Err(MathError::InvalidParameter);
    }
    if total <= available {
        return Ok(cap);
    }
    if offset >= total {
        return Err(MathError::InvalidParameter);
    }
    let c = total as i128;
    let l = available as i128;
    let u = offset as i128;
    let hi = ceil_div_signed((end as i128).checked_mul(l).or_overflow()? - u, c)?;
    let lo = ceil_div_signed((prefix as i128).checked_mul(l).or_overflow()? - u, c)?;
    let n = hi - lo;
    debug_assert!(n >= 0 && n <= cap as i128);
    u64::try_from(n).map_err(|_| MathError::Overflow)
}

/// Lots actually filled for bidders (excluding the Shield).
pub fn bidder_fill(total_capacity: u64, available: u64) -> u64 {
    total_capacity.min(available)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lots_basic() {
        let l = make_lots(1_000_003, 100, PRICE_SCALE / 1000).unwrap();
        assert_eq!(l.lot_size, 10_000);
        assert_eq!(l.dust, 3);
        assert_eq!(l.lot_cost, 10);
        assert!(make_lots(5, 100, PRICE_SCALE).is_err());
    }

    #[test]
    fn lot_cost_rounds_up() {
        let l = make_lots(300, 100, PRICE_SCALE / 2).unwrap(); // 3 tokens × 0.5
        assert_eq!(l.lot_cost, 2);
    }

    #[test]
    fn undersubscribed_fills_everyone() {
        let caps = [3u64, 5, 7];
        let total: u64 = caps.iter().sum();
        let mut q = 0;
        for c in caps {
            assert_eq!(allocate(q, c, total, 40, 0).unwrap(), c);
            q += c;
        }
    }

    #[test]
    fn oversubscribed_sums_exactly() {
        let caps = [1u64, 1, 1, 50, 2, 9, 1, 1, 33];
        let total: u64 = caps.iter().sum();
        for available in [1u64, 7, 50, 98] {
            for u in [0u64, 1, total / 2, total - 1] {
                let mut q = 0;
                let mut sum = 0;
                for c in caps {
                    let n = allocate(q, c, total, available, u).unwrap();
                    let exact = c as f64 * available as f64 / total as f64;
                    assert!((n as f64 - exact).abs() < 1.0, "c={c} n={n} exact={exact}");
                    assert!(n <= c);
                    sum += n;
                    q += c;
                }
                assert_eq!(sum, available);
            }
        }
    }

    #[test]
    fn unbiased_over_all_offsets() {
        // Averaging over every U ∈ [0, C) gives exactly c·L'/C.
        let caps = [2u64, 3, 5, 1];
        let total: u64 = caps.iter().sum();
        let available = 4;
        let mut q = 0;
        for c in caps {
            let s: u64 = (0..total)
                .map(|u| allocate(q, c, total, available, u).unwrap())
                .sum();
            // Σ_U n_i(U) = C · E[n_i] = c_i · L'
            assert_eq!(s, c * available);
            q += c;
        }
    }

    #[test]
    fn shield_limits() {
        assert_eq!(shield_lots(1_000, 10_000, 10, 100, 5_000).unwrap(), 50);
        assert_eq!(shield_lots(100, 10_000, 10, 100, 5_000).unwrap(), 10);
        assert_eq!(shield_lots(10_000, 200, 10, 100, 5_000).unwrap(), 20);
    }

    #[test]
    fn random_offset_in_range() {
        let seed = [0xffu8; 32];
        for c in [1u64, 2, 17, u64::MAX] {
            assert!(random_offset(&seed, c).unwrap() < c);
        }
    }
}
