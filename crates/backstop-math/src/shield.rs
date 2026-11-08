//! Shield Pool accounting — an adaptation of the Liquity Stability Pool
//! product/sum algorithm.
//!
//! * Depositors lock USDC (from their chest) for ≥ 30 days with a duration
//!   multiplier `m = lock_secs / min_lock_secs` (bps, capped).
//! * When an offer settles, the Shield pays `loss` USDC for `gain` tokens
//!   **atomically** (inside the settlement instruction). Every deposit shrinks
//!   by the same factor (product `P`) and earns tokens pro-rata (sum `S`).
//! * Fee rewards (10 % stream + early-withdraw penalties + redemption fees)
//!   accrue pro-rata to **current deposit × multiplier** (sum `G`).
//! * `P` is kept ≥ 1e9 via scale changes; a full depletion starts a new epoch.
//!   Sums are stored per (epoch, scale) in a small ring, as only the
//!   depositor's own scale and the next one carry non-negligible gains.
//!
//! Every rounding step favours the pool (depositors are paid floors and the
//! tracked totals stay ≥ the true sum of claims), so the vault stays solvent;
//! residual dust is swept by governance only after all positions close.

use crate::error::{MathError, MathResult, OrOverflow};
use crate::u256::{mul_div_ceil, mul_div_floor, to_u128, U256};
use crate::BPS;

pub const DECIMAL: u128 = 1_000_000_000_000_000_000; // 1e18
pub const SCALE_FACTOR: u128 = 1_000_000_000; // 1e9
pub const SUM_RING: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct SumEntry {
    /// Sequence number of this (epoch, scale) pair; `u64::MAX` = empty.
    pub seq: u64,
    pub epoch: u64,
    pub scale: u64,
    /// Token gain sum.
    pub s: u128,
    /// Weighted reward sum.
    pub g: u128,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ShieldPool {
    /// Tracked compounded USDC deposits (≥ Σ of what depositors can withdraw).
    pub total_deposits: u64,
    /// Tracked Σ compounded deposit × multiplier / BPS (≥ true value).
    pub total_weighted: u128,
    pub p: u128,
    pub scale: u64,
    pub epoch: u64,
    /// Sequence number of the current (epoch, scale) pair.
    pub seq: u64,
    pub sums: [SumEntry; SUM_RING],
    /// Rewards received while no deposits existed (redistributed later).
    pub undistributed_rewards: u64,
}

impl Default for ShieldPool {
    fn default() -> Self {
        let mut sums = [SumEntry {
            seq: u64::MAX,
            ..Default::default()
        }; SUM_RING];
        sums[0] = SumEntry {
            seq: 0,
            epoch: 0,
            scale: 0,
            s: 0,
            g: 0,
        };
        Self {
            total_deposits: 0,
            total_weighted: 0,
            p: DECIMAL,
            scale: 0,
            epoch: 0,
            seq: 0,
            sums,
            undistributed_rewards: 0,
        }
    }
}

/// A depositor's position snapshot.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ShieldPosition {
    pub initial: u64,
    pub multiplier_bps: u32,
    pub p_snap: u128,
    pub s_snap: u128,
    pub g_snap: u128,
    pub seq_snap: u64,
    pub epoch_snap: u64,
    pub scale_snap: u64,
}

impl ShieldPool {
    fn idx(seq: u64) -> usize {
        (seq % SUM_RING as u64) as usize
    }

    fn entry(&self, seq: u64) -> Option<&SumEntry> {
        let e = &self.sums[Self::idx(seq)];
        (e.seq == seq).then_some(e)
    }

    fn current_mut(&mut self) -> &mut SumEntry {
        let i = Self::idx(self.seq);
        &mut self.sums[i]
    }

    fn start_pair(&mut self) {
        self.seq += 1;
        let i = Self::idx(self.seq);
        self.sums[i] = SumEntry {
            seq: self.seq,
            epoch: self.epoch,
            scale: self.scale,
            s: 0,
            g: 0,
        };
    }

