//! Executable specifications for the two numerically critical algorithms —
//! the randomised lot allocator and the tenure-weighted reward accumulator.
//!
//! Each checker takes arbitrary input, runs the production code and compares
//! it with an independent brute-force model, returning `Err(description)` on
//! any discrepancy. The same checkers are driven by proptest on stable
//! (`tests/proptests.rs`, `FUZZ_CASES=…` for long runs) and by coverage-guided
//! libFuzzer targets on nightly (`fuzz/`).
//!
//! Compiled only with the `check` feature (never into on-chain programs).

extern crate std;

use std::format;
use std::string::String;
use std::vec::Vec;

use crate::allocation::{allocate, random_offset};
use crate::rewards::{settle, RewardGlobal, UserRewards, VecRing, REWARD_SCALE};
use crate::tenure::{Tenure, SECONDS_PER_DAY};
use crate::weight::{linear_weight, LinearWeight, WeightParams};

/// Largest values that can occur on-chain: capacities are lot counts summed
/// over bids (lots ≤ 1000 per offer, so far below this bound) and `available`
/// is at most the offer's lot count.
pub const DOMAIN_TOTAL_MAX: u64 = 1 << 62;
pub const DOMAIN_AVAILABLE_MAX: u64 = 1 << 32;

/// Allocator spec: for capacities `c_i` (in bid order), `L` available lots and
/// a seed:
/// * every bidder gets `floor(c_i·L'/C)` or `ceil(c_i·L'/C)` lots (systematic
///   sampling never deviates by a whole lot from pro-rata), never above `c_i`;
/// * allocations sum to exactly `min(C, L)`;
/// * inside the on-chain domain no call errors; outside it, calls may return
///   an error but never panic or mis-allocate.
pub fn check_allocation(caps: &[u64], available: u64, seed: &[u8; 32]) -> Result<(), String> {
    let total = caps.iter().try_fold(0u64, |a, &c| a.checked_add(c));
    let Some(total) = total else { return Ok(()) }; // capacity overflow is rejected earlier on-chain
    if total == 0 || available == 0 {
        return Ok(());
    }
    let in_domain = total <= DOMAIN_TOTAL_MAX && available <= DOMAIN_AVAILABLE_MAX;
    let u = random_offset(seed, total).map_err(|e| format!("random_offset: {e:?}"))?;
    if u >= total {
        return Err(format!("offset {u} not below total {total}"));
    }
    let filled = total.min(available) as u128;
    let mut prefix = 0u64;
    let mut sum = 0u128;
    for (i, &c) in caps.iter().enumerate() {
        let n = match allocate(prefix, c, total, available, u) {
            Ok(n) => n,
            Err(e) if !in_domain => {
                let _ = e;
                return Ok(());
            }
            Err(e) => return Err(format!("allocate errored in domain at bid {i}: {e:?}")),
        };
        if n > c {
            return Err(format!("bid {i}: allocated {n} > capacity {c}"));
        }
        // floor/ceil of c·filled/total, in exact integer arithmetic
        let num = c as u128 * filled;
        let lo = num / total as u128;
        let hi = lo + u128::from(!num.is_multiple_of(total as u128));
        if (n as u128) < lo || (n as u128) > hi {
            return Err(format!("bid {i}: allocated {n} outside [{lo}, {hi}] (cap {c}, total {total}, available {available}, U {u})"));
        }
        sum += n as u128;
        prefix += c;
    }
    if sum != filled {
        return Err(format!("allocated {sum} lots, expected {filled}"));
    }
    Ok(())
}

/// One step of the reward/tenure simulation.
#[derive(Debug, Clone, Copy)]
pub enum RewardOp {
    Buy { who: usize, amount: u64 },
    Sell { who: usize, amount: u64 },
    Credit { who: usize, extra: u64 },
    Wait { secs: u64 },
    Deposit { amount: u64 },
    Poke { who: usize },
}

