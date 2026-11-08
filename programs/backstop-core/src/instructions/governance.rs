//! Governance, guardian pause, agent bounded authority and the 48 h timelock.

use anchor_lang::prelude::*;
use backstop_common::{defaults, seeds};

use crate::errors::CoreError;
use crate::events::{ActionCancelled, ActionExecuted, ActionQueued, ParamUpdated, ParamsUpdated, PausesUpdated};
use crate::state::{
    pause, AgentAuthority, Market, MarketParams, OracleConfig, ParamBound, ParamId, QueuedAction, TimelockAction, Treasury,
    PARAM_COUNT,
};

#[derive(Accounts)]
pub struct Govern<'info> {
    pub governance: Signer<'info>,
    #[account(
        mut,
        seeds = [seeds::MARKET, market.mint.as_ref()],
        bump = market.bump,
        has_one = governance @ CoreError::Unauthorized
    )]
    pub market: Box<Account<'info, Market>>,
}

pub fn set_params(ctx: Context<Govern>, params: MarketParams) -> Result<()> {
    params.validate()?;
    let m = &mut ctx.accounts.market;
    m.params = params;
    emit!(ParamsUpdated { mint: m.mint, params, by: ctx.accounts.governance.key() });
    Ok(())
}

pub fn set_param(ctx: Context<Govern>, param: ParamId, value: u64) -> Result<()> {
    let m = &mut ctx.accounts.market;
    let old = m.params.get(param);
    m.params.set(param, value)?;
    emit!(ParamUpdated { mint: m.mint, param, old_value: old, new_value: value, by: ctx.accounts.governance.key(), agent: false });
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Roles {
    pub guardian: Pubkey,
    pub keeper: Pubkey,
    pub swap_program: Pubkey,
    pub oracle: OracleConfig,
}

pub fn set_roles(ctx: Context<Govern>, roles: Roles) -> Result<()> {
    let m = &mut ctx.accounts.market;
    m.guardian = roles.guardian;
    m.keeper = roles.keeper;
    m.swap_program = roles.swap_program;
    m.oracle = roles.oracle;
    Ok(())
}

pub fn propose_governance(ctx: Context<Govern>, new_governance: Pubkey) -> Result<()> {
    ctx.accounts.market.pending_governance = new_governance;
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptGovernance<'info> {
    pub new_governance: Signer<'info>,
    #[account(
        mut,
        seeds = [seeds::MARKET, market.mint.as_ref()],
        bump = market.bump,
        constraint = market.pending_governance == new_governance.key() @ CoreError::Unauthorized
    )]
    pub market: Box<Account<'info, Market>>,
}

pub fn accept_governance(ctx: Context<AcceptGovernance>) -> Result<()> {
    let m = &mut ctx.accounts.market;
    m.governance = m.pending_governance;
    m.pending_governance = Pubkey::default();
    Ok(())
}

#[derive(Accounts)]
pub struct SetPauses<'info> {
    pub signer: Signer<'info>,
    #[account(mut, seeds = [seeds::MARKET, market.mint.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
}

/// Governance may set any combination of pause flags; the guardian may only
/// *add* flags (emergency stop) — never unpause. Only new offers, auto-absorb
/// and the launchpad are pausable (spec §4).
pub fn set_pauses(ctx: Context<SetPauses>, pauses: u8) -> Result<()> {
    require!(pauses & !pause::ALL == 0, CoreError::InvalidParameter);
    let m = &mut ctx.accounts.market;
    let who = ctx.accounts.signer.key();
    if who == m.governance {
        m.pauses = pauses;
    } else if who == m.guardian && m.guardian != Pubkey::default() {
        require!(pauses & m.pauses == m.pauses, CoreError::GuardianCannotUnpause);
        m.pauses = pauses;
    } else {
        return err!(CoreError::Unauthorized);
    }
    emit!(PausesUpdated { mint: m.mint, pauses: m.pauses, by: who });
    Ok(())
}

// ---------------------------------------------------------------- agent ---

#[derive(Accounts)]
pub struct InitAgent<'info> {
    #[account(mut)]
    pub governance: Signer<'info>,
    #[account(seeds = [seeds::MARKET, market.mint.as_ref()], bump = market.bump, has_one = governance @ CoreError::Unauthorized)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        init,
        payer = governance,
        space = 8 + AgentAuthority::INIT_SPACE,
        seeds = [seeds::AGENT, market.mint.as_ref()],
        bump
    )]
    pub agent_authority: Box<Account<'info, AgentAuthority>>,
    pub system_program: Program<'info, System>,
}

pub fn init_agent(ctx: Context<InitAgent>, agent: Pubkey) -> Result<()> {
    let a = &mut ctx.accounts.agent_authority;
    a.bump = ctx.bumps.agent_authority;
    a.market = ctx.accounts.market.key();
    a.agent = agent;
    a.cooldown_secs = defaults::AGENT_COOLDOWN_SECS;
    a.bounds = [ParamBound::default(); PARAM_COUNT];
    a.updates = 0;
    Ok(())
}

#[derive(Accounts)]
pub struct GovernAgent<'info> {
    pub governance: Signer<'info>,
    #[account(seeds = [seeds::MARKET, market.mint.as_ref()], bump = market.bump, has_one = governance @ CoreError::Unauthorized)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [seeds::AGENT, market.mint.as_ref()], bump = agent_authority.bump)]
    pub agent_authority: Box<Account<'info, AgentAuthority>>,
}

