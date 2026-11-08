//! Wallet-facing instructions: register / sync / close a holder account and
//! the permissionless checkpoint + epoch cranks.

use std::collections::BTreeSet;

use anchor_lang::prelude::*;
use backstop_common::seeds;
use backstop_math::rewards::MAX_CATCH_UP;

use crate::engine::{catch_up, init_holder_rewards, settle_only, update_holder};
use crate::errors::{HookError, MathExt};
use crate::events::{EpochsAdvanced, HolderRegistered, HolderSynced};
use crate::state::{Holder, HookConfig, RewardState, ACCOUNT_VERSION};
use crate::token::{is_on_curve, read_token_account};

/// Sum the balances of the wallet's token accounts passed as remaining
/// accounts. Each must be a distinct Token-2022 account of `mint` owned by
/// `wallet`, so the result never exceeds the wallet's true balance.
fn verified_balance(remaining: &[AccountInfo], mint: &Pubkey, wallet: &Pubkey) -> Result<u64> {
    let mut seen = BTreeSet::new();
    let mut total: u64 = 0;
    for ai in remaining {
        require!(seen.insert(ai.key()), HookError::DuplicateAccount);
        let t = read_token_account(ai)?;
        require_keys_eq!(t.mint, *mint, HookError::MintMismatch);
        require_keys_eq!(t.owner, *wallet, HookError::HolderMismatch);
        total = total.checked_add(t.amount).ok_or(HookError::MathOverflow)?;
    }
    Ok(total)
}

#[derive(Accounts)]
pub struct RegisterHolder<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub wallet: Signer<'info>,
    /// CHECK: key only (bound to config via has_one).
    pub mint: UncheckedAccount<'info>,
    #[account(mut, seeds = [seeds::HOOK_CONFIG, mint.key().as_ref()], bump = config.bump, has_one = mint)]
    pub config: Box<Account<'info, HookConfig>>,
    #[account(
        init,
        payer = payer,
        space = Holder::SIZE,
        seeds = [seeds::HOLDER, mint.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub holder: AccountLoader<'info, Holder>,
    #[account(mut, seeds = [seeds::REWARD_STATE, mint.key().as_ref()], bump = config.reward_bump)]
    pub reward_state: AccountLoader<'info, RewardState>,
    pub system_program: Program<'info, System>,
}

/// Create the wallet's holder account. Remaining accounts: the wallet's
/// token accounts for this mint (their current balance starts at tenure 0).
pub fn register_holder<'info>(ctx: Context<'info, RegisterHolder<'info>>) -> Result<()> {
    let cfg = &ctx.accounts.config;
    require!(cfg.reward_ready, HookError::RewardStateNotReady);
    let wallet = ctx.accounts.wallet.key();
    require!(is_on_curve(&wallet), HookError::Unauthorized);
    let mint = ctx.accounts.mint.key();
    let balance = verified_balance(ctx.remaining_accounts, &mint, &wallet)?;
    let now = Clock::get()?.unix_timestamp;

    let mut rs = ctx.accounts.reward_state.load_mut()?;
    catch_up(&mut rs, cfg, now)?;
    let mut h = ctx.accounts.holder.load_init()?;
    h.mint = mint;
    h.wallet = wallet;
    h.registered_at = now;
    h.last_ts = now;
    h.bump = ctx.bumps.holder;
    h.version = ACCOUNT_VERSION;
    init_holder_rewards(&rs, &mut h);
    update_holder(&mut rs, &mut h, cfg, now, |t| t.on_inbound(balance, now))?;
    rs.holders = rs.holders.saturating_add(1);
    drop(h);
    drop(rs);
    ctx.accounts.config.holders = ctx.accounts.config.holders.saturating_add(1);
    emit!(HolderRegistered {
        mint,
        wallet,
        balance,
        ts: now
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SyncHolder<'info> {
    pub wallet: Signer<'info>,
    #[account(seeds = [seeds::HOOK_CONFIG, config.mint.as_ref()], bump = config.bump)]
    pub config: Box<Account<'info, HookConfig>>,
    #[account(
        mut,
        seeds = [seeds::HOLDER, config.mint.as_ref(), wallet.key().as_ref()],
        bump = holder.load()?.bump
    )]
    pub holder: AccountLoader<'info, Holder>,
    #[account(mut, seeds = [seeds::REWARD_STATE, config.mint.as_ref()], bump = config.reward_bump)]
    pub reward_state: AccountLoader<'info, RewardState>,
}

