//! Shield Pool positions (spec §3.5, D-026).

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use backstop_common::cpi::transfer_checked_with_hook;
use backstop_common::{defaults, ids, seeds};
use backstop_core::state::Market;
use backstop_math::shield::{lock_multiplier_bps, ShieldPool, ShieldPosition as MathPosition};

use crate::errors::{ChestError, MathExt};
use crate::events::{ShieldPositionEvent, ShieldRewardsSynced};
use crate::instructions::chest::{chest_market_seeds, emit_chest, kind, quote_transfer};
use crate::ledger::{credit, debit, deposit_event};
use crate::state::{Chest, ChestMarket, PositionData, Shield, ShieldPoolData, ShieldPosition};

/// Distribute newly arrived Shield rewards (fee stream, penalties,
/// redemption fees) to positions by locked amount × lock multiplier.
fn sync_rewards(shield: &mut Shield, rewards_vault_amount: u64, now: i64) -> Result<()> {
    let incoming = rewards_vault_amount.saturating_sub(shield.rewards_accounted);
    if incoming == 0 {
        return Ok(());
    }
    let mut sp = ShieldPool::from(&shield.pool);
    sp.distribute_rewards(incoming).mx()?;
    shield.pool = ShieldPoolData::from(&sp);
    shield.rewards_accounted += incoming;
    emit!(ShieldRewardsSynced {
        mint: shield.mint,
        amount: incoming,
        ts: now
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SyncShieldRewards<'info> {
    #[account(mut, seeds = [seeds::SHIELD, shield.mint.as_ref()], bump = shield.bump, has_one = rewards_vault)]
    pub shield: Box<Account<'info, Shield>>,
    pub rewards_vault: Box<InterfaceAccount<'info, TokenAccount>>,
}

pub fn sync_shield_rewards(ctx: Context<SyncShieldRewards>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let amt = ctx.accounts.rewards_vault.amount;
    sync_rewards(&mut ctx.accounts.shield, amt, now)
}

// ---------------------------------------------------------------- deposit

#[derive(Accounts)]
#[instruction(amount: u64, lock_secs: u32, id: u32)]
pub struct ShieldDeposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [seeds::MARKET, shield.mint.as_ref()], bump = market.bump, seeds::program = ids::CORE)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [seeds::CHEST_MARKET, shield.mint.as_ref()], bump = chest_market.bump, has_one = vault)]
    pub chest_market: Box<Account<'info, ChestMarket>>,
    #[account(mut, seeds = [seeds::CHEST, shield.mint.as_ref(), owner.key().as_ref()], bump = chest.bump)]
    pub chest: Box<Account<'info, Chest>>,
    #[account(
        mut,
        seeds = [seeds::SHIELD, shield.mint.as_ref()],
        bump = shield.bump,
        has_one = quote_vault,
        has_one = rewards_vault,
    )]
    pub shield: Box<Account<'info, Shield>>,
    #[account(
        init,
        payer = owner,
        space = 8 + ShieldPosition::INIT_SPACE,
        seeds = [seeds::SHIELD_POSITION, shield.mint.as_ref(), owner.key().as_ref(), &id.to_le_bytes()],
        bump
    )]
    pub position: Box<Account<'info, ShieldPosition>>,
    #[account(address = chest_market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub rewards_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = chest_market.quote_token_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