/// Governance sets the on-chain [min, max] window for one parameter.
pub fn set_agent_bound(ctx: Context<GovernAgent>, param: ParamId, enabled: bool, min: u64, max: u64) -> Result<()> {
    require!(min <= max, CoreError::InvalidParameter);
    let b = &mut ctx.accounts.agent_authority.bounds[param as usize];
    b.enabled = enabled;
    b.min = min;
    b.max = max;
    Ok(())
}

pub fn set_agent(ctx: Context<GovernAgent>, agent: Pubkey, cooldown_secs: i64) -> Result<()> {
    require!(cooldown_secs >= 60, CoreError::InvalidParameter);
    let a = &mut ctx.accounts.agent_authority;
    a.agent = agent;
    a.cooldown_secs = cooldown_secs;
    Ok(())
}

#[derive(Accounts)]
pub struct AgentSetParam<'info> {
    pub agent: Signer<'info>,
    #[account(mut, seeds = [seeds::MARKET, market.mint.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        seeds = [seeds::AGENT, market.mint.as_ref()],
        bump = agent_authority.bump,
        has_one = agent @ CoreError::Unauthorized
    )]
    pub agent_authority: Box<Account<'info, AgentAuthority>>,
}

/// Bounded, rate-limited parameter update by the AI treasury agent. Anything
/// outside the bounds must go through governance (the agent service files a
/// proposal instead).
pub fn agent_set_param(ctx: Context<AgentSetParam>, param: ParamId, value: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let a = &mut ctx.accounts.agent_authority;
    let b = a.bounds[param as usize];
    require!(b.enabled, CoreError::NotAgentTunable);
    require!(value >= b.min && value <= b.max, CoreError::OutOfBounds);
    require!(now >= b.last_update.saturating_add(a.cooldown_secs), CoreError::Cooldown);
    let m = &mut ctx.accounts.market;
    let old = m.params.get(param);
    m.params.set(param, value)?;
    a.bounds[param as usize].last_update = now;
    a.updates = a.updates.saturating_add(1);
    emit!(ParamUpdated { mint: m.mint, param, old_value: old, new_value: value, by: ctx.accounts.agent.key(), agent: true });
    Ok(())
}

// ------------------------------------------------------------- timelock ---

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct QueueAction<'info> {
    #[account(mut)]
    pub governance: Signer<'info>,
    #[account(seeds = [seeds::MARKET, market.mint.as_ref()], bump = market.bump, has_one = governance @ CoreError::Unauthorized)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        init,
        payer = governance,
        space = 8 + QueuedAction::INIT_SPACE,
        seeds = [seeds::TIMELOCK, market.mint.as_ref(), &id.to_le_bytes()],
        bump
    )]
    pub queued: Box<Account<'info, QueuedAction>>,
    pub system_program: Program<'info, System>,
}

pub fn queue_action(ctx: Context<QueueAction>, id: u64, action: TimelockAction) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let q = &mut ctx.accounts.queued;
    q.bump = ctx.bumps.queued;
    q.market = ctx.accounts.market.key();
    q.id = id;
    q.action = action;
    q.queued_at = now;
    q.eta = now + defaults::GOVERNANCE_TIMELOCK_SECS;
    emit!(ActionQueued { mint: ctx.accounts.market.mint, id, action, eta: q.eta });
    Ok(())
}

#[derive(Accounts)]
pub struct ExecuteAction<'info> {
    /// Anyone may execute once the timelock has expired.
    pub executor: Signer<'info>,
    /// CHECK: rent refund target, must be governance.
    #[account(mut, address = market.governance)]
    pub governance: UncheckedAccount<'info>,
    #[account(mut, seeds = [seeds::MARKET, market.mint.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [seeds::TREASURY, market.mint.as_ref()], bump = market.treasury_bump)]
    pub treasury: Box<Account<'info, Treasury>>,
    #[account(
        mut,
        close = governance,
        seeds = [seeds::TIMELOCK, market.mint.as_ref(), &queued.id.to_le_bytes()],
        bump = queued.bump,
        has_one = market
    )]
    pub queued: Box<Account<'info, QueuedAction>>,
    /// CHECK: destination of a treasury withdrawal (validated against the action).
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,
}

pub fn execute_action(ctx: Context<ExecuteAction>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let q = &ctx.accounts.queued;
    require!(now >= q.eta, CoreError::TimelockNotExpired);
    match q.action {
        TimelockAction::TreasuryWithdraw { to, lamports } => {
            require_keys_eq!(ctx.accounts.destination.key(), to, CoreError::AccountMismatch);
            let t = ctx.accounts.treasury.to_account_info();
            let free = crate::instructions::treasury::treasury_free_lamports(&t, &ctx.accounts.market)?;
            require!(lamports <= free, CoreError::InsufficientTreasury);
            **t.try_borrow_mut_lamports()? -= lamports;
            **ctx.accounts.destination.to_account_info().try_borrow_mut_lamports()? += lamports;
        }
        TimelockAction::SetRedemptionPaused { paused } => {
            ctx.accounts.market.redemption_paused = paused;
        }
    }
    emit!(ActionExecuted { mint: ctx.accounts.market.mint, id: q.id, action: q.action });
    Ok(())
}

#[derive(Accounts)]
pub struct CancelAction<'info> {
    #[account(mut)]
    pub governance: Signer<'info>,
    #[account(seeds = [seeds::MARKET, market.mint.as_ref()], bump = market.bump, has_one = governance @ CoreError::Unauthorized)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, close = governance, has_one = market)]
    pub queued: Box<Account<'info, QueuedAction>>,
}

pub fn cancel_action(ctx: Context<CancelAction>) -> Result<()> {
    emit!(ActionCancelled { mint: ctx.accounts.market.mint, id: ctx.accounts.queued.id });
    Ok(())
}