/// Re-synchronise the tracked balance from the wallet's token accounts
/// (remaining accounts). Added tokens start at tenure 0; a lower total is an
/// exit (tenure reset).
pub fn sync_holder<'info>(ctx: Context<'info, SyncHolder<'info>>) -> Result<()> {
    let cfg = &ctx.accounts.config;
    let wallet = ctx.accounts.wallet.key();
    let balance = verified_balance(ctx.remaining_accounts, &cfg.mint, &wallet)?;
    let now = Clock::get()?.unix_timestamp;
    let mut rs = ctx.accounts.reward_state.load_mut()?;
    catch_up(&mut rs, cfg, now)?;
    let mut h = ctx.accounts.holder.load_mut()?;
    update_holder(&mut rs, &mut h, cfg, now, |t| t.resync(balance, now))?;
    emit!(HolderSynced {
        mint: cfg.mint,
        wallet,
        balance,
        ts: now
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CloseHolder<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(mut, seeds = [seeds::HOOK_CONFIG, config.mint.as_ref()], bump = config.bump)]
    pub config: Box<Account<'info, HookConfig>>,
    #[account(
        mut,
        close = wallet,
        seeds = [seeds::HOLDER, config.mint.as_ref(), wallet.key().as_ref()],
        bump = holder.load()?.bump
    )]
    pub holder: AccountLoader<'info, Holder>,
    #[account(mut, seeds = [seeds::REWARD_STATE, config.mint.as_ref()], bump = config.reward_bump)]
    pub reward_state: AccountLoader<'info, RewardState>,
}

/// Close an empty holder account (zero tracked balance, nothing to harvest).
pub fn close_holder(ctx: Context<CloseHolder>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    {
        let cfg = &ctx.accounts.config;
        let mut rs = ctx.accounts.reward_state.load_mut()?;
        catch_up(&mut rs, cfg, now)?;
        let mut h = ctx.accounts.holder.load_mut()?;
        settle_only(&rs, &mut h)?;
        require!(
            h.balance == 0 && h.pending_rewards == 0,
            HookError::HolderNotEmpty
        );
        // Zero balance ⇒ zero weight contribution; remove defensively.
        let w = h.weight();
        let mut g = rs.global();
        g.remove_weight(&mut *rs, &w).mx()?;
        rs.set_global(&g);
        rs.holders = rs.holders.saturating_sub(1);
    }
    ctx.accounts.config.holders = ctx.accounts.config.holders.saturating_sub(1);
    Ok(())
}

#[derive(Accounts)]
pub struct Checkpoint<'info> {
    #[account(seeds = [seeds::HOOK_CONFIG, config.mint.as_ref()], bump = config.bump)]
    pub config: Box<Account<'info, HookConfig>>,
    #[account(mut, seeds = [seeds::REWARD_STATE, config.mint.as_ref()], bump = config.reward_bump)]
    pub reward_state: AccountLoader<'info, RewardState>,
}

/// Permissionless: settle and refresh the weight form of the holders passed
/// as (writable) remaining accounts. Used by the keeper to keep idle wallets
/// inside the snapshot horizon and to apply parameter changes.
pub fn checkpoint<'info>(ctx: Context<'info, Checkpoint<'info>>) -> Result<()> {
    let cfg = &ctx.accounts.config;
    let now = Clock::get()?.unix_timestamp;
    let mut rs = ctx.accounts.reward_state.load_mut()?;
    catch_up(&mut rs, cfg, now)?;
    for ai in ctx.remaining_accounts {
        let loader = AccountLoader::<Holder>::try_from(ai)?;
        let mut h = loader.load_mut()?;
        require!(h.mint == cfg.mint, HookError::HolderMismatch);
        update_holder(&mut rs, &mut h, cfg, now, |t| t.materialize(now))?;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct AdvanceEpochs<'info> {
    #[account(seeds = [seeds::HOOK_CONFIG, config.mint.as_ref()], bump = config.bump)]
    pub config: Box<Account<'info, HookConfig>>,
    #[account(mut, seeds = [seeds::REWARD_STATE, config.mint.as_ref()], bump = config.reward_bump)]
    pub reward_state: AccountLoader<'info, RewardState>,
}

/// Permissionless: process up to `max_steps` pending epoch boundaries.
pub fn advance_epochs(ctx: Context<AdvanceEpochs>, max_steps: u64) -> Result<()> {
    let cfg = &ctx.accounts.config;
    require!(cfg.reward_ready, HookError::RewardStateNotReady);
    let now = Clock::get()?.unix_timestamp;
    let target = cfg.weight_params().epoch_at(now);
    let mut rs = ctx.accounts.reward_state.load_mut()?;
    let from = rs.last_epoch;
    let mut g = rs.global();
    g.advance_to(&mut *rs, target, max_steps.clamp(1, MAX_CATCH_UP))
        .mx()?;
    rs.set_global(&g);
    emit!(EpochsAdvanced {
        mint: cfg.mint,
        from_epoch: from,
        to_epoch: g.last_epoch
    });
    Ok(())
}
