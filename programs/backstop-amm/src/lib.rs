//! # backstop-amm
//!
//! Constant-product pool per market with:
//! * protocol-owned, non-withdrawable liquidity (no LP token, D-015),
//! * a 3 % fee on buys and sells taken in the quote token and sent to the
//!   core fee vault (never kept in reserves → `k` is non-decreasing),
//! * an on-chain TWAP oracle (cumulative price + 96-slot observation ring),
//! * four entry points: user `buy`, user `sell` (only below the minimum offer
//!   size; per-wallet cap enforced by the hook, global hourly cap here),
//!   `sell_from_offer` (offer remainder, signed by the offers escrow PDA) and
//!   `buy_with_ticket` (fee-free Return-Ticket purchase, signed by the offers
//!   escrow PDA).
//!
//! PDA: `["pool", mint]` — pool state and vault authority.

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("8m9GWYsGaqmGECJnN6kipQXiaJfk8t2MhS8U5LugUw8b");

#[program]
pub mod backstop_amm {
    use super::*;

    /// Create the pool. The base vault (ATA of the pool PDA) must already hold
    /// the market's liquidity supply; `quote_amount` is seeded by the caller.
    pub fn init_pool(ctx: Context<InitPool>, quote_amount: u64) -> Result<()> {
        instructions::init_pool::init_pool(ctx, quote_amount)
    }

    pub fn buy<'info>(ctx: Context<'info, Swap<'info>>, quote_in: u64, min_base_out: u64) -> Result<u64> {
        instructions::swap::buy(ctx, quote_in, min_base_out)
    }

    pub fn sell<'info>(ctx: Context<'info, Swap<'info>>, base_in: u64, min_quote_out: u64) -> Result<u64> {
        instructions::swap::sell(ctx, base_in, min_quote_out)
    }

    pub fn sell_from_offer<'info>(
        ctx: Context<'info, ProtocolSwap<'info>>,
        base_in: u64,
        min_quote_out: u64,
    ) -> Result<u64> {
        instructions::swap::sell_from_offer(ctx, base_in, min_quote_out)
    }

    pub fn buy_with_ticket<'info>(
        ctx: Context<'info, ProtocolSwap<'info>>,
        quote_in: u64,
        min_base_out: u64,
        max_base_out: u64,
    ) -> Result<u64> {
        instructions::swap::buy_with_ticket(ctx, quote_in, min_base_out, max_base_out)
    }

    /// Read-only: TWAP over `[now − end_ago − window, now − end_ago]`
    /// (returned via return data; use with `simulateTransaction`).
    pub fn twap(ctx: Context<ReadPool>, window: u32, end_ago: u32) -> Result<u128> {
        instructions::swap::twap(ctx, window, end_ago)
    }
}