/// Lock chest USDC in the Shield for `lock_secs` (≥ 30 days). Moving chest
/// funds into the Shield is not a withdrawal (no penalty, no lock change).
pub fn shield_deposit(
    ctx: Context<ShieldDeposit>,
    amount: u64,
    lock_secs: u32,
    id: u32,
) -> Result<()> {
    require!(amount > 0, ChestError::InvalidAmount);
    let now = Clock::get()?.unix_timestamp;
    let p = ctx.accounts.market.params;
    require!(
        lock_secs >= p.shield_min_lock_secs,
        ChestError::LockTooShort
    );
    let mult = lock_multiplier_bps(
        lock_secs as u64,
        p.shield_min_lock_secs as u64,
        p.shield_max_multiplier_bps,
    )
    .mx()?;
    let rv = ctx.accounts.rewards_vault.amount;
    sync_rewards(&mut ctx.accounts.shield, rv, now)?;
    let s = {
        let cm = &mut ctx.accounts.chest_market;
        let c = &mut ctx.accounts.chest;
        debit(cm, c, amount)?
    };
    let a = &ctx.accounts;
    let seeds = chest_market_seeds(&a.chest_market);
    quote_transfer(
        &a.quote_token_program.to_account_info(),
        &a.vault.to_account_info(),
        &a.quote_mint,
        &a.quote_vault.to_account_info(),
        &a.chest_market.to_account_info(),
        amount,
        &[&seeds],
    )?;
    let mut sp = ShieldPool::from(&ctx.accounts.shield.pool);
    let pos = sp.deposit(amount, mult).mx()?;
    let sh = &mut ctx.accounts.shield;
    sh.pool = ShieldPoolData::from(&sp);
    sh.positions += 1;
    let owner = ctx.accounts.owner.key();
    let ps = &mut ctx.accounts.position;
    ps.bump = ctx.bumps.position;
    ps.mint = sh.mint;
    ps.owner = owner;
    ps.id = id;
    ps.pos = PositionData::from(&pos);
    ps.principal = amount;
    ps.lock_start = now;
    ps.lock_end = now + lock_secs as i64;
    emit!(ShieldPositionEvent {
        mint: sh.mint,
        owner,
        id,
        kind: 0,
        principal: amount,
        tokens: 0,
        rewards: 0,
        multiplier_bps: mult,
        lock_end: ps.lock_end,
        ts: now,
    });
    emit_chest(
        &ctx.accounts.chest_market,
        &ctx.accounts.chest,
        kind::SHIELD_IN,
        amount,
        -(s as i64),
        0,
        now,
    )
}

// ---------------------------------------------------------- claim/withdraw

#[derive(Accounts)]
pub struct ShieldClaim<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [seeds::MARKET, shield.mint.as_ref()], bump = market.bump, seeds::program = ids::CORE)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [seeds::CHEST_MARKET, shield.mint.as_ref()], bump = chest_market.bump, has_one = vault)]
    pub chest_market: Box<Account<'info, ChestMarket>>,
    #[account(mut, seeds = [seeds::CHEST, shield.mint.as_ref(), owner.key().as_ref()], bump = chest.bump)]
    pub chest: Box<Account<'info, Chest>>,
    #[account(
        mut,
        seeds = [seeds::SHIELD, shield.mint.as_ref()],
        bump = shield.bump,
        has_one = quote_vault,
        has_one = token_vault,
        has_one = rewards_vault,
    )]
    pub shield: Box<Account<'info, Shield>>,
    #[account(
        mut,
        seeds = [seeds::SHIELD_POSITION, shield.mint.as_ref(), owner.key().as_ref(), &position.id.to_le_bytes()],
        bump = position.bump,
        has_one = owner,
    )]
    pub position: Box<Account<'info, ShieldPosition>>,
    #[account(address = shield.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = chest_market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub token_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub rewards_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = owner)]
    pub owner_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = ids::TOKEN_2022)]
    pub base_token_program: Interface<'info, TokenInterface>,
    #[account(address = chest_market.quote_token_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
    // remaining accounts: hook accounts for shield → owner
}