    /// Weighted amount for a deposit.
    pub fn weighted(amount: u64, multiplier_bps: u32) -> MathResult<u128> {
        mul_div_floor(amount as u128, multiplier_bps as u128, BPS as u128)
    }

    /// Open a position (caller transfers `amount` USDC into the shield vault).
    pub fn deposit(&mut self, amount: u64, multiplier_bps: u32) -> MathResult<ShieldPosition> {
        if amount == 0 || (multiplier_bps as u64) < BPS {
            return Err(MathError::InvalidParameter);
        }
        self.total_deposits = self.total_deposits.checked_add(amount).or_overflow()?;
        self.total_weighted = self
            .total_weighted
            .checked_add(Self::weighted(amount, multiplier_bps)?)
            .or_overflow()?;
        let cur = self.sums[Self::idx(self.seq)];
        let pos = ShieldPosition {
            initial: amount,
            multiplier_bps,
            p_snap: self.p,
            s_snap: cur.s,
            g_snap: cur.g,
            seq_snap: self.seq,
            epoch_snap: self.epoch,
            scale_snap: self.scale,
        };
        // A deposit after rewards were stranded receives them going forward.
        if self.undistributed_rewards > 0 {
            let r = self.undistributed_rewards;
            self.undistributed_rewards = 0;
            self.distribute_rewards(r)?;
        }
        Ok(pos)
    }

    /// Current compounded USDC value of a position.
    pub fn compounded(&self, pos: &ShieldPosition) -> MathResult<u64> {
        if pos.initial == 0 || pos.epoch_snap < self.epoch {
            return Ok(0);
        }
        let diff = self.scale - pos.scale_snap;
        let v = match diff {
            0 => mul_div_floor(pos.initial as u128, self.p, pos.p_snap)?,
            1 => mul_div_floor(pos.initial as u128, self.p, pos.p_snap)? / SCALE_FACTOR,
            _ => 0,
        };
        // Precision guard (Liquity): ignore values below 1e-9 of the initial.
        if v < pos.initial as u128 / SCALE_FACTOR {
            return Ok(0);
        }
        u64::try_from(v).map_err(|_| MathError::Overflow)
    }

    fn portion(
        &self,
        pos: &ShieldPosition,
        pick: fn(&SumEntry) -> u128,
        snap: u128,
    ) -> MathResult<u128> {
        let first = match self.entry(pos.seq_snap) {
            Some(e) => pick(e).wrapping_sub(snap),
            None => 0, // fell out of the ring: deposit is ~0 by now
        };
        let second = match self.entry(pos.seq_snap + 1) {
            Some(e) if e.epoch == pos.epoch_snap => pick(e) / SCALE_FACTOR,
            _ => 0,
        };
        first.checked_add(second).or_overflow()
    }

    /// Token gains accrued by a position since its snapshot.
    pub fn token_gain(&self, pos: &ShieldPosition) -> MathResult<u64> {
        if pos.initial == 0 {
            return Ok(0);
        }
        let sum = self.portion(pos, |e| e.s, pos.s_snap)?;
        let g = U256::from(pos.initial) * U256::from(sum) / U256::from(pos.p_snap);
        u64::try_from(to_u128(g)?).map_err(|_| MathError::Overflow)
    }

    /// Weighted rewards accrued by a position since its snapshot.
    pub fn reward_gain(&self, pos: &ShieldPosition) -> MathResult<u64> {
        if pos.initial == 0 {
            return Ok(0);
        }
        let sum = self.portion(pos, |e| e.g, pos.g_snap)?;
        let w = Self::weighted(pos.initial, pos.multiplier_bps)?;
        let g = U256::from(w) * U256::from(sum) / U256::from(pos.p_snap);
        u64::try_from(to_u128(g)?).map_err(|_| MathError::Overflow)
    }

    /// Re-snapshot a position after paying out its gains (keeps principal).
    pub fn refresh(&self, pos: &mut ShieldPosition) -> MathResult<()> {
        let c = self.compounded(pos)?;
        let cur = self.sums[Self::idx(self.seq)];
        *pos = ShieldPosition {
            initial: c,
            multiplier_bps: pos.multiplier_bps,
            p_snap: self.p,
            s_snap: cur.s,
            g_snap: cur.g,
            seq_snap: self.seq,
            epoch_snap: self.epoch,
            scale_snap: self.scale,
        };
        Ok(())
    }

