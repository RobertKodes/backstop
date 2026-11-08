use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use backstop_common::{ids, pda, seeds};
use backstop_core::state::Market;
use backstop_math::shield::ShieldPool;

use crate::errors::ChestError;
use crate::state::{adapter_kind, ChestMarket, Shield, ShieldPoolData};

#[derive(Accounts)]
pub struct InitChestMarket<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// Market governance (root markets) or the launchpad PDA (children).
    pub authority: Signer<'info>,
    #[account(
        seeds = [seeds::MARKET, mint.key().as_ref()],
        bump = market.bump,
        seeds::program = ids::CORE,
        has_one = mint,
        has_one = quote_mint,
        has_one = holder_rewards_vault,
        has_one = shield_rewards_vault,
    )]
    pub market: Box<Account<'info, Market>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(init, payer = payer, space = 8 + ChestMarket::INIT_SPACE, seeds = [seeds::CHEST_MARKET, mint.key().as_ref()], bump)]
    pub chest_market: Box<Account<'info, ChestMarket>>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = quote_mint,
        associated_token::authority = chest_market,
        associated_token::token_program = quote_token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: signer-only PDA owning the holder-rewards vault.
    #[account(seeds = [seeds::REWARDS_VAULT_AUTH, mint.key().as_ref()], bump)]
    pub rewards_auth: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = quote_mint,
        associated_token::authority = rewards_auth,
        associated_token::token_program = quote_token_program,
    )]
    pub holder_rewards_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(init, payer = payer, space = 8 + Shield::INIT_SPACE, seeds = [seeds::SHIELD, mint.key().as_ref()], bump)]
    pub shield: Box<Account<'info, Shield>>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = quote_mint,
        associated_token::authority = shield,
        associated_token::token_program = quote_token_program,
    )]
    pub shield_quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = shield,
        associated_token::token_program = base_token_program,
    )]
    pub shield_token_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        seeds = [seeds::SHIELD_REWARDS, mint.key().as_ref()],
        bump,
        token::mint = quote_mint,
        token::authority = shield,
        token::token_program = quote_token_program,
    )]
    pub shield_rewards_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = ids::TOKEN_2022)]
    pub base_token_program: Interface<'info, TokenInterface>,
    #[account(address = market.quote_token_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn init_chest_market(ctx: Context<InitChestMarket>) -> Result<()> {
    let auth = ctx.accounts.authority.key();
    require!(
        auth == ctx.accounts.market.governance || auth == pda::launchpad().0,
        ChestError::Unauthorized
    );
    let mint = ctx.accounts.mint.key();
    let cm = &mut ctx.accounts.chest_market;
    cm.bump = ctx.bumps.chest_market;
    cm.rewards_auth_bump = ctx.bumps.rewards_auth;
    cm.mint = mint;
    cm.quote_mint = ctx.accounts.quote_mint.key();
    cm.quote_token_program = ctx.accounts.quote_token_program.key();
    cm.vault = ctx.accounts.vault.key();
    cm.holder_rewards_vault = ctx.accounts.holder_rewards_vault.key();
    cm.adapter_kind = adapter_kind::NONE;

    let s = &mut ctx.accounts.shield;
    s.bump = ctx.bumps.shield;
    s.mint = mint;
    s.quote_vault = ctx.accounts.shield_quote_vault.key();
    s.token_vault = ctx.accounts.shield_token_vault.key();
    s.rewards_vault = ctx.accounts.shield_rewards_vault.key();
    s.pool = ShieldPoolData::from(&ShieldPool::default());
    Ok(())
}
