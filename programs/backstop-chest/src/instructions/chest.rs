//! Open / deposit / withdraw / harvest.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use backstop_common::{ids, seeds};
use backstop_core::state::Market;
use backstop_hook::program::BackstopHook;
use backstop_math::fees::fee_ceil;

use crate::errors::{ChestError, MathExt};
use crate::events::ChestEvent;
use crate::ledger::{balance, credit, debit, deposit_event};
use crate::state::{Chest, ChestMarket};

pub mod kind {
    pub const DEPOSIT: u8 = 0;
    pub const WITHDRAW: u8 = 1;
    pub const HARVEST: u8 = 2;
    pub const BID: u8 = 3;
    pub const REFUND: u8 = 4;
    pub const SHIELD_IN: u8 = 5;
    pub const SHIELD_OUT: u8 = 6;
    pub const SHIELD_REWARD: u8 = 7;
}

pub fn chest_market_seeds(cm: &ChestMarket) -> [&[u8]; 3] {
    [
        seeds::CHEST_MARKET,
        cm.mint.as_ref(),
        core::slice::from_ref(&cm.bump),
    ]
}

#[allow(clippy::too_many_arguments)]
pub fn quote_transfer<'info>(
    program: &AccountInfo<'info>,
    from: &AccountInfo<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    amount: u64,
    signer: &[&[&[u8]]],
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            program.key(),
            TransferChecked {
                from: from.clone(),
                mint: mint.to_account_info(),
                to: to.clone(),
                authority: authority.clone(),
            },
            signer,
        ),
        amount,
        mint.decimals,
    )
}

pub fn emit_chest(
    cm: &ChestMarket,
    chest: &Chest,
    k: u8,
    assets: u64,
    shares_delta: i64,
    penalty: u64,
    now: i64,
) -> Result<()> {
    emit!(ChestEvent {
        mint: cm.mint,
        owner: chest.owner,
        kind: k,
        assets,
        shares_delta,
        penalty,
        balance_after: balance(cm, chest)?,
        lock_until: chest.lock_until,
        ts: now,
    });
    Ok(())
}

// ------------------------------------------------------------------ open

#[derive(Accounts)]
pub struct OpenChest<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: chest owner (any wallet; opening is free of side effects).
    pub owner: UncheckedAccount<'info>,
    #[account(mut, seeds = [seeds::CHEST_MARKET, chest_market.mint.as_ref()], bump = chest_market.bump)]
    pub chest_market: Box<Account<'info, ChestMarket>>,
    #[account(
        init,
        payer = payer,
        space = 8 + Chest::INIT_SPACE,
        seeds = [seeds::CHEST, chest_market.mint.as_ref(), owner.key().as_ref()],
        bump
    )]
    pub chest: Box<Account<'info, Chest>>,
    pub system_program: Program<'info, System>,
}

pub fn open_chest(ctx: Context<OpenChest>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let c = &mut ctx.accounts.chest;
    c.bump = ctx.bumps.chest;
    c.mint = ctx.accounts.chest_market.mint;
    c.owner = ctx.accounts.owner.key();
    c.created_at = now;
    c.day_start = now;
    ctx.accounts.chest_market.chests += 1;
    Ok(())
}

// ---------------------------------------------------- deposit / withdraw

#[derive(Accounts)]
pub struct ChestTransfer<'info> {
    pub owner: Signer<'info>,
    #[account(seeds = [seeds::MARKET, chest_market.mint.as_ref()], bump = market.bump, seeds::program = ids::CORE)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [seeds::CHEST_MARKET, chest_market.mint.as_ref()], bump = chest_market.bump, has_one = vault)]
    pub chest_market: Box<Account<'info, ChestMarket>>,
    #[account(mut, seeds = [seeds::CHEST, chest_market.mint.as_ref(), owner.key().as_ref()], bump = chest.bump)]
    pub chest: Box<Account<'info, Chest>>,
    #[account(address = chest_market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = quote_mint)]
    pub owner_quote: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Shield rewards vault (receives early-withdrawal penalties).
    #[account(mut, address = market.shield_rewards_vault)]
    pub shield_rewards_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = chest_market.quote_token_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
}

pub fn deposit(ctx: Context<ChestTransfer>, amount: u64) -> Result<()> {
    require!(amount > 0, ChestError::InvalidAmount);
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    quote_transfer(
        &a.quote_token_program.to_account_info(),
        &a.owner_quote.to_account_info(),
        &a.quote_mint,
        &a.vault.to_account_info(),
        &a.owner.to_account_info(),
        amount,
        &[],
    )?;
    let lock = a.market.params.chest_lock_secs;
    let cm = &mut ctx.accounts.chest_market;
    let c = &mut ctx.accounts.chest;
    let s = credit(cm, c, amount)?;
    deposit_event(c, now, lock);
    c.deposited = c.deposited.saturating_add(amount);
    cm.total_deposited = cm.total_deposited.saturating_add(amount);
    emit_chest(cm, c, kind::DEPOSIT, amount, s as i64, 0, now)
}

