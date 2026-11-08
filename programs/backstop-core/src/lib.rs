//! # backstop-core
//!
//! Market registry and governance for every mint on the BACKSTOP engine:
//! * verified market creation (mint safety checks, D-014),
//! * all governable parameters + the AI agent's bounded authority,
//! * fee distribution (70 % chests / 10 % Shield / 20 % treasury; children
//!   route 30 % to the parent first),
//! * keeper fee conversions bounded by an oracle and a slippage cap,
//! * the SOL treasury floor and always-on redemption,
//! * a 48 h timelock for the only actions that can touch the treasury or
//!   pause redemption.
//!
//! PDAs (all under this program): `["market", mint]`, `["treasury", mint]`,
//! `["agent", mint]`, `["timelock", mint, id]`, `["parent_vault", mint]`.

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod mint_check;
pub mod oracle;
pub mod state;

use instructions::*;
use state::{MarketParams, ParamId, TimelockAction};

declare_id!("AstnKdypNsaRAxX88cTCDCit11mCqeRRnQ2x6cfZJFzK");

#[program]
pub mod backstop_core {
    use super::*;

    pub fn init_market(ctx: Context<InitMarket>, args: InitMarketArgs) -> Result<()> {
        instructions::init_market::init_market(ctx, args)
    }

    // ---- governance
    pub fn set_params(ctx: Context<Govern>, params: MarketParams) -> Result<()> {
        instructions::governance::set_params(ctx, params)
    }
    pub fn set_param(ctx: Context<Govern>, param: ParamId, value: u64) -> Result<()> {
        instructions::governance::set_param(ctx, param, value)
    }
    pub fn set_roles(ctx: Context<Govern>, roles: Roles) -> Result<()> {
        instructions::governance::set_roles(ctx, roles)
    }
    pub fn propose_governance(ctx: Context<Govern>, new_governance: Pubkey) -> Result<()> {
        instructions::governance::propose_governance(ctx, new_governance)
    }
    pub fn accept_governance(ctx: Context<AcceptGovernance>) -> Result<()> {
        instructions::governance::accept_governance(ctx)
    }
    pub fn set_pauses(ctx: Context<SetPauses>, pauses: u8) -> Result<()> {
        instructions::governance::set_pauses(ctx, pauses)
    }

    // ---- agent
    pub fn init_agent(ctx: Context<InitAgent>, agent: Pubkey) -> Result<()> {
        instructions::governance::init_agent(ctx, agent)
    }
    pub fn set_agent_bound(ctx: Context<GovernAgent>, param: ParamId, enabled: bool, min: u64, max: u64) -> Result<()> {
        instructions::governance::set_agent_bound(ctx, param, enabled, min, max)
    }
    pub fn set_agent(ctx: Context<GovernAgent>, agent: Pubkey, cooldown_secs: i64) -> Result<()> {
        instructions::governance::set_agent(ctx, agent, cooldown_secs)
    }
    pub fn agent_set_param(ctx: Context<AgentSetParam>, param: ParamId, value: u64) -> Result<()> {
        instructions::governance::agent_set_param(ctx, param, value)
    }

    // ---- timelock
    pub fn queue_action(ctx: Context<QueueAction>, id: u64, action: TimelockAction) -> Result<()> {
        instructions::governance::queue_action(ctx, id, action)
    }
    pub fn execute_action(ctx: Context<ExecuteAction>) -> Result<()> {
        instructions::governance::execute_action(ctx)
    }
    pub fn cancel_action(ctx: Context<CancelAction>) -> Result<()> {
        instructions::governance::cancel_action(ctx)
    }

    // ---- fees
    pub fn distribute_fees(ctx: Context<DistributeFees>) -> Result<()> {
        instructions::fees::distribute_fees(ctx)
    }
    pub fn deposit_external_rewards(ctx: Context<DepositExternalRewards>, amount: u64) -> Result<()> {
        instructions::fees::deposit_external_rewards(ctx, amount)
    }
    pub fn convert_treasury<'info>(ctx: Context<'info, ConvertTreasury<'info>>, amount_in: u64, swap_data: Vec<u8>) -> Result<()> {
        instructions::fees::convert_treasury(ctx, amount_in, swap_data)
    }
    pub fn convert_parent_share<'info>(
        ctx: Context<'info, ConvertParentShare<'info>>,
        amount_in: u64,
        swap_data: Vec<u8>,
    ) -> Result<()> {
        instructions::fees::convert_parent_share(ctx, amount_in, swap_data)
    }
    pub fn convert_shield_lamports<'info>(
        ctx: Context<'info, ConvertShieldLamports<'info>>,
        lamports: u64,
        swap_data: Vec<u8>,
    ) -> Result<()> {
        instructions::fees::convert_shield_lamports(ctx, lamports, swap_data)
    }

    // ---- treasury
    pub fn redeem(ctx: Context<Redeem>, amount: u64, min_lamports_out: u64) -> Result<()> {
        instructions::treasury::redeem(ctx, amount, min_lamports_out)
    }
    pub fn snapshot(ctx: Context<Snapshot>) -> Result<()> {
        instructions::treasury::snapshot(ctx)
    }
    pub fn donate_treasury(ctx: Context<DonateTreasury>, lamports: u64) -> Result<()> {
        instructions::treasury::donate_treasury(ctx, lamports)
    }
}
