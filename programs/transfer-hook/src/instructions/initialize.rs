use anchor_lang::prelude::*;
use anchor_lang::system_program::{create_account, transfer, CreateAccount, Transfer};
use backstop_common::{ids, pda, seeds};
use backstop_math::weight::WeightParams;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::errors::{HookError, MathExt};
use crate::events::HookInitialized;
use crate::state::{HookConfig, RewardState, ACCOUNT_VERSION, MAX_ALLOWLIST};
use crate::token::read_mint;

/// Max bytes an account may be created with / grown by in one instruction.
pub const MAX_GROWTH: usize = 10_240;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeArgs {
    pub governance: Pubkey,
    pub genesis_ts: i64,
    pub epoch_secs: u64,
    pub tenure_cap_secs: u64,
    pub tenure_extra_bps: u32,
    pub absorb_tenure_bps: u32,
    pub direct_sell_cap: u64,
    pub link_min_amount: u64,
    pub link_window_secs: u64,
    pub direct_sell_window_secs: u64,
}

/// Extra accounts appended to every `Execute` (indices 5..=9).
pub fn extra_account_metas() -> Result<Vec<ExtraAccountMeta>> {
    let holder_seeds = |token_account_index: u8| {
        vec![
            Seed::Literal {
                bytes: seeds::HOLDER.to_vec(),
            },
            Seed::AccountKey { index: 1 },
            // token account owner lives at bytes 32..64 of the account data
            Seed::AccountData {
                account_index: token_account_index,
                data_index: 32,
                length: 32,
            },
        ]
    };
    Ok(vec![
        // 5: hook config
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: seeds::HOOK_CONFIG.to_vec(),
                },
                Seed::AccountKey { index: 1 },
            ],
            false,
            false,
        )?,
        // 6: instructions sysvar
        ExtraAccountMeta::new_with_pubkey(&solana_instructions_sysvar::ID, false, false)?,
        // 7: source holder
        ExtraAccountMeta::new_with_seeds(&holder_seeds(0), false, true)?,
        // 8: destination holder
        ExtraAccountMeta::new_with_seeds(&holder_seeds(2), false, true)?,
        // 9: reward state
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: seeds::REWARD_STATE.to_vec(),
                },
                Seed::AccountKey { index: 1 },
            ],
            false,
            true,
        )?,
    ])
}