/// Withdraw `amount` (gross). Before `lock_until` a 25 % penalty goes to the
/// Shield rewards; after it, withdrawal is free and can never be paused.
pub fn withdraw(ctx: Context<ChestTransfer>, amount: u64) -> Result<()> {
    require!(amount > 0, ChestError::InvalidAmount);
    let now = Clock::get()?.unix_timestamp;
    let penalty_bps = ctx.accounts.market.params.chest_penalty_bps as u32;
    let locked = now < ctx.accounts.chest.lock_until;
    let penalty = if locked {
        fee_ceil(amount, penalty_bps).mx()?
    } else {
        0
    };
    let net = amount - penalty;
    let s = {
        let cm = &mut ctx.accounts.chest_market;
        let c = &mut ctx.accounts.chest;
        debit(cm, c, amount)?
    };
    let a = &ctx.accounts;
    let seeds = chest_market_seeds(&a.chest_market);
    let cm_ai = a.chest_market.to_account_info();
    let prog = a.quote_token_program.to_account_info();
    quote_transfer(
        &prog,
        &a.vault.to_account_info(),
        &a.quote_mint,
        &a.owner_quote.to_account_info(),
        &cm_ai,
        net,
        &[&seeds],
    )?;
    quote_transfer(
        &prog,
        &a.vault.to_account_info(),
        &a.quote_mint,
        &a.shield_rewards_vault.to_account_info(),
        &cm_ai,
        penalty,
        &[&seeds],
    )?;
    let cm = &mut ctx.accounts.chest_market;
    let c = &mut ctx.accounts.chest;
    c.withdrawn = c.withdrawn.saturating_add(net);
    c.penalties_paid = c.penalties_paid.saturating_add(penalty);
    cm.total_withdrawn = cm.total_withdrawn.saturating_add(net);
    cm.total_penalties = cm.total_penalties.saturating_add(penalty);
    emit_chest(cm, c, kind::WITHDRAW, amount, -(s as i64), penalty, now)
}

// ---------------------------------------------------------------- harvest

#[derive(Accounts)]
pub struct Harvest<'info> {
    pub owner: Signer<'info>,
    #[account(seeds = [seeds::MARKET, chest_market.mint.as_ref()], bump = market.bump, seeds::program = ids::CORE)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        seeds = [seeds::CHEST_MARKET, chest_market.mint.as_ref()],
        bump = chest_market.bump,
        has_one = vault,
        has_one = holder_rewards_vault,
    )]
    pub chest_market: Box<Account<'info, ChestMarket>>,
    #[account(mut, seeds = [seeds::CHEST, chest_market.mint.as_ref(), owner.key().as_ref()], bump = chest.bump)]
    pub chest: Box<Account<'info, Chest>>,
    #[account(address = chest_market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub holder_rewards_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: signer-only PDA owning the rewards vault.
    #[account(seeds = [seeds::REWARDS_VAULT_AUTH, chest_market.mint.as_ref()], bump = chest_market.rewards_auth_bump)]
    pub rewards_auth: UncheckedAccount<'info>,
    /// CHECK: hook config (validated by the hook program).
    pub hook_config: UncheckedAccount<'info>,
    /// CHECK: the owner's holder PDA (validated by the hook program).
    #[account(mut, seeds = [seeds::HOLDER, chest_market.mint.as_ref(), owner.key().as_ref()], bump, seeds::program = ids::HOOK)]
    pub holder: UncheckedAccount<'info>,
    /// CHECK: reward state (validated by the hook program).
    #[account(mut)]
    pub reward_state: UncheckedAccount<'info>,
    pub hook_program: Program<'info, BackstopHook>,
    #[account(address = chest_market.quote_token_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
}

/// Move the owner's settled tenure-weighted fee rewards into their chest.
/// Owner-signed only (a harvest restarts the rolling lock, D-028).
pub fn harvest(ctx: Context<Harvest>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    let seeds = chest_market_seeds(&a.chest_market);
    let amount = backstop_hook::cpi::harvest(CpiContext::new_with_signer(
        ids::HOOK,
        backstop_hook::cpi::accounts::Harvest {
            authority: a.chest_market.to_account_info(),
            config: a.hook_config.to_account_info(),
            holder: a.holder.to_account_info(),
            reward_state: a.reward_state.to_account_info(),
        },
        &[&seeds],
    ))?
    .get();
    if amount == 0 {
        return Ok(());
    }
    let rbump = [a.chest_market.rewards_auth_bump];
    let rseeds: [&[u8]; 3] = [
        seeds::REWARDS_VAULT_AUTH,
        a.chest_market.mint.as_ref(),
        &rbump,
    ];
    quote_transfer(
        &a.quote_token_program.to_account_info(),
        &a.holder_rewards_vault.to_account_info(),
        &a.quote_mint,
        &a.vault.to_account_info(),
        &a.rewards_auth.to_account_info(),
        amount,
        &[&rseeds],
    )?;
    let lock = a.market.params.chest_lock_secs;
    let cm = &mut ctx.accounts.chest_market;
    let c = &mut ctx.accounts.chest;
    let s = credit(cm, c, amount)?;
    deposit_event(c, now, lock);
    c.harvested = c.harvested.saturating_add(amount);
    cm.total_harvested = cm.total_harvested.saturating_add(amount);
    emit_chest(cm, c, kind::HARVEST, amount, s as i64, 0, now)
}