    /// Close a position after its lock: returns the compounded principal and
    /// removes it from the totals. Gains must be claimed first.
    pub fn withdraw(&mut self, pos: &ShieldPosition) -> MathResult<u64> {
        let c = self.compounded(pos)?;
        self.total_deposits = self.total_deposits.saturating_sub(c);
        self.total_weighted = self
            .total_weighted
            .saturating_sub(Self::weighted(c, pos.multiplier_bps)?);
        if self.total_deposits == 0 {
            self.total_weighted = 0;
        }
        Ok(c)
    }

    /// Absorb an offer slice: the Shield pays `loss` USDC and receives `gain`
    /// tokens. `loss ≤ total_deposits` is enforced.
    pub fn absorb(&mut self, loss: u64, gain: u64) -> MathResult<()> {
        let d = self.total_deposits;
        if loss == 0 && gain == 0 {
            return Ok(());
        }
        if d == 0 || loss > d {
            return Err(MathError::InsufficientLiquidity);
        }
        // Token gain per unit staked, pre-multiplied by P (which already
        // carries 1e18 precision): ΔS = floor(gain × P / D).
        let marginal = mul_div_floor(gain as u128, self.p, d as u128)?;
        let cur = self.current_mut();
        cur.s = cur.s.wrapping_add(marginal);

        // Loss per unit staked rounded up (favours the pool).
        let loss_per_unit = mul_div_ceil(loss as u128, DECIMAL, d as u128)?.min(DECIMAL);
        let factor = DECIMAL - loss_per_unit;
        let old_p = self.p;
        if factor == 0 {
            self.epoch += 1;
            self.scale = 0;
            self.p = DECIMAL;
            self.total_deposits = 0;
            self.total_weighted = 0;
            self.start_pair();
            return Ok(());
        }
        let next = mul_div_floor(old_p, factor, DECIMAL)?;
        if next < SCALE_FACTOR {
            self.p = to_u128(
                U256::from(old_p) * U256::from(factor) * U256::from(SCALE_FACTOR)
                    / U256::from(DECIMAL),
            )?;
            self.scale += 1;
            self.start_pair();
        } else {
            self.p = next;
        }
        if self.p == 0 {
            return Err(MathError::Underflow);
        }
        self.total_deposits = d - loss;
        // Shrink the weighted total by the same factor, rounding up.
        self.total_weighted = mul_div_ceil(self.total_weighted, factor, DECIMAL)?;
        Ok(())
    }

    /// Distribute USDC rewards pro-rata to weighted deposits.
    pub fn distribute_rewards(&mut self, amount: u64) -> MathResult<()> {
        if amount == 0 {
            return Ok(());
        }
        if self.total_weighted == 0 {
            self.undistributed_rewards = self
                .undistributed_rewards
                .checked_add(amount)
                .or_overflow()?;
            return Ok(());
        }
        // ΔG = floor(reward × P / total_weighted)
        let marginal = mul_div_floor(amount as u128, self.p, self.total_weighted)?;
        let cur = self.current_mut();
        cur.g = cur.g.wrapping_add(marginal);
        Ok(())
    }
}

