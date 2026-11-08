//! Tenure-weighted epoch reward accumulator (no loops over holders).
//!
//! At each epoch boundary `j` the pending reward amount `p_j` is distributed
//! over the exact total weight `W_j` (see `weight.rs`):
//!
//! ```text
//! r_j  = floor(p_j · RS / W_j)                 (reward per weight unit, scaled)
//! R_j  = Σ_{i≤j} r_i          RT_j = Σ_{i≤j} r_i · i
//! ```
//!
//! A wallet with stored form `w(j) = min(α + β·j, c)` that last settled at
//! boundary `k0` has earned, through `k1`:
//!
//! ```text
//! Σ_{j=k0+1}^{k1} r_j·w(j) / RS
//!   = [ α·(R_m − R_k0) + β·(RT_m − RT_k0) + c·(R_k1 − R_m) ] / RS
//! ```
//!
//! where `m = clamp(cap_epoch − 1, k0, k1)` is the last linear boundary.
//! `R_m, RT_m` come from a ring buffer of per-epoch snapshots. Every term is an
//! exact integer, so the closed form equals the brute-force sum exactly; the
//! single floor at the end means wallets are never over-paid and
//! `Σ paid ≤ Σ distributed` (dust stays in the vault).
//!
//! `R` and `RT` use **wrapping** arithmetic (Uniswap-v2 technique): only
//! differences are ever consumed, which are correct modulo 2^128 as long as a
//! single wallet's settlement interval spans < 2^128 units — astronomically
//! beyond any realistic value. This guarantees the accumulator can never brick
//! token transfers through an overflow.

use crate::error::{MathError, MathResult, OrOverflow};
use crate::u256::{to_u128, U256};
use crate::weight::{LinearWeight, WeightTotals, NEVER, RING};

/// Reward scale (precision of `r_j`).
pub const REWARD_SCALE: u128 = 1_000_000_000_000_000_000_000_000; // 1e24

/// Maximum boundaries processed per call. A gap longer than this (≈128 days
/// at 6 h epochs with *zero* protocol activity) requires the permissionless
/// `advance_epochs` crank before transfers resume tracking.
pub const MAX_CATCH_UP: u64 = RING as u64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ScheduleEntry {
    pub epoch: u64,
    pub da: i128,
    pub db: i128,
    pub dc: i128,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Snapshot {
    pub epoch: u64,
    pub r: u128,
    pub rt: u128,
}

/// Storage abstraction so the same logic runs on a zero-copy account on-chain
/// and on plain arrays in tests.
pub trait RewardRing {
    fn schedule(&self, idx: usize) -> ScheduleEntry;
    fn set_schedule(&mut self, idx: usize, e: ScheduleEntry);
    fn snapshot(&self, idx: usize) -> Snapshot;
    fn set_snapshot(&mut self, idx: usize, s: Snapshot);
}

/// Heap-backed ring, used by tests and off-chain simulation.
#[derive(Clone)]
pub struct VecRing {
    pub schedule: Vec<ScheduleEntry>,
    pub snapshots: Vec<Snapshot>,
}

impl Default for VecRing {
    fn default() -> Self {
        Self {
            schedule: vec![ScheduleEntry::default(); RING],
            snapshots: vec![Snapshot::default(); RING],
        }
    }
}

impl RewardRing for VecRing {
    fn schedule(&self, idx: usize) -> ScheduleEntry {
        self.schedule[idx]
    }
    fn set_schedule(&mut self, idx: usize, e: ScheduleEntry) {
        self.schedule[idx] = e;
    }
    fn snapshot(&self, idx: usize) -> Snapshot {
        self.snapshots[idx]
    }
    fn set_snapshot(&mut self, idx: usize, s: Snapshot) {
        self.snapshots[idx] = s;
    }
}

#[inline]
fn slot(epoch: u64) -> usize {
    (epoch % RING as u64) as usize
}

/// Global accumulator state for one market.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct RewardGlobal {
    /// Last processed boundary.
    pub last_epoch: u64,
    pub totals: WeightTotals,
    /// Wrapping cumulative reward per weight (scaled by `REWARD_SCALE`).
    pub r: u128,
    /// Wrapping cumulative `Σ r_j · j`.
    pub rt: u128,
    /// Rewards deposited but not yet distributed at a boundary.
    pub pending: u64,
    /// Lifetime rewards deposited.
    pub total_deposited: u64,
    /// Lifetime rewards distributed at boundaries (paid out ≤ this).
    pub total_distributed: u64,
}

