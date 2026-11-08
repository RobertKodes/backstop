//! # mock-swap — TEST ONLY
//!
//! 1. `cpi_transfer`: a "hostile DEX" that tries to move hook-enabled tokens
//!    via CPI. The BACKSTOP hook must reject it (UnauthorizedProgram).
//! 2. `init_pool` / `swap`: a fixed-rate swap used as the Jupiter stand-in on
//!    localnet (fee conversion USDC→SOL, child SOL→USDC). The rate is settable
//!    so tests can simulate bad routes and verify slippage protection.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use backstop_common::cpi::transfer_checked_with_hook;

declare_id!("6Z91SCsTwG12QF5A52G2TcvWXSrzToVe4d574TX3CHVg");

pub const POOL_SEED: &[u8] = b"mock_pool";

#[program]
pub mod mock_swap {
    use super::*;

    /// Move hook tokens from `from` to `to` via CPI (expected to be rejected
    /// by the BACKSTOP hook). Remaining accounts: hook extra accounts.
    pub fn cpi_transfer<'info>(
        ctx: Context<'info, CpiTransfer<'info>>,
        amount: u64,
        decimals: u8,
    ) -> Result<()> {
        transfer_checked_with_hook(
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.from.to_account_info(),
            &ctx.accounts.mint.to_account_info(),
            &ctx.accounts.to.to_account_info(),
            &ctx.accounts.authority.to_account_info(),
            ctx.remaining_accounts,
            amount,
            decimals,
            &[],
        )
    }

    pub fn init_pool(ctx: Context<InitPool>, rate_num: u64, rate_den: u64) -> Result<()> {
        require!(rate_den > 0, MockError::BadRate);
        let p = &mut ctx.accounts.pool;
        p.mint_in = ctx.accounts.mint_in.key();
        p.mint_out = ctx.accounts.mint_out.key();
        p.rate_num = rate_num;
        p.rate_den = rate_den;
        p.bump = ctx.bumps.pool;
        p.admin = ctx.accounts.admin.key();
        Ok(())
    }

    pub fn set_rate(ctx: Context<SetRate>, rate_num: u64, rate_den: u64) -> Result<()> {
        require!(rate_den > 0, MockError::BadRate);
        ctx.accounts.pool.rate_num = rate_num;
        ctx.accounts.pool.rate_den = rate_den;
        Ok(())
    }

    /// Swap `amount_in` of `mint_in` for `amount_in × num / den` of
    /// `mint_out`. The `user` signer may be a PDA (CPI from backstop-core).
    pub fn swap(ctx: Context<Swap>, amount_in: u64, min_out: u64) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let out = (amount_in as u128 * pool.rate_num as u128 / pool.rate_den as u128) as u64;
        require!(out >= min_out, MockError::Slippage);
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program_in.key(),
                TransferChecked {
                    from: ctx.accounts.user_in.to_account_info(),
                    mint: ctx.accounts.mint_in.to_account_info(),
                    to: ctx.accounts.vault_in.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount_in,
            ctx.accounts.mint_in.decimals,
        )?;
        let mint_in = pool.mint_in;
        let mint_out = pool.mint_out;
        let bump = [pool.bump];
        let seeds: &[&[u8]] = &[POOL_SEED, mint_in.as_ref(), mint_out.as_ref(), &bump];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program_out.key(),
                TransferChecked {
                    from: ctx.accounts.vault_out.to_account_info(),
                    mint: ctx.accounts.mint_out.to_account_info(),
                    to: ctx.accounts.user_out.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[seeds],
            ),
            out,
            ctx.accounts.mint_out.decimals,
        )?;
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct MockPool {
    pub mint_in: Pubkey,
    pub mint_out: Pubkey,
    pub admin: Pubkey,
    pub rate_num: u64,
    pub rate_den: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct CpiTransfer<'info> {
    pub authority: Signer<'info>,
    /// CHECK: passed through to Token-2022.
    #[account(mut)]
    pub from: UncheckedAccount<'info>,
    /// CHECK: passed through to Token-2022.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: passed through to Token-2022.
    #[account(mut)]
    pub to: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct InitPool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    pub mint_in: InterfaceAccount<'info, Mint>,
    pub mint_out: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = admin,
        space = 8 + MockPool::INIT_SPACE,
        seeds = [POOL_SEED, mint_in.key().as_ref(), mint_out.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, MockPool>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetRate<'info> {
    pub admin: Signer<'info>,
    #[account(mut, has_one = admin)]
    pub pool: Account<'info, MockPool>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    pub user: Signer<'info>,
    #[account(
        seeds = [POOL_SEED, pool.mint_in.as_ref(), pool.mint_out.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, MockPool>,
    #[account(address = pool.mint_in)]
    pub mint_in: InterfaceAccount<'info, Mint>,
    #[account(address = pool.mint_out)]
    pub mint_out: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint_in)]
    pub user_in: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint_out)]
    pub user_out: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint_in, token::authority = pool)]
    pub vault_in: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint_out, token::authority = pool)]
    pub vault_out: InterfaceAccount<'info, TokenAccount>,
    pub token_program_in: Interface<'info, TokenInterface>,
    pub token_program_out: Interface<'info, TokenInterface>,
}

#[error_code]
pub enum MockError {
    #[msg("Rate denominator must be positive")]
    BadRate,
    #[msg("Output below minimum")]
    Slippage,
}
