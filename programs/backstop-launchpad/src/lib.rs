//! # backstop-launchpad
//!
//! Permissionless factory for **child tokens** that run on the same engine:
//! same transfer hook, their own offer book, chests, Shield and AMM. Child
//! fees route 30 % to the parent (swapped to USDC and credited to BACKSTOP
//! holders by tenure weight); the rest splits 70/10/20 inside the child.
//!
//! Safety properties enforced on-chain for every child:
//! * fixed supply (mint authority revoked), no freeze authority, no permanent
//!   delegate, transfer hook pinned (verified again by `backstop-core`);
//! * metadata frozen (update authority removed);
//! * initial liquidity ≥ 5 SOL, locked forever (the AMM has no withdraw);
//! * creator allocation ≤ 5 %, held by a program vault, linearly vested over
//!   90 days.
//!
//! PDAs: `["launchpad"]` (config + child-market authority),
//! `["child", mint]`, `["child_mint_auth", mint]`, `["vesting", mint]`.

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("ZzoHe1DMEHWDVnHQs7UnHJF8p6pdRVpk7629ygyLEXU");

#[program]
pub mod backstop_launchpad {
    use super::*;

    pub fn init_launchpad(ctx: Context<InitLaunchpad>, args: LaunchpadArgs) -> Result<()> {
        instructions::init_launchpad(ctx, args)
    }

    pub fn update_launchpad(
        ctx: Context<UpdateLaunchpad>,
        args: LaunchpadArgs,
        parent_share_bps: u16,
    ) -> Result<()> {
        instructions::update_launchpad(ctx, args, parent_share_bps)
    }

    pub fn create_child(ctx: Context<CreateChild>, params: ChildParams) -> Result<()> {
        instructions::create_child(ctx, params)
    }

    pub fn init_child_hook(ctx: Context<InitChildHook>) -> Result<()> {
        instructions::init_child_hook(ctx)
    }

    pub fn mint_child_supply(ctx: Context<MintChildSupply>) -> Result<()> {
        instructions::mint_child_supply(ctx)
    }

    pub fn init_child_market(ctx: Context<InitChildMarket>) -> Result<()> {
        instructions::init_child_market(ctx)
    }

    pub fn init_child_pool(ctx: Context<InitChildPool>) -> Result<()> {
        instructions::init_child_pool(ctx)
    }

    pub fn init_child_book(ctx: Context<InitChildBook>) -> Result<()> {
        instructions::init_child_book(ctx)
    }

    pub fn init_child_chests(ctx: Context<InitChildChests>) -> Result<()> {
        instructions::init_child_chests(ctx)
    }

    pub fn claim_vested<'info>(ctx: Context<'info, ClaimVested<'info>>) -> Result<()> {
        instructions::claim_vested(ctx)
    }
}