impl RewardGlobal {
    /// Process boundaries `last_epoch+1 ..= target`. Returns `Ok(true)` when
    /// fully caught up, `Ok(false)` if `max_steps` was hit first.
    pub fn advance_to<R: RewardRing>(
        &mut self,
        ring: &mut R,
        target: u64,
        max_steps: u64,
    ) -> MathResult<bool> {
        let mut steps = 0;
        while self.last_epoch < target {
            if steps == max_steps {
                return Ok(false);
            }
            let k = self.last_epoch + 1;
            let idx = slot(k);
            let e = ring.schedule(idx);
            if e.epoch == k {
                self.totals.a = self.totals.a.checked_add(e.da).or_overflow()?;
                self.totals.b = self.totals.b.checked_add(e.db).or_overflow()?;
                let c = (self.totals.c as i128).checked_add(e.dc).or_overflow()?;
                if c < 0 {
                    return Err(MathError::Underflow);
                }
                self.totals.c = c as u128;
                ring.set_schedule(
                    idx,
                    ScheduleEntry {
                        epoch: k,
                        ..Default::default()
                    },
                );
            }
            let w = self.totals.total_at(k)?;
            if self.pending > 0 && w > 0 {
                let rk =
                    to_u128(U256::from(self.pending) * U256::from(REWARD_SCALE) / U256::from(w))?;
                self.r = self.r.wrapping_add(rk);
                self.rt = self.rt.wrapping_add(rk.wrapping_mul(k as u128));
                self.total_distributed = self
                    .total_distributed
                    .checked_add(self.pending)
                    .or_overflow()?;
                self.pending = 0;
            }
            ring.set_snapshot(
                idx,
                Snapshot {
                    epoch: k,
                    r: self.r,
                    rt: self.rt,
                },
            );
            self.last_epoch = k;
            steps += 1;
        }
        Ok(true)
    }

    /// Deposit rewards for the next boundary. Caller must have caught up.
    pub fn deposit(&mut self, amount: u64) -> MathResult<()> {
        self.pending = self.pending.checked_add(amount).or_overflow()?;
        self.total_deposited = self.total_deposited.checked_add(amount).or_overflow()?;
        Ok(())
    }

    /// Add a wallet's contribution (computed with `processed_epoch == last_epoch`).
    pub fn add_weight<R: RewardRing>(&mut self, ring: &mut R, lw: &LinearWeight) -> MathResult<()> {
        if lw.is_zero() {
            return Ok(());
        }
        if lw.is_capped_by(self.last_epoch) {
            self.totals.c = self.totals.c.checked_add(lw.cap).or_overflow()?;
            return Ok(());
        }
        self.totals.a = self.totals.a.checked_add(lw.alpha).or_overflow()?;
        self.totals.b = self.totals.b.checked_add(lw.beta).or_overflow()?;
        if lw.cap_epoch != NEVER {
            self.schedule_delta(ring, lw.cap_epoch, -lw.alpha, -lw.beta, cap_i(lw)?)?;
        }
        Ok(())
    }

    /// Remove a wallet's previously added contribution.
    pub fn remove_weight<R: RewardRing>(
        &mut self,
        ring: &mut R,
        lw: &LinearWeight,
    ) -> MathResult<()> {
        if lw.is_zero() {
            return Ok(());
        }
        if lw.is_capped_by(self.last_epoch) {
            self.totals.c = self
                .totals
                .c
                .checked_sub(lw.cap)
                .ok_or(MathError::Underflow)?;
            return Ok(());
        }
        self.totals.a = self.totals.a.checked_sub(lw.alpha).or_overflow()?;
        self.totals.b = self.totals.b.checked_sub(lw.beta).or_overflow()?;
        if lw.cap_epoch != NEVER {
            self.schedule_delta(ring, lw.cap_epoch, lw.alpha, lw.beta, -cap_i(lw)?)?;
        }
        Ok(())
    }

