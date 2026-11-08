use anchor_lang::prelude::*;
use backstop_common::seeds;
use backstop_math::weight::WeightParams;

use crate::errors::{HookError, MathExt};
use crate::events::{AllowlistUpdated, HookParamsUpdated};
use crate::state::{HookConfig, MAX_ALLOWLIST};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct HookParams {
    pub tenure_cap_secs: u64,
    pub tenure_extra_bps: u32,
    pub absorb_tenure_bps: u32,
    pub direct_sell_cap: u64,
    pub direct_sell_window_secs: u64,
    pub link_min_amount: u64,
    pub link_window_secs: u64,
}

#[derive(Accounts)]
pub struct GovernHook<'info> {
    pub governance: Signer<'info>,
    #[account(
        mut,
        seeds = [seeds::HOOK_CONFIG, config.mint.as_ref()],
        bump = config.bump,
        has_one = governance @ HookError::Unauthorized
    )]
    pub config: Box<Account<'info, HookConfig>>,
}

/// Update tenure/transfer-policy parameters. Tenure-weight changes apply to
/// each wallet at its next checkpoint (D-020).
pub fn set_params(ctx: Context<GovernHook>, p: HookParams) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    require!(p.absorb_tenure_bps <= 10_000, HookError::InvalidParameter);
    require!(
        p.direct_sell_window_secs > 0 && p.link_window_secs > 0,
        HookError::InvalidParameter
    );
    WeightParams {
        cap_secs: p.tenure_cap_secs,
        extra_bps: p.tenure_extra_bps,
        epoch_secs: cfg.epoch_secs,
        genesis_ts: cfg.genesis_ts,
    }
    .validate()
    .mx()?;
    cfg.tenure_cap_secs = p.tenure_cap_secs;
    cfg.tenure_extra_bps = p.tenure_extra_bps;
    cfg.absorb_tenure_bps = p.absorb_tenure_bps;
    cfg.direct_sell_cap = p.direct_sell_cap;
    cfg.direct_sell_window_secs = p.direct_sell_window_secs;
    cfg.link_min_amount = p.link_min_amount;
    cfg.link_window_secs = p.link_window_secs;
    emit!(HookParamsUpdated {
        mint: cfg.mint,
        tenure_cap_secs: p.tenure_cap_secs,
        tenure_extra_bps: p.tenure_extra_bps,
        absorb_tenure_bps: p.absorb_tenure_bps,
        direct_sell_cap: p.direct_sell_cap,
        link_min_amount: p.link_min_amount,
    });
    Ok(())
}

/// Replace the program and owner allowlists (≤ 8 entries each).
pub fn set_allowlist(
    ctx: Context<GovernHook>,
    programs: Vec<Pubkey>,
    owners: Vec<Pubkey>,
) -> Result<()> {
    require!(
        programs.len() <= MAX_ALLOWLIST && owners.len() <= MAX_ALLOWLIST,
        HookError::AllowlistFull
    );
    let cfg = &mut ctx.accounts.config;
    let mut p = [Pubkey::default(); MAX_ALLOWLIST];
    p[..programs.len()].copy_from_slice(&programs);
    let mut o = [Pubkey::default(); MAX_ALLOWLIST];
    o[..owners.len()].copy_from_slice(&owners);
    cfg.allowed_programs = p;
    cfg.allowed_owners = o;
    emit!(AllowlistUpdated {
        mint: cfg.mint,
        programs,
        owners
    });
    Ok(())
}

/// Step 1 of a governance hand-over.
pub fn propose_governance(ctx: Context<GovernHook>, new_governance: Pubkey) -> Result<()> {
    ctx.accounts.config.pending_governance = new_governance;
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptGovernance<'info> {
    pub new_governance: Signer<'info>,
    #[account(
        mut,
        seeds = [seeds::HOOK_CONFIG, config.mint.as_ref()],
        bump = config.bump,
        constraint = config.pending_governance == new_governance.key() @ HookError::Unauthorized
    )]
    pub config: Box<Account<'info, HookConfig>>,
}

/// Step 2 of a governance hand-over (signed by the new governance).
pub fn accept_governance(ctx: Context<AcceptGovernance>) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    cfg.governance = cfg.pending_governance;
    cfg.pending_governance = Pubkey::default();
    Ok(())
}
