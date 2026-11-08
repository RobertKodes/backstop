//! # backstop-hook
//!
//! Token-2022 transfer hook for every mint running on the BACKSTOP engine.
//!
//! Responsibilities:
//! 1. **Routing allowlist** — tokens may only move through protocol programs
//!    or direct wallet-to-wallet transfers (D-012).
//! 2. **Tenure** — per-wallet time-weighted holding score, reset on exit,
//!    zero for inbound tokens, credited on absorbs (spec §3.1).
//! 3. **Tenure-weighted holder rewards** — exact epoch accumulator without
//!    loops over holders (D-020); the chest program harvests into chests.
//!
//! PDAs (all under this program):
//! * `["hook_config", mint]` — [`state::HookConfig`]
//! * `["extra-account-metas", mint]` — SPL transfer-hook TLV list
//! * `["holder", mint, wallet]` — [`state::Holder`]
//! * `["reward_state", mint]` — [`state::RewardState`]

use anchor_lang::prelude::*;
use spl_discriminator::SplDiscriminate;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

pub mod engine;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod token;

use instructions::*;

declare_id!("g86T56A9yM46y5cyVCVzB1K6MtV5cx89DsFiapy59eP");

#[program]
pub mod backstop_hook {
    use super::*;

    /// Create the hook config, extra-account-meta list and the first chunk of
    /// the reward state for `mint`. Signed by the current mint authority.
    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        instructions::initialize::initialize(ctx, args)
    }

    /// Grow the reward state by 10 KiB (call until `reward_ready`).
    pub fn grow_reward_state(ctx: Context<GrowRewardState>) -> Result<()> {
        instructions::initialize::grow_reward_state(ctx)
    }

    /// SPL transfer-hook `Execute`, invoked by Token-2022 on every transfer.
    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        instructions::execute::execute(ctx, amount)
    }

    pub fn register_holder<'info>(ctx: Context<'info, RegisterHolder<'info>>) -> Result<()> {
        instructions::holder::register_holder(ctx)
    }

    pub fn sync_holder<'info>(ctx: Context<'info, SyncHolder<'info>>) -> Result<()> {
        instructions::holder::sync_holder(ctx)
    }

    pub fn close_holder(ctx: Context<CloseHolder>) -> Result<()> {
        instructions::holder::close_holder(ctx)
    }

    pub fn checkpoint<'info>(ctx: Context<'info, Checkpoint<'info>>) -> Result<()> {
        instructions::holder::checkpoint(ctx)
    }

    pub fn advance_epochs(ctx: Context<AdvanceEpochs>, max_steps: u64) -> Result<()> {
        instructions::holder::advance_epochs(ctx, max_steps)
    }

    pub fn credit_tenure(ctx: Context<CreditTenure>, raw_lot_tenure: u128) -> Result<()> {
        instructions::privileged::credit_tenure(ctx, raw_lot_tenure)
    }

    pub fn record_burn(ctx: Context<RecordBurn>, wallet: Pubkey, amount: u64) -> Result<()> {
        instructions::privileged::record_burn(ctx, wallet, amount)
    }

    pub fn deposit_rewards(ctx: Context<DepositRewards>, amount: u64) -> Result<()> {
        instructions::privileged::deposit_rewards(ctx, amount)
    }

    pub fn harvest(ctx: Context<Harvest>) -> Result<u64> {
        instructions::privileged::harvest(ctx)
    }

    pub fn set_params(ctx: Context<GovernHook>, params: HookParams) -> Result<()> {
        instructions::governance::set_params(ctx, params)
    }

    pub fn set_allowlist(
        ctx: Context<GovernHook>,
        programs: Vec<Pubkey>,
        owners: Vec<Pubkey>,
    ) -> Result<()> {
        instructions::governance::set_allowlist(ctx, programs, owners)
    }

    pub fn propose_governance(ctx: Context<GovernHook>, new_governance: Pubkey) -> Result<()> {
        instructions::governance::propose_governance(ctx, new_governance)
    }

    pub fn accept_governance(ctx: Context<AcceptGovernance>) -> Result<()> {
        instructions::governance::accept_governance(ctx)
    }
}