    fn schedule_delta<R: RewardRing>(
        &self,
        ring: &mut R,
        epoch: u64,
        da: i128,
        db: i128,
        dc: i128,
    ) -> MathResult<()> {
        if epoch <= self.last_epoch || epoch - self.last_epoch >= RING as u64 {
            return Err(MathError::RingHorizonExceeded);
        }
        let idx = slot(epoch);
        let mut e = ring.schedule(idx);
        if e.epoch != epoch {
            // The slot belongs to an epoch ≤ last_epoch that was already
            // applied and cleared; it is safe to reuse.
            if e.epoch > self.last_epoch && (e.da != 0 || e.db != 0 || e.dc != 0) {
                return Err(MathError::RingHorizonExceeded);
            }
            e = ScheduleEntry {
                epoch,
                ..Default::default()
            };
        }
        e.da = e.da.checked_add(da).or_overflow()?;
        e.db = e.db.checked_add(db).or_overflow()?;
        e.dc = e.dc.checked_add(dc).or_overflow()?;
        ring.set_schedule(idx, e);
        Ok(())
    }

    fn lookup<R: RewardRing>(&self, ring: &R, epoch: u64) -> Option<(u128, u128)> {
        if epoch == self.last_epoch {
            return Some((self.r, self.rt));
        }
        if epoch > self.last_epoch || self.last_epoch - epoch >= RING as u64 {
            return None;
        }
        let s = ring.snapshot(slot(epoch));
        (s.epoch == epoch).then_some((s.r, s.rt))
    }
}

fn cap_i(lw: &LinearWeight) -> MathResult<i128> {
    i128::try_from(lw.cap).map_err(|_| MathError::Overflow)
}

/// Per-wallet reward checkpoint.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct UserRewards {
    pub last_epoch: u64,
    pub r_snap: u128,
    pub rt_snap: u128,
    /// Settled but unharvested rewards.
    pub pending: u64,
}

impl UserRewards {
    /// Checkpoint a newly registered wallet at the current global state.
    pub fn new_at(g: &RewardGlobal) -> Self {
        Self {
            last_epoch: g.last_epoch,
            r_snap: g.r,
            rt_snap: g.rt,
            pending: 0,
        }
    }
}