/// Lock-duration multiplier in bps: `lock / min_lock`, capped at `max_bps`.
pub fn lock_multiplier_bps(lock_secs: u64, min_lock_secs: u64, max_bps: u32) -> MathResult<u32> {
    if min_lock_secs == 0 || lock_secs < min_lock_secs {
        return Err(MathError::InvalidParameter);
    }
    let m = mul_div_floor(lock_secs as u128, BPS as u128, min_lock_secs as u128)?;
    Ok(m.min(max_bps as u128) as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_depositor_absorbs() {
        let mut sp = ShieldPool::default();
        let pos = sp.deposit(1_000_000, 10_000).unwrap();
        sp.absorb(100_000, 5_000).unwrap();
        let c = sp.compounded(&pos).unwrap();
        assert!((899_999..=900_000).contains(&c), "{c}");
        let g = sp.token_gain(&pos).unwrap();
        assert!((4_999..=5_000).contains(&g), "{g}");
    }

    #[test]
    fn two_depositors_pro_rata() {
        let mut sp = ShieldPool::default();
        let a = sp.deposit(1_000_000, 10_000).unwrap();
        let b = sp.deposit(3_000_000, 10_000).unwrap();
        sp.absorb(400_000, 40_000).unwrap();
        assert!((899_999..=900_000).contains(&sp.compounded(&a).unwrap()));
        assert!((2_699_999..=2_700_000).contains(&sp.compounded(&b).unwrap()));
        assert!((9_999..=10_000).contains(&sp.token_gain(&a).unwrap()));
        assert!((29_999..=30_000).contains(&sp.token_gain(&b).unwrap()));
    }

    #[test]
    fn weighted_rewards() {
        let mut sp = ShieldPool::default();
        let a = sp.deposit(1_000_000, 10_000).unwrap(); // 30-day lock
        let b = sp.deposit(1_000_000, 30_000).unwrap(); // 90-day lock
        sp.distribute_rewards(40_000).unwrap();
        let ra = sp.reward_gain(&a).unwrap();
        let rb = sp.reward_gain(&b).unwrap();
        assert!(ra + rb <= 40_000);
        assert!((9_999..=10_000).contains(&ra), "{ra}");
        assert!((29_999..=30_000).contains(&rb), "{rb}");
    }

    #[test]
    fn full_depletion_starts_new_epoch() {
        let mut sp = ShieldPool::default();
        let a = sp.deposit(500, 10_000).unwrap();
        sp.absorb(500, 77).unwrap();
        assert_eq!(sp.compounded(&a).unwrap(), 0);
        assert!((76..=77).contains(&sp.token_gain(&a).unwrap()));
        let b = sp.deposit(1_000, 10_000).unwrap();
        sp.absorb(100, 10).unwrap();
        assert!((899..=900).contains(&sp.compounded(&b).unwrap()));
        assert_eq!(sp.compounded(&a).unwrap(), 0);
    }

    #[test]
    fn many_small_absorptions_scale_change() {
        let mut sp = ShieldPool::default();
        // 0.95^600 ≈ 4e-14 forces P below 1e9 (a scale change) while the
        // 1e18 deposit stays well above zero.
        let a = sp.deposit(1_000_000_000_000_000_000, 10_000).unwrap();
        let mut total_gain = 0u64;
        for _ in 0..600 {
            let d = sp.total_deposits;
            let loss = d / 20; // 5 % each time
            if loss == 0 {
                break;
            }
            sp.absorb(loss, 1_000).unwrap();
            total_gain += 1_000;
        }
        assert!(sp.scale >= 1);
        let c = sp.compounded(&a).unwrap();
        assert!(c <= sp.total_deposits);
        let g = sp.token_gain(&a).unwrap();
        assert!(g <= total_gain);
        assert!(
            g as f64 >= total_gain as f64 * 0.999,
            "g={g} total={total_gain}"
        );
    }

    #[test]
    fn rewards_without_depositors_are_kept() {
        let mut sp = ShieldPool::default();
        sp.distribute_rewards(100).unwrap();
        assert_eq!(sp.undistributed_rewards, 100);
        let a = sp.deposit(1_000, 10_000).unwrap();
        assert_eq!(sp.undistributed_rewards, 0);
        assert!((99..=100).contains(&sp.reward_gain(&a).unwrap()));
    }

    #[test]
    fn multipliers() {
        let d = 86_400;
        assert_eq!(
            lock_multiplier_bps(30 * d, 30 * d, 120_000).unwrap(),
            10_000
        );
        assert_eq!(
            lock_multiplier_bps(90 * d, 30 * d, 120_000).unwrap(),
            30_000
        );
        assert_eq!(
            lock_multiplier_bps(3_650 * d, 30 * d, 120_000).unwrap(),
            120_000
        );
        assert!(lock_multiplier_bps(29 * d, 30 * d, 120_000).is_err());
    }
}
