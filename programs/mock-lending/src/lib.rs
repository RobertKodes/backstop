//! # mock-lending — TEST ONLY
//!
//! A single-asset pool that accrues simple interest at `apr_bps`. Used as the
//! localnet stand-in for Kamino Lend behind the chest program's
//! `YieldAdapter` interface. Interest is paid out of tokens the admin funds
//! into the vault (`fund`).

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("CFjsjWmeiniEPZoqm7sfRZErbTdAk5sHmQ2HTdBYyCwu");

pub const INDEX_SCALE: u128 = 1_000_000_000_000;
pub const YEAR: u128 = 31_536_000;
pub const POOL_SEED: &[u8] = b"lending_pool";
pub const DEPOSIT_SEED: &[u8] = b"lending_deposit";

#[program]
pub mod mock_lending {
    use super::*;

    pub fn init_pool(ctx: Context<InitPool>, apr_bps: u32) -> Result<()> {
        let p = &mut ctx.accounts.pool;
        p.admin = ctx.accounts.admin.key();
        p.mint = ctx.accounts.mint.key();
        p.vault = ctx.accounts.vault.key();
        p.index = INDEX_SCALE;
        p.last_ts = Clock::get()?.unix_timestamp;
        p.apr_bps = apr_bps;
        p.bump = ctx.bumps.pool;
        Ok(())
    }

    pub fn set_apr(ctx: Context<SetApr>, apr_bps: u32) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let p = &mut ctx.accounts.pool;
        accrue(p, now);
        p.apr_bps = apr_bps;
        Ok(())
    }

    pub fn init_deposit(ctx: Context<InitDeposit>) -> Result<()> {
        let d = &mut ctx.accounts.deposit;
        d.pool = ctx.accounts.pool.key();
        d.owner = ctx.accounts.owner.key();
        d.shares = 0;
        d.bump = ctx.bumps.deposit;
        Ok(())
    }

    pub fn deposit(ctx: Context<Move>, amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let p = &mut ctx.accounts.pool;
        accrue(p, now);
        let shares = (amount as u128 * INDEX_SCALE / p.index) as u64;
        p.total_shares += shares;
        ctx.accounts.deposit.shares += shares;
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.owner_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )
    }

    pub fn withdraw(ctx: Context<Move>, amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let p = &mut ctx.accounts.pool;
        accrue(p, now);
        let shares = (amount as u128 * INDEX_SCALE).div_ceil(p.index) as u64;
        require!(
            shares <= ctx.accounts.deposit.shares,
            LendingError::Insufficient
        );
        p.total_shares -= shares;
        ctx.accounts.deposit.shares -= shares;
        let mint = p.mint;
        let bump = [p.bump];
        let seeds: &[&[u8]] = &[POOL_SEED, mint.as_ref(), &bump];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.owner_token.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[seeds],
            ),
            amount,
            ctx.accounts.mint.decimals,
        )
    }

    /// Anyone may add tokens to pay interest.
    pub fn fund(ctx: Context<Fund>, amount: u64) -> Result<()> {
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.funder_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.funder.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )
    }
}

fn accrue(p: &mut LendingPool, now: i64) {
    if now > p.last_ts {
        let dt = (now - p.last_ts) as u128;
        p.index += p.index * p.apr_bps as u128 * dt / (10_000 * YEAR);
        p.last_ts = now;
    }
}

/// Value of a deposit at `now` (used by the chest program's mock adapter).
pub fn deposit_value(pool: &LendingPool, deposit: &LendingDeposit, now: i64) -> u64 {
    let mut p = pool.clone();
    accrue(&mut p, now);
    (deposit.shares as u128 * p.index / INDEX_SCALE) as u64
}

#[account]
#[derive(InitSpace)]
pub struct LendingPool {
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub index: u128,
    pub last_ts: i64,
    pub apr_bps: u32,
    pub total_shares: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LendingDeposit {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub shares: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitPool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(init, payer = admin, space = 8 + LendingPool::INIT_SPACE, seeds = [POOL_SEED, mint.key().as_ref()], bump)]
    pub pool: Account<'info, LendingPool>,
    #[account(init, payer = admin, associated_token::mint = mint, associated_token::authority = pool, associated_token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetApr<'info> {
    pub admin: Signer<'info>,
    #[account(mut, has_one = admin)]
    pub pool: Account<'info, LendingPool>,
}

#[derive(Accounts)]
pub struct InitDeposit<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: depositor identity (may be a PDA).
    pub owner: UncheckedAccount<'info>,
    pub pool: Account<'info, LendingPool>,
    #[account(
        init,
        payer = payer,
        space = 8 + LendingDeposit::INIT_SPACE,
        seeds = [DEPOSIT_SEED, pool.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub deposit: Account<'info, LendingDeposit>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Move<'info> {
    pub owner: Signer<'info>,
    #[account(mut, seeds = [POOL_SEED, pool.mint.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, LendingPool>,
    #[account(mut, has_one = pool, has_one = owner)]
    pub deposit: Account<'info, LendingDeposit>,
    #[account(address = pool.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, address = pool.vault)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint)]
    pub owner_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Fund<'info> {
    pub funder: Signer<'info>,
    pub pool: Account<'info, LendingPool>,
    #[account(address = pool.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, address = pool.vault)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = funder)]
    pub funder_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[error_code]
pub enum LendingError {
    #[msg("Insufficient deposit")]
    Insufficient,
}