/// Pay out token gains (to the wallet) and fee rewards (to the chest, a
/// deposit event). Returns (tokens, rewards).
fn claim_gains<'info>(
    ctx: &mut Context<'info, ShieldClaim<'info>>,
    now: i64,
) -> Result<(u64, u64)> {
    let rv = ctx.accounts.rewards_vault.amount;
    sync_rewards(&mut ctx.accounts.shield, rv, now)?;
    let sp = ShieldPool::from(&ctx.accounts.shield.pool);
    let pos = MathPosition::from(&ctx.accounts.position.pos);
    let tokens = sp
        .token_gain(&pos)
        .mx()?
        .min(ctx.accounts.token_vault.amount);
    let rewards = sp
        .reward_gain(&pos)
        .mx()?
        .min(ctx.accounts.rewards_vault.amount);
    let a = &ctx.accounts;
    let sbump = [a.shield.bump];
    let mint_key = a.shield.mint;
    let sseeds: [&[u8]; 3] = [seeds::SHIELD, mint_key.as_ref(), &sbump];
    if tokens > 0 {
        transfer_checked_with_hook(
            &a.base_token_program.to_account_info(),
            &a.token_vault.to_account_info(),
            &a.mint.to_account_info(),
            &a.owner_token.to_account_info(),
            &a.shield.to_account_info(),
            ctx.remaining_accounts,
            tokens,
            defaults::DECIMALS,
            &[&sseeds],
        )?;
    }
    quote_transfer(
        &a.quote_token_program.to_account_info(),
        &a.rewards_vault.to_account_info(),
        &a.quote_mint,
        &a.vault.to_account_info(),
        &a.shield.to_account_info(),
        rewards,
        &[&sseeds],
    )?;
    let mut pos = pos;
    sp.refresh(&mut pos).mx()?;
    let lock = a.market.params.chest_lock_secs;
    let sh = &mut ctx.accounts.shield;
    sh.rewards_accounted = sh.rewards_accounted.saturating_sub(rewards);
    sh.tokens_accounted = sh.tokens_accounted.saturating_sub(tokens);
    let ps = &mut ctx.accounts.position;
    ps.pos = PositionData::from(&pos);
    ps.claimed_tokens = ps.claimed_tokens.saturating_add(tokens);
    ps.claimed_rewards = ps.claimed_rewards.saturating_add(rewards);
    if rewards > 0 {
        let cm = &mut ctx.accounts.chest_market;
        let c = &mut ctx.accounts.chest;
        let s = credit(cm, c, rewards)?;
        deposit_event(c, now, lock);
        emit_chest(cm, c, kind::SHIELD_REWARD, rewards, s as i64, 0, now)?;
    }
    Ok((tokens, rewards))
}

pub fn shield_claim<'info>(mut ctx: Context<'info, ShieldClaim<'info>>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let (tokens, rewards) = claim_gains(&mut ctx, now)?;
    let ps = &ctx.accounts.position;
    emit!(ShieldPositionEvent {
        mint: ps.mint,
        owner: ps.owner,
        id: ps.id,
        kind: 1,
        principal: ps.pos.initial,
        tokens,
        rewards,
        multiplier_bps: ps.pos.multiplier_bps,
        lock_end: ps.lock_end,
        ts: now,
    });
    Ok(())
}

/// After the lock: claim gains, return the compounded principal to the
/// owner's chest (not a deposit event) and close the position.
pub fn shield_withdraw<'info>(mut ctx: Context<'info, ShieldClaim<'info>>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        now >= ctx.accounts.position.lock_end,
        ChestError::StillLocked
    );
    let (tokens, rewards) = claim_gains(&mut ctx, now)?;
    let mut sp = ShieldPool::from(&ctx.accounts.shield.pool);
    let pos = MathPosition::from(&ctx.accounts.position.pos);
    let principal = sp.withdraw(&pos).mx()?.min(ctx.accounts.quote_vault.amount);
    ctx.accounts.shield.pool = ShieldPoolData::from(&sp);
    let a = &ctx.accounts;
    let sbump = [a.shield.bump];
    let mint_key = a.shield.mint;
    let sseeds: [&[u8]; 3] = [seeds::SHIELD, mint_key.as_ref(), &sbump];
    quote_transfer(
        &a.quote_token_program.to_account_info(),
        &a.quote_vault.to_account_info(),
        &a.quote_mint,
        &a.vault.to_account_info(),
        &a.shield.to_account_info(),
        principal,
        &[&sseeds],
    )?;
    {
        let cm = &mut ctx.accounts.chest_market;
        let c = &mut ctx.accounts.chest;
        let s = credit(cm, c, principal)?;
        emit_chest(cm, c, kind::SHIELD_OUT, principal, s as i64, 0, now)?;
    }
    ctx.accounts.shield.positions = ctx.accounts.shield.positions.saturating_sub(1);
    let ps = &ctx.accounts.position;
    emit!(ShieldPositionEvent {
        mint: ps.mint,
        owner: ps.owner,
        id: ps.id,
        kind: 2,
        principal,
        tokens,
        rewards,
        multiplier_bps: ps.pos.multiplier_bps,
        lock_end: ps.lock_end,
        ts: now,
    });
    // close the position (rent → owner)
    let pos_ai = ctx.accounts.position.to_account_info();
    let owner_ai = ctx.accounts.owner.to_account_info();
    **owner_ai.try_borrow_mut_lamports()? += pos_ai.lamports();
    **pos_ai.try_borrow_mut_lamports()? = 0;
    pos_ai.assign(&anchor_lang::solana_program::system_program::ID);
    pos_ai.resize(0)?;
    Ok(())
}