impl RewardOp {
    /// Decode an op from fuzzer bytes (total function, bounded magnitudes that
    /// match on-chain reality: ≤ 1e12 base units per transfer, ≤ 40 days idle).
    pub fn from_bytes(tag: u8, who: u8, value: u64, wallets: usize) -> Self {
        let who = who as usize % wallets.max(1);
        match tag % 13 {
            0..=2 => RewardOp::Buy {
                who,
                amount: 1 + value % 1_000_000_000_000,
            },
            3 => RewardOp::Sell {
                who,
                amount: 1 + value % 1_000_000_000_000,
            },
            4 => RewardOp::Credit {
                who,
                extra: value % 10_000_000_000_000,
            },
            5..=8 => RewardOp::Wait {
                secs: value % (40 * SECONDS_PER_DAY),
            },
            9..=11 => RewardOp::Deposit {
                amount: 1 + value % 10_000_000_000,
            },
            _ => RewardOp::Poke { who },
        }
    }
}

struct Wallet {
    tenure: Tenure,
    lw: LinearWeight,
    rewards: UserRewards,
    /// Brute-force earnings in exact scaled units, accumulated per boundary.
    brute_scaled: u128,
    /// Settlements so far (each may floor away < 1 unit).
    settlements: u64,
}

/// Production accumulator + brute-force O(n) model side by side.
pub struct RewardSim {
    p: WeightParams,
    g: RewardGlobal,
    ring: VecRing,
    wallets: Vec<Wallet>,
    now: i64,
}

fn err<E: core::fmt::Debug>(ctx: &str) -> impl FnOnce(E) -> String + '_ {
    move |e| format!("{ctx}: {e:?}")
}

impl RewardSim {
    pub fn new(n: usize) -> Self {
        let p = WeightParams {
            cap_secs: 90 * SECONDS_PER_DAY,
            extra_bps: 20_000,
            epoch_secs: 6 * 3600,
            genesis_ts: 1_700_000_000,
        };
        let now = p.genesis_ts + 17;
        let g = RewardGlobal::default();
        let wallets = (0..n)
            .map(|_| Wallet {
                tenure: Tenure::new(now),
                lw: LinearWeight::ZERO,
                rewards: UserRewards::new_at(&g),
                brute_scaled: 0,
                settlements: 0,
            })
            .collect();
        Self {
            p,
            g,
            ring: VecRing::default(),
            wallets,
            now,
        }
    }

    /// Process boundaries one at a time, checking `W_k` against brute force
    /// and accumulating each wallet's brute-force reward.
    fn catch_up(&mut self) -> Result<(), String> {
        let target = self.p.epoch_at(self.now);
        while self.g.last_epoch < target {
            let k = self.g.last_epoch + 1;
            let mut brute_w = 0u128;
            for w in &self.wallets {
                brute_w += w.lw.weight_at(k).map_err(err("weight_at"))?;
            }
            let r_before = self.g.r;
            self.g
                .advance_to(&mut self.ring, k, 1)
                .map_err(err("advance_to"))?;
            let total = self.g.totals.total_at(k).map_err(err("total_at"))?;
            if total != brute_w {
                return Err(format!(
                    "W_k mismatch at k={k}: accumulator {total}, brute force {brute_w}"
                ));
            }
            let rk = self.g.r.wrapping_sub(r_before);
            for w in self.wallets.iter_mut() {
                w.brute_scaled += rk * w.lw.weight_at(k).map_err(err("weight_at"))?;
            }
        }
        Ok(())
    }

    fn touch(
        &mut self,
        who: usize,
        f: impl FnOnce(&mut Tenure, i64) -> Result<(), String>,
    ) -> Result<(), String> {
        self.catch_up()?;
        let w = &mut self.wallets[who];
        settle(&mut w.rewards, &w.lw, &self.g, &self.ring).map_err(err("settle"))?;
        w.settlements += 1;
        self.g
            .remove_weight(&mut self.ring, &w.lw)
            .map_err(err("remove_weight"))?;
        f(&mut w.tenure, self.now)?;
        w.lw = linear_weight(&w.tenure, self.now, self.g.last_epoch, &self.p)
            .map_err(err("linear_weight"))?;
        self.g
            .add_weight(&mut self.ring, &w.lw)
            .map_err(err("add_weight"))?;
        Ok(())
    }

