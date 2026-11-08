use anchor_lang::prelude::*;
use backstop_math::shield::{ShieldPool, ShieldPosition as MathPosition, SumEntry, SUM_RING};

pub mod adapter_kind {
    pub const NONE: u8 = 0;
    pub const MOCK: u8 = 1;
    pub const KAMINO: u8 = 2;
}

/// Per-market chest pool. Chest balances are shares of
/// `total_assets = idle_assets + adapter_value` (D-027).
#[account]
#[derive(InitSpace)]
pub struct ChestMarket {
    pub bump: u8,
    pub rewards_auth_bump: u8,
    pub mint: Pubkey,
    pub quote_mint: Pubkey,
    pub quote_token_program: Pubkey,
    /// ATA(chest_market, quote): idle chest USDC.
    pub vault: Pubkey,
    /// ATA(rewards_auth, quote): harvested holder rewards awaiting claim.
    pub holder_rewards_vault: Pubkey,
    pub total_shares: u64,
    /// Quote tokens in `vault` that belong to chests (donations ignored).
    pub idle_assets: u64,
    /// Principal currently deployed to the yield adapter.
    pub deployed_principal: u64,
    /// Adapter position value at the last `sync_yield` (variable yield).
    pub adapter_value: u64,
    pub adapter_synced_at: i64,
    pub adapter_kind: u8,
    pub adapter_program: Pubkey,
    /// Adapter-specific position account (mock deposit / Kamino collateral ATA).
    pub adapter_position: Pubkey,
    /// Adapter-specific pool/reserve account.
    pub adapter_pool: Pubkey,
    pub chests: u64,
    pub total_deposited: u64,
    pub total_withdrawn: u64,
    pub total_penalties: u64,
    pub total_harvested: u64,
    pub total_bid: u64,
    pub total_refunded: u64,
    pub total_yield_realised: u64,
}

impl ChestMarket {
    pub fn total_assets(&self) -> u64 {
        self.idle_assets.saturating_add(self.adapter_value)
    }
}

#[account]
#[derive(InitSpace)]
pub struct Chest {
    pub bump: u8,
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub shares: u64,
    /// Rolling 60-day lock: restarts on every deposit event (D-028).
    pub lock_until: i64,
    pub last_deposit_at: i64,
    pub deposited: u64,
    pub withdrawn: u64,
    pub harvested: u64,
    pub penalties_paid: u64,
    pub bid_quote: u64,
    pub refunded_quote: u64,
    /// Auto-Absorb daily window.
    pub day_start: i64,
    pub day_spent: u64,
    pub open_bids: u32,
    pub created_at: i64,
}

/// Auto-Absorb permission (spec §3.4): signed once by the owner, revocable.
#[account]
#[derive(InitSpace)]
pub struct Grant {
    pub bump: u8,
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub enabled: bool,
    pub max_per_offer: u64,
    pub max_per_day: u64,
    pub min_discount_bps: u32,
    /// Chest balance that Auto-Absorb never spends below.
    pub reserve_floor: u64,
    /// Optional keeper restriction (default = any keeper).
    pub keeper: Pubkey,
    pub updated_at: i64,
}

#[derive(
    AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq, InitSpace,
)]
pub struct SumEntryData {
    pub seq: u64,
    pub epoch: u64,
    pub scale: u64,
    pub s: u128,
    pub g: u128,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub struct ShieldPoolData {
    pub total_deposits: u64,
    pub total_weighted: u128,
    pub p: u128,
    pub scale: u64,
    pub epoch: u64,
    pub seq: u64,
    pub sums: [SumEntryData; SUM_RING],
    pub undistributed_rewards: u64,
}

impl From<&ShieldPool> for ShieldPoolData {
    fn from(p: &ShieldPool) -> Self {
        let mut sums = [SumEntryData::default(); SUM_RING];
        for (d, s) in sums.iter_mut().zip(p.sums.iter()) {
            *d = SumEntryData {
                seq: s.seq,
                epoch: s.epoch,
                scale: s.scale,
                s: s.s,
                g: s.g,
            };
        }
        Self {
            total_deposits: p.total_deposits,
            total_weighted: p.total_weighted,
            p: p.p,
            scale: p.scale,
            epoch: p.epoch,
            seq: p.seq,
            sums,
            undistributed_rewards: p.undistributed_rewards,
        }
    }
}

impl From<&ShieldPoolData> for ShieldPool {
    fn from(d: &ShieldPoolData) -> Self {
        let mut sums = [SumEntry::default(); SUM_RING];
        for (s, e) in sums.iter_mut().zip(d.sums.iter()) {
            *s = SumEntry {
                seq: e.seq,
                epoch: e.epoch,
                scale: e.scale,
                s: e.s,
                g: e.g,
            };
        }
        ShieldPool {
            total_deposits: d.total_deposits,
            total_weighted: d.total_weighted,
            p: d.p,
            scale: d.scale,
            epoch: d.epoch,
            seq: d.seq,
            sums,
            undistributed_rewards: d.undistributed_rewards,
        }
    }
}

/// The single protocol Shield Pool of a market (spec §3.5).
#[account]
#[derive(InitSpace)]
pub struct Shield {
    pub bump: u8,
    pub mint: Pubkey,
    /// ATA(shield, quote): locked deposits.
    pub quote_vault: Pubkey,
    /// ATA(shield, mint): absorbed tokens awaiting claim.
    pub token_vault: Pubkey,
    /// PDA token account receiving the 10 % fee stream, penalties and
    /// redemption fees (`["shield_rewards", mint]`).
    pub rewards_vault: Pubkey,
    pub pool: ShieldPoolData,
    /// Rewards in `rewards_vault` already distributed but not yet claimed.
    pub rewards_accounted: u64,
    /// Tokens in `token_vault` owed to depositors (gains not yet claimed).
    pub tokens_accounted: u64,
    pub positions: u64,
    pub absorbed_quote: u64,
    pub absorbed_tokens: u64,
    pub offers_absorbed: u64,
}

#[derive(
    AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq, InitSpace,
)]
pub struct PositionData {
    pub initial: u64,
    pub multiplier_bps: u32,
    pub p_snap: u128,
    pub s_snap: u128,
    pub g_snap: u128,
    pub seq_snap: u64,
    pub epoch_snap: u64,
    pub scale_snap: u64,
}

impl From<&MathPosition> for PositionData {
    fn from(p: &MathPosition) -> Self {
        Self {
            initial: p.initial,
            multiplier_bps: p.multiplier_bps,
            p_snap: p.p_snap,
            s_snap: p.s_snap,
            g_snap: p.g_snap,
            seq_snap: p.seq_snap,
            epoch_snap: p.epoch_snap,
            scale_snap: p.scale_snap,
        }
    }
}

impl From<&PositionData> for MathPosition {
    fn from(d: &PositionData) -> Self {
        Self {
            initial: d.initial,
            multiplier_bps: d.multiplier_bps,
            p_snap: d.p_snap,
            s_snap: d.s_snap,
            g_snap: d.g_snap,
            seq_snap: d.seq_snap,
            epoch_snap: d.epoch_snap,
            scale_snap: d.scale_snap,
        }
    }
}

#[account]
#[derive(InitSpace)]
pub struct ShieldPosition {
    pub bump: u8,
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub id: u32,
    pub pos: PositionData,
    pub principal: u64,
    pub lock_start: i64,
    pub lock_end: i64,
    pub claimed_tokens: u64,
    pub claimed_rewards: u64,
}
