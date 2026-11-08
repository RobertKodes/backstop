//! Instructions callable only via CPI from other BACKSTOP programs, which
//! sign with their market PDAs (stored in `HookConfig`).

use anchor_lang::prelude::*;
use backstop_common::seeds;
use backstop_math::tenure::apply_bps_u128;

use crate::engine::{catch_up, is_initialized_holder, load_holder_mut, settle_only, update_holder};
use crate::errors::{HookError, MathExt};
use crate::events::{RewardsDeposited, RewardsHarvested, TenureCredited, TenureReset};
use crate::state::{Holder, HookConfig, RewardState};

#[derive(Accounts)]
pub struct CreditTenure<'info> {
    /// `backstop-offers` book PDA.
    pub authority: Signer<'info>,
    #[account(
        seeds = [seeds::HOOK_CONFIG, config.mint.as_ref()],
        bump = config.bump,
        constraint = authority.key() == config.offers_authority @ HookError::Unauthorized
    )]
    pub config: Box<Account<'info, HookConfig>>,
    #[account(mut)]
    pub holder: AccountLoader<'info, Holder>,
    #[account(mut, seeds = [seeds::REWARD_STATE, config.mint.as_ref()], bump = config.reward_bump)]
    pub reward_state: AccountLoader<'info, RewardState>,
}

/// Credit an absorber with `absorb_tenure_bps` (default 40 %) of the seller's
/// lot tenure attributable to the absorbed tokens.
pub fn credit_tenure(ctx: Context<CreditTenure>, raw_lot_tenure: u128) -> Result<()> {
    let cfg = &ctx.accounts.config;
    let now = Clock::get()?.unix_timestamp;
    let credited = apply_bps_u128(raw_lot_tenure, cfg.absorb_tenure_bps).mx()?;
    let mut rs = ctx.accounts.reward_state.load_mut()?;
    catch_up(&mut rs, cfg, now)?;
    let mut h = ctx.accounts.holder.load_mut()?;
    require!(h.mint == cfg.mint, HookError::HolderMismatch);
    update_holder(&mut rs, &mut h, cfg, now, |t| t.credit(credited, now))?;
    emit!(TenureCredited {
        mint: cfg.mint,
        wallet: h.wallet,
        raw_lot_tenure,
        credited,
        ts: now
    });
    Ok(())
}

#[derive(Accounts)]
pub struct RecordBurn<'info> {
    /// `backstop-core` market PDA.
    pub authority: Signer<'info>,
    #[account(
        seeds = [seeds::HOOK_CONFIG, config.mint.as_ref()],
        bump = config.bump,
        constraint = authority.key() == config.core_authority @ HookError::Unauthorized
    )]
    pub config: Box<Account<'info, HookConfig>>,
    /// CHECK: the burner's holder PDA (may be uninitialised).
    #[account(mut)]
    pub holder: UncheckedAccount<'info>,
    #[account(mut, seeds = [seeds::REWARD_STATE, config.mint.as_ref()], bump = config.reward_bump)]
    pub reward_state: AccountLoader<'info, RewardState>,
}

/// Burns (treasury redemption) bypass the transfer hook, so `backstop-core`
/// reports them here. A redemption is an exit: tenure resets.
pub fn record_burn(ctx: Context<RecordBurn>, wallet: Pubkey, amount: u64) -> Result<()> {
    let ai = ctx.accounts.holder.to_account_info();
    if !is_initialized_holder(&ai) {
        return Ok(());
    }
    let cfg = &ctx.accounts.config;
    let now = Clock::get()?.unix_timestamp;
    let mut rs = ctx.accounts.reward_state.load_mut()?;
    catch_up(&mut rs, cfg, now)?;
    let mut h = load_holder_mut(&ai)?;
    require!(
        h.mint == cfg.mint && h.wallet == wallet,
        HookError::HolderMismatch
    );
    update_holder(&mut rs, &mut h, cfg, now, |t| {
        t.on_outbound_reset(amount, now)
    })?;
    emit!(TenureReset {
        mint: cfg.mint,
        wallet,
        balance: h.balance,
        ts: now
    });
    Ok(())
}

#[derive(Accounts)]
pub struct DepositRewards<'info> {
    /// `backstop-core` market PDA (fee distributor).
    pub authority: Signer<'info>,
    #[account(
        seeds = [seeds::HOOK_CONFIG, config.mint.as_ref()],
        bump = config.bump,
        constraint = authority.key() == config.core_authority @ HookError::Unauthorized
    )]
    pub config: Box<Account<'info, HookConfig>>,
    #[account(mut, seeds = [seeds::REWARD_STATE, config.mint.as_ref()], bump = config.reward_bump)]
    pub reward_state: AccountLoader<'info, RewardState>,
}

/// Record holder rewards (already transferred to the chest rewards vault by
/// the caller) for distribution at the next epoch boundary.
pub fn deposit_rewards(ctx: Context<DepositRewards>, amount: u64) -> Result<()> {
    let cfg = &ctx.accounts.config;
    require!(cfg.reward_ready, HookError::RewardStateNotReady);
    let now = Clock::get()?.unix_timestamp;
    let mut rs = ctx.accounts.reward_state.load_mut()?;
    catch_up(&mut rs, cfg, now)?;
    let mut g = rs.global();
    g.deposit(amount).mx()?;
    rs.set_global(&g);
    emit!(RewardsDeposited {
        mint: cfg.mint,
        amount,
        epoch: g.last_epoch
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Harvest<'info> {
    /// `backstop-chest` chest-market PDA.
    pub authority: Signer<'info>,
    #[account(
        seeds = [seeds::HOOK_CONFIG, config.mint.as_ref()],
        bump = config.bump,
        constraint = authority.key() == config.chest_authority @ HookError::Unauthorized
    )]
    pub config: Box<Account<'info, HookConfig>>,
    #[account(mut)]
    pub holder: AccountLoader<'info, Holder>,
    #[account(mut, seeds = [seeds::REWARD_STATE, config.mint.as_ref()], bump = config.reward_bump)]
    pub reward_state: AccountLoader<'info, RewardState>,
}

/// Settle and zero a holder's pending rewards; returns the amount the chest
/// program must move from the rewards vault into the holder's chest.
pub fn harvest(ctx: Context<Harvest>) -> Result<u64> {
    let cfg = &ctx.accounts.config;
    let now = Clock::get()?.unix_timestamp;
    let mut rs = ctx.accounts.reward_state.load_mut()?;
    catch_up(&mut rs, cfg, now)?;
    let mut h = ctx.accounts.holder.load_mut()?;
    require!(h.mint == cfg.mint, HookError::HolderMismatch);
    settle_only(&rs, &mut h)?;
    let amount = h.pending_rewards;
    h.pending_rewards = 0;
    rs.total_harvested = rs.total_harvested.saturating_add(amount);
    emit!(RewardsHarvested {
        mint: cfg.mint,
        wallet: h.wallet,
        amount
    });
    Ok(amount)
}