    pub fn apply(&mut self, op: &RewardOp) -> Result<(), String> {
        match *op {
            RewardOp::Buy { who, amount } => self.touch(who, |t, now| {
                t.on_inbound(amount, now).map_err(err("on_inbound"))
            }),
            RewardOp::Sell { who, amount } => self.touch(who, |t, now| {
                t.on_outbound_reset(amount, now)
                    .map_err(err("on_outbound_reset"))
            }),
            RewardOp::Credit { who, extra } => self.touch(who, |t, now| {
                t.credit(extra as u128, now).map_err(err("credit"))
            }),
            RewardOp::Poke { who } => {
                self.touch(who, |t, now| t.materialize(now).map_err(err("materialize")))
            }
            RewardOp::Wait { secs } => {
                self.now += secs as i64;
                // Mimic the keeper: checkpoint wallets idle for > 300 epochs so
                // their last linear boundary never leaves the 512-entry ring.
                let k = self.p.epoch_at(self.now);
                for who in 0..self.wallets.len() {
                    if k.saturating_sub(self.wallets[who].rewards.last_epoch) > 300 {
                        self.touch(who, |t, now| t.materialize(now).map_err(err("materialize")))?;
                    }
                }
                Ok(())
            }
            RewardOp::Deposit { amount } => {
                self.catch_up()?;
                self.g.deposit(amount).map_err(err("deposit"))
            }
        }
    }

    /// Settle everyone two epochs later and compare with the model:
    /// never over-pays, under-pays by at most one unit per settlement, and
    /// conserves `deposited = distributed + pending`.
    pub fn finish(&mut self) -> Result<(), String> {
        self.now += 2 * self.p.epoch_secs as i64;
        self.catch_up()?;
        let mut paid = 0u128;
        for (i, w) in self.wallets.iter_mut().enumerate() {
            settle(&mut w.rewards, &w.lw, &self.g, &self.ring).map_err(err("settle"))?;
            w.settlements += 1;
            let brute = w.brute_scaled / REWARD_SCALE;
            let got = w.rewards.pending as u128;
            if got > brute {
                return Err(format!(
                    "wallet {i} over-paid: got {got}, brute force {brute}"
                ));
            }
            if brute - got > w.settlements as u128 {
                return Err(format!("wallet {i} under-paid beyond rounding: got {got}, brute force {brute}, settlements {}", w.settlements));
            }
            paid += got;
        }
        if paid > self.g.total_distributed as u128 {
            return Err(format!(
                "paid {paid} > distributed {}",
                self.g.total_distributed
            ));
        }
        if self.g.total_deposited != self.g.total_distributed + self.g.pending {
            return Err(format!(
                "conservation: deposited {} != distributed {} + pending {}",
                self.g.total_deposited, self.g.total_distributed, self.g.pending
            ));
        }
        Ok(())
    }
}

/// Run a whole reward scenario.
pub fn check_rewards(wallets: usize, ops: &[RewardOp]) -> Result<(), String> {
    let mut sim = RewardSim::new(wallets.max(1));
    for (i, op) in ops.iter().enumerate() {
        sim.apply(op).map_err(|e| format!("op {i} {op:?}: {e}"))?;
    }
    sim.finish()
}

/// Tenure spec for arbitrary (unbounded) inputs: operations either succeed or
/// return an error — never panic — and after a success the accumulator is
/// monotone (inbound/credit) or zero (outbound reset).
pub fn check_tenure(steps: &[(u8, u64, u32)]) -> Result<(), String> {
    let mut t = Tenure::new(0);
    let mut now: i64 = 0;
    for &(kind, amount, dt) in steps {
        now += dt as i64;
        let Ok(before) = t.tenure_at(now) else {
            return Ok(());
        };
        match kind % 3 {
            0 => {
                if t.on_inbound(amount, now).is_ok() {
                    let after = t.tenure_at(now).map_err(err("tenure_at"))?;
                    if after < before {
                        return Err(format!("inbound decreased tenure {before} -> {after}"));
                    }
                }
            }
            1 => {
                if t.credit(amount as u128, now).is_ok() {
                    let after = t.tenure_at(now).map_err(err("tenure_at"))?;
                    if after < before {
                        return Err(format!("credit decreased tenure {before} -> {after}"));
                    }
                }
            }
            _ => {
                if t.on_outbound_reset(amount, now).is_ok() && t.acc != 0 {
                    return Err(format!("outbound reset left acc = {}", t.acc));
                }
            }
        }
    }
    Ok(())
}
