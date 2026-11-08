//! Account layouts of the transfer-hook program.
//!
//! `Holder` and `RewardState` are zero-copy (fixed layout, no Borsh
//! (de)serialisation on every transfer). 128-bit values are stored as byte
//! arrays because `u128` alignment differs between the host (16) and SBF (8).

use anchor_lang::prelude::*;
use backstop_math::rewards::{RewardGlobal, RewardRing, ScheduleEntry, Snapshot, UserRewards};
use backstop_math::tenure::Tenure;
use backstop_math::weight::{LinearWeight, WeightParams, WeightTotals, RING};

pub const MAX_ALLOWLIST: usize = 8;
pub const RECENT_SENDERS: usize = 8;
pub const ACCOUNT_VERSION: u8 = 1;

#[zero_copy]
#[derive(Default, Debug, PartialEq, Eq)]
pub struct PodU128 {
    pub bytes: [u8; 16],
}

impl PodU128 {
    pub fn get(&self) -> u128 {
        u128::from_le_bytes(self.bytes)
    }
    pub fn set(&mut self, v: u128) {
        self.bytes = v.to_le_bytes();
    }
}

#[zero_copy]
#[derive(Default, Debug, PartialEq, Eq)]
pub struct PodI128 {
    pub bytes: [u8; 16],
}

impl PodI128 {
    pub fn get(&self) -> i128 {
        i128::from_le_bytes(self.bytes)
    }
    pub fn set(&mut self, v: i128) {
        self.bytes = v.to_le_bytes();
    }
}

/// Market-level hook configuration (Borsh account, rarely written).
#[account]
#[derive(InitSpace)]
pub struct HookConfig {
    pub version: u8,
    pub bump: u8,
    pub reward_bump: u8,
    /// RewardState has reached its full size and is initialised.
    pub reward_ready: bool,
    pub mint: Pubkey,
    /// Governance (Squads multisig vault on mainnet).
    pub governance: Pubkey,
    /// Two-step governance transfer target (default = none).
    pub pending_governance: Pubkey,
    /// `backstop-core` market PDA: may deposit rewards and record burns.
    pub core_authority: Pubkey,
    /// `backstop-offers` book PDA: may credit absorb tenure.
    pub offers_authority: Pubkey,
    /// `backstop-chest` chest-market PDA: may harvest rewards into chests.
    pub chest_authority: Pubkey,
    /// `backstop-amm` pool PDA: transfers into it from wallets are direct sells.
    pub amm_authority: Pubkey,
    /// Programs that may be the top-level instruction of a token movement.
    pub allowed_programs: [Pubkey; MAX_ALLOWLIST],
    /// Off-curve token-account owners permitted to receive tokens.
    pub allowed_owners: [Pubkey; MAX_ALLOWLIST],
    /// Average age at which the tenure multiplier caps (default 90 d).
    pub tenure_cap_secs: u64,
    /// Multiplier above 1.0 at the cap, bps (default 20_000 → 3.0×).
    pub tenure_extra_bps: u32,
    /// Share of a seller's lot tenure transferred to absorbers (default 40 %).
    pub absorb_tenure_bps: u32,
    /// Rolling per-wallet cap on direct AMM sells (default = min offer size).
    pub direct_sell_cap: u64,
    pub direct_sell_window_secs: u64,
    /// Minimum direct transfer recorded in the recent-sender ring.
    pub link_min_amount: u64,
    pub link_window_secs: u64,
    /// Distribution epoch length — immutable after initialisation.
    pub epoch_secs: u64,
    /// Boundary 0 timestamp — immutable after initialisation.
    pub genesis_ts: i64,
    pub holders: u64,
    pub _reserved: [u8; 64],
}

impl HookConfig {
    pub fn weight_params(&self) -> WeightParams {
        WeightParams {
            cap_secs: self.tenure_cap_secs,
            extra_bps: self.tenure_extra_bps,
            epoch_secs: self.epoch_secs,
            genesis_ts: self.genesis_ts,
        }
    }

    pub fn is_allowed_program(&self, p: &Pubkey) -> bool {
        *p != Pubkey::default() && self.allowed_programs.contains(p)
    }

    pub fn is_allowed_owner(&self, o: &Pubkey) -> bool {
        *o != Pubkey::default() && self.allowed_owners.contains(o)
    }
}

/// Per-wallet tenure, weight and reward checkpoint.
#[account(zero_copy)]
#[derive(Debug)]
pub struct Holder {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub balance: u64,
    pub last_ts: i64,
    pub registered_at: i64,
    pub cap_epoch: u64,
    pub reward_epoch: u64,
    pub pending_rewards: u64,
    pub lifetime_rewards: u64,
    pub ds_window_start: i64,
    pub ds_amount: u64,
    pub recent_ts: [i64; RECENT_SENDERS],
    pub acc: PodU128,
    pub alpha: PodI128,
    pub beta: PodI128,
    pub cap: PodU128,
    pub r_snap: PodU128,
    pub rt_snap: PodU128,
    pub recent_senders: [Pubkey; RECENT_SENDERS],
    pub recent_head: u8,
    pub bump: u8,
    pub version: u8,
    pub _pad: [u8; 5],
    pub _reserved: [u8; 64],
}

impl Holder {
    pub const SIZE: usize = 8 + core::mem::size_of::<Holder>();

    pub fn tenure(&self) -> Tenure {
        Tenure {
            balance: self.balance,
            acc: self.acc.get(),
            last_ts: self.last_ts,
        }
    }