pub fn extra_metas_size() -> usize {
    ExtraAccountMetaList::size_of(5).unwrap()
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// Current mint authority of `mint` (deployer at genesis; the launchpad
    /// PDA for child tokens).
    pub mint_authority: Signer<'info>,
    /// CHECK: validated in the handler (Token-2022 mint whose hook is us).
    pub mint: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + HookConfig::INIT_SPACE,
        seeds = [seeds::HOOK_CONFIG, mint.key().as_ref()],
        bump
    )]
    pub config: Box<Account<'info, HookConfig>>,
    /// CHECK: TLV buffer written by this instruction.
    #[account(
        init,
        payer = payer,
        space = extra_metas_size(),
        seeds = [seeds::EXTRA_ACCOUNT_METAS, mint.key().as_ref()],
        bump
    )]
    pub extra_metas: UncheckedAccount<'info>,
    /// CHECK: created here with the first 10 KiB; grown by `grow_reward_state`.
    #[account(mut, seeds = [seeds::REWARD_STATE, mint.key().as_ref()], bump)]
    pub reward_state: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let mi = read_mint(&ctx.accounts.mint.to_account_info())?;
    require!(
        mi.hook_program == Some(crate::ID),
        HookError::WrongHookProgram
    );
    require!(
        mi.mint_authority == Some(ctx.accounts.mint_authority.key()),
        HookError::NotMintAuthority
    );
    require!(
        args.absorb_tenure_bps <= 10_000,
        HookError::InvalidParameter
    );
    require!(
        args.governance != Pubkey::default(),
        HookError::InvalidParameter
    );
    let wp = WeightParams {
        cap_secs: args.tenure_cap_secs,
        extra_bps: args.tenure_extra_bps,
        epoch_secs: args.epoch_secs,
        genesis_ts: args.genesis_ts,
    };
    wp.validate().mx()?;

    let cfg = &mut ctx.accounts.config;
    cfg.version = ACCOUNT_VERSION;
    cfg.bump = ctx.bumps.config;
    cfg.reward_bump = ctx.bumps.reward_state;
    cfg.reward_ready = false;
    cfg.mint = mint_key;
    cfg.governance = args.governance;
    cfg.pending_governance = Pubkey::default();
    cfg.core_authority = pda::market(&mint_key).0;
    cfg.offers_authority = pda::book(&mint_key).0;
    cfg.chest_authority = pda::chest_market(&mint_key).0;
    cfg.amm_authority = pda::pool(&mint_key).0;
    let mut programs = [Pubkey::default(); MAX_ALLOWLIST];
    programs[..ids::PROTOCOL_PROGRAMS.len()].copy_from_slice(&ids::PROTOCOL_PROGRAMS);
    cfg.allowed_programs = programs;
    let owners_src = pda::protocol_owners(&mint_key);
    let mut owners = [Pubkey::default(); MAX_ALLOWLIST];
    owners[..owners_src.len()].copy_from_slice(&owners_src);
    cfg.allowed_owners = owners;
    cfg.tenure_cap_secs = args.tenure_cap_secs;
    cfg.tenure_extra_bps = args.tenure_extra_bps;
    cfg.absorb_tenure_bps = args.absorb_tenure_bps;
    cfg.direct_sell_cap = args.direct_sell_cap;
    cfg.direct_sell_window_secs = args.direct_sell_window_secs;
    cfg.link_min_amount = args.link_min_amount;
    cfg.link_window_secs = args.link_window_secs;
    cfg.epoch_secs = args.epoch_secs;
    cfg.genesis_ts = args.genesis_ts;
    cfg.holders = 0;

    // Extra account metas TLV.
    {
        let metas = extra_account_metas()?;
        let ai = ctx.accounts.extra_metas.to_account_info();
        let mut data = ai.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &metas)?;
    }

    // Reward state: create the first chunk (CPI creation is capped at 10 KiB).
    let space = RewardState::SIZE.min(MAX_GROWTH);
    let lamports = Rent::get()?.minimum_balance(space);
    let bump = [ctx.bumps.reward_state];
    let signer: &[&[u8]] = &[seeds::REWARD_STATE, mint_key.as_ref(), &bump];
    create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.key(),
            CreateAccount {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.reward_state.to_account_info(),
            },
            &[signer],
        ),
        lamports,
        space as u64,
        &crate::ID,
    )?;

    emit!(HookInitialized {
        mint: mint_key,
        governance: args.governance,
        genesis_ts: args.genesis_ts,
        epoch_secs: args.epoch_secs
    });
    Ok(())
}

#[derive(Accounts)]
pub struct GrowRewardState<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [seeds::HOOK_CONFIG, config.mint.as_ref()], bump = config.bump)]
    pub config: Box<Account<'info, HookConfig>>,
    /// CHECK: PDA verified by seeds; ownership checked by `owner`.
    #[account(mut, seeds = [seeds::REWARD_STATE, config.mint.as_ref()], bump = config.reward_bump, owner = crate::ID)]
    pub reward_state: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Grow the reward state by up to 10 KiB; initialises it once full size.
pub fn grow_reward_state(ctx: Context<GrowRewardState>) -> Result<()> {
    require!(
        !ctx.accounts.config.reward_ready,
        HookError::InvalidParameter
    );
    let ai = ctx.accounts.reward_state.to_account_info();
    let new_len = (ai.data_len() + MAX_GROWTH).min(RewardState::SIZE);
    let need = Rent::get()?.minimum_balance(new_len);
    if need > ai.lamports() {
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ai.clone(),
                },
            ),
            need - ai.lamports(),
        )?;
    }
    ai.resize(new_len)?;
    if new_len == RewardState::SIZE {
        {
            let mut data = ai.try_borrow_mut_data()?;
            data[..8].copy_from_slice(RewardState::DISCRIMINATOR);
        }
        let mut data = ai.try_borrow_mut_data()?;
        let rs: &mut RewardState = bytemuck::from_bytes_mut(&mut data[8..RewardState::SIZE]);
        rs.mint = ctx.accounts.config.mint;
        rs.bump = ctx.accounts.config.reward_bump;
        rs.version = ACCOUNT_VERSION;
        // last_epoch starts at the boundary in effect now so that no
        // historical (empty) epochs need processing.
        let now = Clock::get()?.unix_timestamp;
        rs.last_epoch = ctx.accounts.config.weight_params().epoch_at(now);
        drop(data);
        ctx.accounts.config.reward_ready = true;
    }
    Ok(())
}
