use anchor_lang::prelude::*;

pub mod side {
    pub const BUY: u8 = 0;
    pub const SELL: u8 = 1;
    pub const OFFER_REMAINDER: u8 = 2;
    pub const TICKET_BUY: u8 = 3;
}

#[event]
pub struct PoolInitialized {
    pub mint: Pubkey,
    pub quote_mint: Pubkey,
    pub base_reserve: u64,
    pub quote_reserve: u64,
    pub price: u128,
    pub ts: i64,
}

#[event]
pub struct Swapped {
    pub mint: Pubkey,
    pub trader: Pubkey,
    pub side: u8,
    pub base_amount: u64,
    pub quote_amount: u64,
    pub fee: u64,
    pub base_reserve: u64,
    pub quote_reserve: u64,
    /// Post-trade spot price (quote base units per base unit × 1e18).
    pub price: u128,
    pub ts: i64,
}