    pub fn set_tenure(&mut self, t: &Tenure) {
        self.balance = t.balance;
        self.acc.set(t.acc);
        self.last_ts = t.last_ts;
    }

    pub fn weight(&self) -> LinearWeight {
        LinearWeight {
            alpha: self.alpha.get(),
            beta: self.beta.get(),
            cap: self.cap.get(),
            cap_epoch: self.cap_epoch,
        }
    }

    pub fn set_weight(&mut self, w: &LinearWeight) {
        self.alpha.set(w.alpha);
        self.beta.set(w.beta);
        self.cap.set(w.cap);
        self.cap_epoch = w.cap_epoch;
    }

    pub fn rewards(&self) -> UserRewards {
        UserRewards {
            last_epoch: self.reward_epoch,
            r_snap: self.r_snap.get(),
            rt_snap: self.rt_snap.get(),
            pending: self.pending_rewards,
        }
    }

    pub fn set_rewards(&mut self, u: &UserRewards) {
        self.reward_epoch = u.last_epoch;
        self.r_snap.set(u.r_snap);
        self.rt_snap.set(u.rt_snap);
        self.pending_rewards = u.pending;
    }

    /// Record a direct inbound sender (self-fill protection ring).
    pub fn push_sender(&mut self, sender: Pubkey, now: i64) {
        let i = self.recent_head as usize % RECENT_SENDERS;
        self.recent_senders[i] = sender;
        self.recent_ts[i] = now;
        self.recent_head = ((i + 1) % RECENT_SENDERS) as u8;
    }

    /// Whether `who` sent this wallet tokens within `window` seconds.
    pub fn received_from_recently(&self, who: &Pubkey, now: i64, window: u64) -> bool {
        (0..RECENT_SENDERS).any(|i| {
            self.recent_senders[i] == *who
                && self.recent_ts[i] != 0
                && now.saturating_sub(self.recent_ts[i]) <= window as i64
        })
    }
}

#[zero_copy]
#[derive(Debug, Default)]
pub struct PodSchedule {
    pub epoch: u64,
    pub da: PodI128,
    pub db: PodI128,
    pub dc: PodI128,
}

#[zero_copy]
#[derive(Debug, Default)]
pub struct PodSnapshot {
    pub epoch: u64,
    pub r: PodU128,
    pub rt: PodU128,
}

/// Global reward accumulator + cap schedule ring for one market (~49 KB).
#[account(zero_copy)]
pub struct RewardState {
    pub mint: Pubkey,
    pub last_epoch: u64,
    pub pending: u64,
    pub total_deposited: u64,
    pub total_distributed: u64,
    pub total_harvested: u64,
    pub holders: u64,
    pub a: PodI128,
    pub b: PodI128,
    pub c: PodU128,
    pub r: PodU128,
    pub rt: PodU128,
    pub bump: u8,
    pub version: u8,
    pub _pad: [u8; 6],
    pub schedule: [PodSchedule; RING],
    pub snapshots: [PodSnapshot; RING],
}

impl RewardState {
    pub const SIZE: usize = 8 + core::mem::size_of::<RewardState>();

    pub fn global(&self) -> RewardGlobal {
        RewardGlobal {
            last_epoch: self.last_epoch,
            totals: WeightTotals {
                a: self.a.get(),
                b: self.b.get(),
                c: self.c.get(),
            },
            r: self.r.get(),
            rt: self.rt.get(),
            pending: self.pending,
            total_deposited: self.total_deposited,
            total_distributed: self.total_distributed,
        }
    }

    pub fn set_global(&mut self, g: &RewardGlobal) {
        self.last_epoch = g.last_epoch;
        self.a.set(g.totals.a);
        self.b.set(g.totals.b);
        self.c.set(g.totals.c);
        self.r.set(g.r);
        self.rt.set(g.rt);
        self.pending = g.pending;
        self.total_deposited = g.total_deposited;
        self.total_distributed = g.total_distributed;
    }
}

impl RewardRing for RewardState {
    fn schedule(&self, idx: usize) -> ScheduleEntry {
        let e = &self.schedule[idx];
        ScheduleEntry {
            epoch: e.epoch,
            da: e.da.get(),
            db: e.db.get(),
            dc: e.dc.get(),
        }
    }
    fn set_schedule(&mut self, idx: usize, e: ScheduleEntry) {
        let s = &mut self.schedule[idx];
        s.epoch = e.epoch;
        s.da.set(e.da);
        s.db.set(e.db);
        s.dc.set(e.dc);
    }
    fn snapshot(&self, idx: usize) -> Snapshot {
        let s = &self.snapshots[idx];
        Snapshot {
            epoch: s.epoch,
            r: s.r.get(),
            rt: s.rt.get(),
        }
    }
    fn set_snapshot(&mut self, idx: usize, v: Snapshot) {
        let s = &mut self.snapshots[idx];
        s.epoch = v.epoch;
        s.r.set(v.r);
        s.rt.set(v.rt);
    }
}

#[cfg(test)]
mod layout_tests {
    use super::*;

    #[test]
    fn sizes_are_stable() {
        // Changing these sizes is a breaking on-chain layout change.
        assert_eq!(core::mem::size_of::<Holder>(), 624);
        assert_eq!(core::mem::size_of::<PodSchedule>(), 56);
        assert_eq!(core::mem::size_of::<PodSnapshot>(), 40);
        assert_eq!(core::mem::size_of::<RewardState>(), 168 + RING * (56 + 40));
    }
}
