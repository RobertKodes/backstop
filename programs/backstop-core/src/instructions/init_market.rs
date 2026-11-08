use anchor_lang::prelude::*;
use anchor_spl::associated_token::{get_associated_token_address_with_program_id, AssociatedToken};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use backstop_common::{ids, pda, seeds};
use backstop_hook::state::HookConfig;

use crate::errors::CoreError;
use crate::events::MarketInitialized;
use crate::mint_check::verify_engine_mint;
use crate::state::{status, Market, MarketParams, OracleConfig, Treasury, ACCOUNT_VERSION};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitMarketArgs {
    pub governance: Pubkey,
    pub guardian: Pubkey,
    pub keeper: Pubkey,
    pub swap_program: Pubkey,
    pub oracle: OracleConfig,
    /// `None` → spec defaults.
    pub params: Option<MarketParams>,
    /// Parent market mint (launchpad children); default for root markets.
    pub parent: Pubkey,
}

#[derive(Accounts)]
pub struct InitMarket<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// Hook governance (root markets) or the launchpad authority PDA (children).
    pub authority: Signer<'info>,
    /// CHECK: verified by `verify_engine_mint`.
    pub mint: UncheckedAccount<'info>,
    #[account(
        seeds = [seeds::HOOK_CONFIG, mint.key().as_ref()],
        bump = hook_config.bump,
        seeds::program = ids::HOOK,
    )]
    pub hook_config: Box<Account<'info, HookConfig>>,
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(init, payer = payer, space = 8 + Market::INIT_SPACE, seeds = [seeds::MARKET, mint.key().as_ref()], bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(init, payer = payer, space = 8 + Treasury::INIT_SPACE, seeds = [seeds::TREASURY, mint.key().as_ref()], bump)]
    pub treasury: Box<Account<'info, Treasury>>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = quote_mint,
        associated_token::authority = market,
        associated_token::token_program = quote_token_program,
    )]
    pub fee_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = quote_mint,
        associated_token::authority = treasury,
        associated_token::token_program = quote_token_program,
    )]
    pub treasury_quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        seeds = [seeds::PARENT_VAULT, mint.key().as_ref()],
        bump,
        token::mint = quote_mint,
        token::authority = market,
        token::token_program = quote_token_program,
    )]
    pub parent_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn init_market(ctx: Context<InitMarket>, args: InitMarketArgs) -> Result<()> {
    let mint = ctx.accounts.mint.key();
    let authority = ctx.accounts.authority.key();
    let is_child = authority == pda::launchpad().0;
    require!(authority == ctx.accounts.hook_config.governance || is_child, CoreError::Unauthorized);
    require!(is_child == (args.parent != Pubkey::default()), CoreError::InvalidParameter);
    require!(args.governance != Pubkey::default(), CoreError::InvalidParameter);
    let vm = verify_engine_mint(&ctx.accounts.mint.to_account_info())?;

    let quote_mint = ctx.accounts.quote_mint.key();
    let quote_program = ctx.accounts.quote_token_program.key();
    let params = match args.params {
        Some(p) => p,
        None => MarketParams::defaults(vm.supply, ctx.accounts.quote_mint.decimals),
    };
    params.validate()?;

    let now = Clock::get()?.unix_timestamp;
    let m = &mut ctx.accounts.market;
    m.version = ACCOUNT_VERSION;
    m.bump = ctx.bumps.market;
    m.treasury_bump = ctx.bumps.treasury;
    m.status = status::LIVE;
    m.mint = mint;
    m.quote_mint = quote_mint;
    m.quote_token_program = quote_program;
    m.quote_decimals = ctx.accounts.quote_mint.decimals;
    m.parent = args.parent;
    m.governance = args.governance;
    m.pending_governance = Pubkey::default();
    m.guardian = args.guardian;
    m.keeper = args.keeper;
    m.swap_program = args.swap_program;
    m.pauses = 0;
    m.redemption_paused = false;
    m.params = params;
    m.oracle = args.oracle;
    m.fee_vault = ctx.accounts.fee_vault.key();
    m.treasury_quote_vault = ctx.accounts.treasury_quote_vault.key();
    m.parent_vault = ctx.accounts.parent_vault.key();
    m.holder_rewards_vault =
        get_associated_token_address_with_program_id(&pda::rewards_vault_authority(&mint).0, &quote_mint, &quote_program);
    m.shield_rewards_vault = pda::shield_rewards_vault(&mint).0;
    m.amm_base_vault = get_associated_token_address_with_program_id(&pda::pool(&mint).0, &mint, &ids::TOKEN_2022);
    m.created_at = now;

    let t = &mut ctx.accounts.treasury;
    t.bump = ctx.bumps.treasury;
    t.market = m.key();

    emit!(MarketInitialized {
        mint,
        quote_mint,
        parent: args.parent,
        governance: args.governance,
        supply: vm.supply,
        ts: now,
    });
    Ok(())
}
