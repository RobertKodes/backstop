use anchor_lang::prelude::*;

use crate::state::{MarketParams, ParamId, TimelockAction};

#[event]
pub struct MarketInitialized {
    pub mint: Pubkey,
    pub quote_mint: Pubkey,
    pub parent: Pubkey,
    pub governance: Pubkey,
    pub supply: u64,
    pub ts: i64,
}

#[event]
pub struct ParamsUpdated {
    pub mint: Pubkey,
    pub params: MarketParams,
    pub by: Pubkey,
}

#[event]
pub struct ParamUpdated {
    pub mint: Pubkey,
    pub param: ParamId,
    pub old_value: u64,
    pub new_value: u64,
    pub by: Pubkey,
    /// true when applied through the agent's bounded authority
    pub agent: bool,
}

#[event]
pub struct PausesUpdated {
    pub mint: Pubkey,
    pub pauses: u8,
    pub by: Pubkey,
}

#[event]
pub struct FeesDistributed {
    pub mint: Pubkey,
    pub amount: u64,
    pub to_chests: u64,
    pub to_shield: u64,
    pub to_treasury: u64,
    pub to_parent: u64,
    pub ts: i64,
}

#[event]
pub struct FeeSwap {
    pub mint: Pubkey,
    /// 0 = treasury USDC→SOL, 1 = parent share → parent rewards, 2 = shield SOL → USDC
    pub kind: u8,
    pub amount_in: u64,
    pub amount_out: u64,
    pub oracle_min_out: u64,
    pub ts: i64,
}

#[event]
pub struct Redeemed {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub tokens: u64,
    pub gross_lamports: u64,
    pub fee_lamports: u64,
    pub net_lamports: u64,
    pub treasury_lamports_after: u64,
    pub circulating_before: u64,
    pub ts: i64,
}

#[event]
pub struct TreasurySnapshot {
    pub mint: Pubkey,
    pub treasury_lamports: u64,
    pub circulating: u64,
    /// lamports per token base unit × 1e18
    pub floor_price: u128,
    pub ts: i64,
}

#[event]
pub struct ActionQueued {
    pub mint: Pubkey,
    pub id: u64,
    pub action: TimelockAction,
    pub eta: i64,
}

#[event]
pub struct ActionExecuted {
    pub mint: Pubkey,
    pub id: u64,
    pub action: TimelockAction,
}

#[event]
pub struct ActionCancelled {
    pub mint: Pubkey,
    pub id: u64,
}

#[event]
pub struct ExternalRewardsDeposited {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
}
