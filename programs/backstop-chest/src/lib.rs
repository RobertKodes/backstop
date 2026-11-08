//! # backstop-chest
//!
//! Per-holder USDC **war chests** and the **Shield Pool**:
//! * chests are shares of a pooled vault (+ yield adapter position), D-027;
//! * tenure-weighted fee rewards are harvested from the hook accumulator;
//! * a 60-day rolling lock with a 25 % early-withdrawal penalty (to the Shield);
//! * Auto-Absorb grants let keepers bid within owner-set limits;
//! * the Shield takes a priority slice of every offer, settled atomically;
//! * idle USDC above the buffer target is deployed through a `YieldAdapter`.
//!
//! PDAs: `["chest_market", mint]`, `["chest", mint, owner]`,
//! `["grant", mint, owner]`, `["shield", mint]`,
//! `["shield_pos", mint, owner, id]`, `["rewards_auth", mint]`,
//! `["shield_rewards", mint]`.

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod ledger;
pub mod state;
pub mod yield_adapter;

use instructions::*;

declare_id!("5Hwrxz9JJoGxcZNSzP7TTAju2C2KMPtNBHtdifnU3tB5");

#[program]
pub mod backstop_chest {
    use super::*;

    pub fn init_chest_market(ctx: Context<InitChestMarket>) -> Result<()> {
        instructions::market::init_chest_market(ctx)
    }

    // ---- chests
    pub fn open_chest(ctx: Context<OpenChest>) -> Result<()> {
        instructions::chest::open_chest(ctx)
    }
    pub fn deposit(ctx: Context<ChestTransfer>, amount: u64) -> Result<()> {
        instructions::chest::deposit(ctx, amount)
    }
    pub fn withdraw(ctx: Context<ChestTransfer>, amount: u64) -> Result<()> {
        instructions::chest::withdraw(ctx, amount)
    }
    pub fn harvest(ctx: Context<Harvest>) -> Result<()> {
        instructions::chest::harvest(ctx)
    }

    // ---- absorbing
    pub fn set_grant(ctx: Context<SetGrant>, args: GrantArgs) -> Result<()> {
        instructions::absorb::set_grant(ctx, args)
    }
    pub fn bid_from_chest(ctx: Context<ChestBid>, amount: u64) -> Result<()> {
        instructions::absorb::bid_from_chest(ctx, amount)
    }
    pub fn auto_bid(ctx: Context<ChestBid>, amount: u64) -> Result<()> {
        instructions::absorb::auto_bid(ctx, amount)
    }
    pub fn claim_bid<'info>(ctx: Context<'info, ChestClaim<'info>>) -> Result<()> {
        instructions::absorb::claim_bid(ctx)
    }
    pub fn settle_offer<'info>(ctx: Context<'info, SettleOffer<'info>>) -> Result<()> {
        instructions::absorb::settle_offer(ctx)
    }

    // ---- shield
    pub fn sync_shield_rewards(ctx: Context<SyncShieldRewards>) -> Result<()> {
        instructions::shield::sync_shield_rewards(ctx)
    }
    pub fn shield_deposit(
        ctx: Context<ShieldDeposit>,
        amount: u64,
        lock_secs: u32,
        id: u32,
    ) -> Result<()> {
        instructions::shield::shield_deposit(ctx, amount, lock_secs, id)
    }
    pub fn shield_claim<'info>(ctx: Context<'info, ShieldClaim<'info>>) -> Result<()> {
        instructions::shield::shield_claim(ctx)
    }
    pub fn shield_withdraw<'info>(ctx: Context<'info, ShieldClaim<'info>>) -> Result<()> {
        instructions::shield::shield_withdraw(ctx)
    }

    // ---- yield
    pub fn set_adapter(
        ctx: Context<SetAdapter>,
        kind: u8,
        program: Pubkey,
        pool: Pubkey,
        position: Pubkey,
    ) -> Result<()> {
        instructions::yield_ops::set_adapter(ctx, kind, program, pool, position)
    }
    pub fn rebalance<'info>(ctx: Context<'info, Rebalance<'info>>) -> Result<()> {
        instructions::yield_ops::rebalance(ctx)
    }
    pub fn unwind<'info>(ctx: Context<'info, Rebalance<'info>>, amount: u64) -> Result<()> {
        instructions::yield_ops::unwind(ctx, amount)
    }
}
