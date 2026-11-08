use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use backstop_common::{defaults, ids, pda, seeds};
use backstop_core::state::Market;
use backstop_math::twap::{spot_price, Oracle};

use crate::errors::{AmmError, MathExt};
use crate::events::PoolInitialized;
use crate::state::Pool;

#[derive(Accounts)]
pub struct InitPool<'info> {
    /// Funds the quote seed liquidity and rent.
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
        has_one = amm_base_vault,
    )]
    pub market: Box<Account<'info, Market>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(init, payer = payer, space = Pool::SIZE, seeds = [seeds::POOL, mint.key().as_ref()], bump)]
    pub pool: AccountLoader<'info, Pool>,
    /// ATA(pool, mint) already holding the liquidity supply.
    #[account(
        associated_token::mint = mint,
        associated_token::authority = pool,
        associated_token::token_program = base_token_program,
    )]
    pub amm_base_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = quote_mint,
        associated_token::authority = pool,
        associated_token::token_program = quote_token_program,
    )]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = quote_mint, token::authority = payer, token::token_program = quote_token_program)]
    pub payer_quote: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = ids::TOKEN_2022)]
    pub base_token_program: Interface<'info, TokenInterface>,
    #[account(address = market.quote_token_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn init_pool(ctx: Context<InitPool>, quote_amount: u64) -> Result<()> {
    let a = &ctx.accounts;
    let authority = a.authority.key();
    require!(
        authority == a.market.governance || authority == pda::launchpad().0,
        AmmError::Unauthorized
    );
    let base = a.amm_base_vault.amount;
    require!(base > 0 && quote_amount > 0, AmmError::InvalidAmount);

    token_interface::transfer_checked(
        CpiContext::new(
            a.quote_token_program.key(),
            TransferChecked {
                from: a.payer_quote.to_account_info(),
                mint: a.quote_mint.to_account_info(),
                to: a.quote_vault.to_account_info(),
                authority: a.payer.to_account_info(),
            },
        ),
        quote_amount,
        a.quote_mint.decimals,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let price = spot_price(quote_amount, base).mx()?;
    let mut p = ctx.accounts.pool.load_init()?;
    p.mint = ctx.accounts.mint.key();
    p.quote_mint = ctx.accounts.quote_mint.key();
    p.market = ctx.accounts.market.key();
    p.base_vault = ctx.accounts.amm_base_vault.key();
    p.quote_vault = ctx.accounts.quote_vault.key();
    p.fee_vault = ctx.accounts.market.fee_vault;
    p.base_reserve = base;
    p.quote_reserve = quote_amount;
    p.created_at = now;
    p.direct_hour_start = now;
    p.bump = ctx.bumps.pool;
    p.version = 1;
    p.quote_decimals = ctx.accounts.quote_mint.decimals;
    p.set_oracle(&Oracle::new(now, price, defaults::TWAP_OBS_INTERVAL_SECS));
    emit!(PoolInitialized {
        mint: p.mint,
        quote_mint: p.quote_mint,
        base_reserve: base,
        quote_reserve: quote_amount,
        price,
        ts: now,
    });
    Ok(())
}
