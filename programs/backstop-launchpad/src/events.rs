use anchor_lang::prelude::*;

#[event]
pub struct ChildCreated {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub name: String,
    pub symbol: String,
    pub supply: u64,
    pub creator_bps: u16,
    pub liquidity: u64,
    pub ts: i64,
}

#[event]
pub struct ChildStep {
    pub mint: Pubkey,
    pub status: u8,
    pub ts: i64,
}

/// Emitted when the child is fully live (indexed into `child_tokens`).
#[event]
pub struct ChildLaunched {
    pub mint: Pubkey,
    pub parent: Pubkey,
    pub creator: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub supply: u64,
    pub creator_bps: u16,
    pub liquidity: u64,
    pub vesting_end: i64,
    pub ts: i64,
}

#[event]
pub struct VestedClaimed {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub amount: u64,
    pub total_claimed: u64,
    pub ts: i64,
}