/// Settle rewards for `user` (whose stored form is `lw`) up to the global's
/// last processed boundary. Returns the newly earned amount.
pub fn settle<R: RewardRing>(
    user: &mut UserRewards,
    lw: &LinearWeight,
    g: &RewardGlobal,
    ring: &R,
) -> MathResult<u64> {
    let k0 = user.last_epoch;
    let k1 = g.last_epoch;
    if k1 <= k0 {
        return Ok(0);
    }
    let earned = if lw.is_zero() {
        0
    } else {
        let m = if lw.cap_epoch == 0 {
            k0
        } else if lw.cap_epoch == NEVER {
            k1
        } else {
            (lw.cap_epoch - 1).clamp(k0, k1)
        };
        let snap_m = if m == k0 {
            Some((user.r_snap, user.rt_snap))
        } else {
            g.lookup(ring, m)
        };
        match snap_m {
            Some((r_m, rt_m)) => {
                let d_r_lin = r_m.wrapping_sub(user.r_snap);
                let d_rt_lin = rt_m.wrapping_sub(user.rt_snap);
                let d_r_cap = g.r.wrapping_sub(r_m);
                let mut pos = U256::from(lw.beta.max(0) as u128) * U256::from(d_rt_lin)
                    + U256::from(lw.cap) * U256::from(d_r_cap);
                let neg = if lw.alpha >= 0 {
                    pos += U256::from(lw.alpha as u128) * U256::from(d_r_lin);
                    U256::zero()
                } else {
                    U256::from(lw.alpha.unsigned_abs()) * U256::from(d_r_lin)
                };
                let net = if pos > neg { pos - neg } else { U256::zero() };
                to_u128(net / U256::from(REWARD_SCALE))?
            }
            None => {
                // The last linear boundary fell out of the ring (wallet idle for
                // > RING epochs after capping). Conservative lower bound: pay the
                // capped weight only for the boundaries still in the ring. Never
                // over-pays; the unpaid remainder stays in the vault.
                let oldest = k1 - (RING as u64 - 1);
                let (r_o, _) = g.lookup(ring, oldest).ok_or(MathError::Unavailable)?;
                let d = g.r.wrapping_sub(r_o);
                to_u128(U256::from(lw.cap) * U256::from(d) / U256::from(REWARD_SCALE))?
            }
        }
    };
    let earned = u64::try_from(earned).map_err(|_| MathError::Overflow)?;
    user.pending = user.pending.checked_add(earned).or_overflow()?;
    user.last_epoch = k1;
    user.r_snap = g.r;
    user.rt_snap = g.rt;
    Ok(earned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tenure::{Tenure, SECONDS_PER_DAY};
    use crate::weight::{linear_weight, WeightParams};

    fn params() -> WeightParams {
        WeightParams {
            cap_secs: 90 * SECONDS_PER_DAY,
            extra_bps: 20_000,
            epoch_secs: 6 * 3600,
            genesis_ts: 0,
        }
    }

    #[test]
    fn single_holder_gets_everything() {
        let p = params();
        let mut ring = VecRing::default();
        let mut g = RewardGlobal::default();
        let mut t = Tenure::new(10);
        t.on_inbound(1_000, 10).unwrap();
        let lw = linear_weight(&t, 10, 0, &p).unwrap();
        g.add_weight(&mut ring, &lw).unwrap();
        let mut u = UserRewards::new_at(&g);
        g.deposit(1_000_000).unwrap();
        g.advance_to(&mut ring, 5, MAX_CATCH_UP).unwrap();
        let earned = settle(&mut u, &lw, &g, &ring).unwrap();
        assert!((999_999..=1_000_000).contains(&earned), "earned={earned}");
    }

    #[test]
    fn pending_rolls_over_when_no_weight() {
        let mut ring = VecRing::default();
        let mut g = RewardGlobal::default();
        g.deposit(500).unwrap();
        g.advance_to(&mut ring, 3, MAX_CATCH_UP).unwrap();
        assert_eq!(g.pending, 500);
        assert_eq!(g.total_distributed, 0);
    }

    #[test]
    fn catch_up_is_bounded() {
        let mut ring = VecRing::default();
        let mut g = RewardGlobal::default();
        assert!(!g.advance_to(&mut ring, 10_000, MAX_CATCH_UP).unwrap());
        assert_eq!(g.last_epoch, MAX_CATCH_UP);
    }

    #[test]
    fn three_x_multiplier_vs_new_holder() {
        // An old holder (capped, 3.0x) and a new holder (1.0x) with equal
        // balances should split ~3:1 at the first boundary.
        let p = params();
        let mut ring = VecRing::default();
        let mut g = RewardGlobal::default();
        let now = 100 * SECONDS_PER_DAY as i64;
        g.advance_to(&mut ring, p.epoch_at(now), MAX_CATCH_UP)
            .unwrap();
        let mut old = Tenure::new(0);
        old.on_inbound(1_000_000, 0).unwrap();
        old.materialize(now).unwrap();
        let mut new = Tenure::new(now);
        new.on_inbound(1_000_000, now).unwrap();
        let lw_old = linear_weight(&old, now, g.last_epoch, &p).unwrap();
        let lw_new = linear_weight(&new, now, g.last_epoch, &p).unwrap();
        g.add_weight(&mut ring, &lw_old).unwrap();
        g.add_weight(&mut ring, &lw_new).unwrap();
        let mut u_old = UserRewards::new_at(&g);
        let mut u_new = UserRewards::new_at(&g);
        g.deposit(4_000_000).unwrap();
        g.advance_to(&mut ring, g.last_epoch + 1, MAX_CATCH_UP)
            .unwrap();
        let eo = settle(&mut u_old, &lw_old, &g, &ring).unwrap();
        let en = settle(&mut u_new, &lw_new, &g, &ring).unwrap();
        assert!(eo + en <= 4_000_000);
        // The new holder has aged one epoch (6 h) by the boundary.
        let expected = 3.0 / (1.0 + 2.0 * (6.0 / 24.0) / 90.0);
        let ratio = eo as f64 / en as f64;
        assert!(
            (ratio - expected).abs() < 1e-4,
            "ratio {ratio} expected {expected}"
        );
    }
}
