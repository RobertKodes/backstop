use anchor_lang::prelude::*;

/// `kind`: 0 deposit, 1 withdraw, 2 harvest, 3 bid, 4 refund, 5 shield_in,
/// 6 shield_out, 7 shield_reward
#[event]
pub struct ChestEvent {
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub kind: u8,
    pub assets: u64,
    pub shares_delta: i64,
    pub penalty: u64,
    pub balance_after: u64,
    pub lock_until: i64,
    pub ts: i64,
}

#[event]
pub struct GrantUpdated {
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub enabled: bool,
    pub max_per_offer: u64,
    pub max_per_day: u64,
    pub min_discount_bps: u32,
    pub reserve_floor: u64,
}

#[event]
pub struct AutoBid {
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub offer: Pubkey,
    pub keeper: Pubkey,
    pub amount: u64,
    pub ts: i64,
}

#[event]
pub struct ShieldAbsorbed {
    pub mint: Pubkey,
    pub offer: Pubkey,
    pub lots: u64,
    pub quote_spent: u64,
    pub tokens_gained: u64,
    pub total_deposits_after: u64,
    pub ts: i64,
}

#[event]
pub struct ShieldPositionEvent {
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub id: u32,
    /// 0 open, 1 claim, 2 withdraw
    pub kind: u8,
    pub principal: u64,
    pub tokens: u64,
    pub rewards: u64,
    pub multiplier_bps: u32,
    pub lock_end: i64,
    pub ts: i64,
}

#[event]
pub struct ShieldRewardsSynced {
    pub mint: Pubkey,
    pub amount: u64,
    pub ts: i64,
}

#[event]
pub struct YieldEvent {
    pub mint: Pubkey,
    /// 0 deposit to adapter, 1 withdraw from adapter, 2 sync
    pub kind: u8,
    pub amount: u64,
    pub adapter_value: u64,
    pub idle_assets: u64,
    pub ts: i64,
}
