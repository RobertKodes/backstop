//! Fee distribution and keeper fee conversions.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::associated_token::{self, AssociatedToken, Create};
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, SyncNative, TokenAccount, TokenInterface, TransferChecked,
};
use backstop_common::{ids, seeds};
use backstop_hook::program::BackstopHook;
use backstop_math::fees::split;

use crate::errors::{CoreError, MathExt};
use crate::events::{ExternalRewardsDeposited, FeeSwap, FeesDistributed};
use crate::oracle::{min_lamports_out, min_quote_out, quote_per_sol};
use crate::state::{Market, Treasury};

// ------------------------------------------------------------------ helpers

fn market_seeds(m: &Market) -> [&[u8]; 3] {
    [
        seeds::MARKET,
        m.mint.as_ref(),
        core::slice::from_ref(&m.bump),
    ]
}

#[allow(clippy::too_many_arguments)]
fn transfer_quote<'info>(
    program: &Interface<'info, TokenInterface>,
    from: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    amount: u64,
    decimals: u8,
    signer: &[&[&[u8]]],
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            program.key(),
            TransferChecked {
                from: from.clone(),
                mint: mint.clone(),
                to: to.clone(),
                authority: authority.clone(),
            },
            signer,
        ),
        amount,
        decimals,
    )
}

/// CPI into the configured swap program (Jupiter v6 on mainnet, mock on
/// localnet) with keeper-supplied route accounts and data. `signer_key` is
/// the PDA that owns the input tokens and must sign.
fn invoke_swap<'info>(
    swap_program: &AccountInfo<'info>,
    route: &[AccountInfo<'info>],
    data: Vec<u8>,
    signer_key: &Pubkey,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    let metas: Vec<AccountMeta> = route
        .iter()
        .map(|a| AccountMeta {
            pubkey: a.key(),
            is_signer: a.is_signer || a.key() == *signer_key,
            is_writable: a.is_writable,
        })
        .collect();
    let mut infos = route.to_vec();
    infos.push(swap_program.clone());
    invoke_signed(
        &Instruction {
            program_id: swap_program.key(),
            accounts: metas,
            data,
        },
        &infos,
        &[signer_seeds],
    )?;
    Ok(())
}

/// After a swap the input vault must still be owned by `owner` with no
/// delegate and no close authority (no approval may be planted by a route).
fn assert_vault_clean(vault: &InterfaceAccount<TokenAccount>, owner: &Pubkey) -> Result<()> {
    require_keys_eq!(vault.owner, *owner, CoreError::AccountMismatch);
    require!(vault.delegate.is_none(), CoreError::AccountMismatch);
    require!(vault.close_authority.is_none(), CoreError::AccountMismatch);
    Ok(())
}

// ---------------------------------------------------------- distribution ---

#[derive(Accounts)]
pub struct DistributeFees<'info> {
    #[account(mut, seeds = [seeds::MARKET, market.mint.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(address = market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = market.fee_vault)]
    pub fee_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, address = market.holder_rewards_vault)]
    pub holder_rewards_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, address = market.shield_rewards_vault)]
    pub shield_rewards_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, address = market.treasury_quote_vault)]
    pub treasury_quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, address = market.parent_vault)]
    pub parent_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: verified by the hook program (seeds).
    pub hook_config: UncheckedAccount<'info>,
    /// CHECK: verified by the hook program (seeds).
    #[account(mut)]
    pub reward_state: UncheckedAccount<'info>,
    pub hook_program: Program<'info, BackstopHook>,
    #[account(address = market.quote_token_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
}

/// Permissionless: split everything in the fee vault 70/10/20 (children:
/// parent share first) and record holder rewards in the hook accumulator.
pub fn distribute_fees(ctx: Context<DistributeFees>) -> Result<()> {
    let amount = ctx.accounts.fee_vault.amount;
    if amount == 0 {
        return Ok(());
    }
    let m = &ctx.accounts.market;
    let s = split(amount, &m.params.fee_split()).mx()?;
    let seeds = market_seeds(m);
    let signer: &[&[&[u8]]] = &[&seeds];
    let a = &ctx.accounts;
    let (mint, auth, dec) = (
        a.quote_mint.to_account_info(),
        a.market.to_account_info(),
        a.quote_mint.decimals,
    );
    let from = a.fee_vault.to_account_info();
    transfer_quote(
        &a.quote_token_program,
        &from,
        &mint,
        &a.holder_rewards_vault.to_account_info(),
        &auth,
        s.chest,
        dec,
        signer,
    )?;
    transfer_quote(
        &a.quote_token_program,
        &from,
        &mint,
        &a.shield_rewards_vault.to_account_info(),
        &auth,
        s.shield,
        dec,
        signer,
    )?;
    transfer_quote(
        &a.quote_token_program,
        &from,
        &mint,
        &a.treasury_quote_vault.to_account_info(),
        &auth,
        s.treasury,
        dec,
        signer,
    )?;
    transfer_quote(
        &a.quote_token_program,
        &from,
        &mint,
        &a.parent_vault.to_account_info(),
        &auth,
        s.parent,
        dec,
        signer,
    )?;
    if s.chest > 0 {
        backstop_hook::cpi::deposit_rewards(
            CpiContext::new_with_signer(
                ids::HOOK,
                backstop_hook::cpi::accounts::DepositRewards {
                    authority: auth.clone(),
                    config: a.hook_config.to_account_info(),
                    reward_state: a.reward_state.to_account_info(),
                },
                signer,
            ),
            s.chest,
        )?;
    }
    let now = Clock::get()?.unix_timestamp;
    let m = &mut ctx.accounts.market;
    m.fees.distributed = m.fees.distributed.saturating_add(amount);
    m.fees.to_chests = m.fees.to_chests.saturating_add(s.chest);
    m.fees.to_shield = m.fees.to_shield.saturating_add(s.shield);
    m.fees.to_treasury = m.fees.to_treasury.saturating_add(s.treasury);
    m.fees.to_parent = m.fees.to_parent.saturating_add(s.parent);
    emit!(FeesDistributed {
        mint: m.mint,
        amount,
        to_chests: s.chest,
        to_shield: s.shield,
        to_treasury: s.treasury,
        to_parent: s.parent,
        ts: now,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct DepositExternalRewards<'info> {
    pub depositor: Signer<'info>,
    #[account(seeds = [seeds::MARKET, market.mint.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(address = market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = quote_mint, token::authority = depositor)]
    pub depositor_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, address = market.holder_rewards_vault)]
    pub holder_rewards_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: verified by the hook program.
    pub hook_config: UncheckedAccount<'info>,
    /// CHECK: verified by the hook program.
    #[account(mut)]
    pub reward_state: UncheckedAccount<'info>,
    pub hook_program: Program<'info, BackstopHook>,
    #[account(address = market.quote_token_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
}

/// Permissionless top-up of holder rewards (e.g. partnerships, manual
/// parent-share routing).
pub fn deposit_external_rewards(ctx: Context<DepositExternalRewards>, amount: u64) -> Result<()> {
    require!(amount > 0, CoreError::InvalidParameter);
    let a = &ctx.accounts;
    transfer_quote(
        &a.quote_token_program,
        &a.depositor_token.to_account_info(),
        &a.quote_mint.to_account_info(),
        &a.holder_rewards_vault.to_account_info(),
        &a.depositor.to_account_info(),
        amount,
        a.quote_mint.decimals,
        &[],
    )?;
    let seeds = market_seeds(&a.market);
    backstop_hook::cpi::deposit_rewards(
        CpiContext::new_with_signer(
            ids::HOOK,
            backstop_hook::cpi::accounts::DepositRewards {
                authority: a.market.to_account_info(),
                config: a.hook_config.to_account_info(),
                reward_state: a.reward_state.to_account_info(),
            },
            &[&seeds],
        ),
        amount,
    )?;
    emit!(ExternalRewardsDeposited {
        mint: a.market.mint,
        from: a.depositor.key(),
        amount
    });
    Ok(())
}

// ----------------------------------------------- treasury → SOL conversion

#[derive(Accounts)]
pub struct ConvertTreasury<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,
    #[account(mut, seeds = [seeds::MARKET, market.mint.as_ref()], bump = market.bump, has_one = keeper @ CoreError::Unauthorized)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [seeds::TREASURY, market.mint.as_ref()], bump = market.treasury_bump)]
    pub treasury: Box<Account<'info, Treasury>>,
    #[account(address = market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = market.treasury_quote_vault)]
    pub treasury_quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = ids::WSOL)]
    pub wsol_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: ATA(treasury, wSOL), created and closed by this instruction.
    #[account(
        mut,
        address = anchor_spl::associated_token::get_associated_token_address_with_program_id(&treasury.key(), &ids::WSOL, &ids::TOKEN)
    )]
    pub temp_wsol: UncheckedAccount<'info>,
    /// CHECK: Pyth feed when `market.oracle.kind == 1` (checked by the oracle module).
    pub oracle_feed: Option<UncheckedAccount<'info>>,
    /// CHECK: must be the configured swap program.
    #[account(address = market.swap_program @ CoreError::BadSwapProgram)]
    pub swap_program: UncheckedAccount<'info>,
    #[account(address = market.quote_token_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
    #[account(address = ids::TOKEN)]
    pub wsol_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Keeper: convert treasury-share quote tokens to SOL held by the treasury
/// PDA. Route accounts are passed as remaining accounts (ignored when the
/// quote is wSOL, which only needs unwrapping).
pub fn convert_treasury<'info>(
    mut ctx: Context<'info, ConvertTreasury<'info>>,
    amount_in: u64,
    swap_data: Vec<u8>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    require!(
        amount_in > 0 && amount_in <= a.treasury_quote_vault.amount,
        CoreError::InvalidParameter
    );
    require!(
        amount_in <= a.market.params.max_swap_chunk,
        CoreError::SwapTooLarge
    );
    let mint_key = a.market.mint;
    let tbump = [a.market.treasury_bump];
    let t_seeds: [&[u8]; 3] = [seeds::TREASURY, mint_key.as_ref(), &tbump];
    let treasury_ai = a.treasury.to_account_info();

    associated_token::create_idempotent(CpiContext::new(
        a.associated_token_program.key(),
        Create {
            payer: a.keeper.to_account_info(),
            associated_token: a.temp_wsol.to_account_info(),
            authority: treasury_ai.clone(),
            mint: a.wsol_mint.to_account_info(),
            system_program: a.system_program.to_account_info(),
            token_program: a.wsol_token_program.to_account_info(),
        },
    ))?;
    let temp_rent = a.temp_wsol.lamports();
    let before_in = a.treasury_quote_vault.amount;
    let wsol_balance = |ai: &AccountInfo| -> Result<u64> {
        let d = ai.try_borrow_data()?;
        Ok(u64::from_le_bytes(d[64..72].try_into().unwrap()))
    };
    let before_out = wsol_balance(&a.temp_wsol.to_account_info())?;

    let (spent, received, min_out) = if a.market.quote_mint == ids::WSOL {
        transfer_quote(
            &a.quote_token_program,
            &a.treasury_quote_vault.to_account_info(),
            &a.quote_mint.to_account_info(),
            &a.temp_wsol.to_account_info(),
            &treasury_ai,
            amount_in,
            9,
            &[&t_seeds],
        )?;
        (amount_in, amount_in, amount_in)
    } else {
        invoke_swap(
            &a.swap_program.to_account_info(),
            ctx.remaining_accounts,
            swap_data,
            &treasury_ai.key(),
            &t_seeds,
        )?;
        let a = &mut ctx.accounts;
        a.treasury_quote_vault.reload()?;
        assert_vault_clean(&a.treasury_quote_vault, &a.treasury.key())?;
        let spent = before_in
            .checked_sub(a.treasury_quote_vault.amount)
            .ok_or(CoreError::MathOverflow)?;
        require!(spent <= amount_in, CoreError::InvalidParameter);
        let received = wsol_balance(&a.temp_wsol.to_account_info())?
            .checked_sub(before_out)
            .ok_or(CoreError::MathOverflow)?;
        let price = quote_per_sol(
            &a.market.oracle,
            a.oracle_feed.as_ref().map(|f| f.as_ref()),
            now,
        )?;
        let min_out = min_lamports_out(spent, price, a.market.params.max_swap_slippage_bps)?;
        require!(received >= min_out, CoreError::SwapSlippage);
        (spent, received, min_out)
    };

    // Unwrap into the treasury PDA, then refund the temp account rent.
    let a = &ctx.accounts;
    token_interface::close_account(CpiContext::new_with_signer(
        a.wsol_token_program.key(),
        CloseAccount {
            account: a.temp_wsol.to_account_info(),
            destination: treasury_ai.clone(),
            authority: treasury_ai.clone(),
        },
        &[&t_seeds],
    ))?;
    **treasury_ai.try_borrow_mut_lamports()? -= temp_rent;
    **a.keeper.to_account_info().try_borrow_mut_lamports()? += temp_rent;

    let m = &mut ctx.accounts.market;
    m.treasury_sol_in = m.treasury_sol_in.saturating_add(received);
    emit!(FeeSwap {
        mint: m.mint,
        kind: 0,
        amount_in: spent,
        amount_out: received,
        oracle_min_out: min_out,
        ts: now
    });
    Ok(())
}

// ------------------------------------- child parent share → parent rewards

#[derive(Accounts)]
pub struct ConvertParentShare<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,
    #[account(seeds = [seeds::MARKET, market.mint.as_ref()], bump = market.bump, has_one = keeper @ CoreError::Unauthorized)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        seeds = [seeds::MARKET, market.parent.as_ref()],
        bump = parent_market.bump,
        constraint = market.parent != Pubkey::default() @ CoreError::InvalidParameter
    )]
    pub parent_market: Box<Account<'info, Market>>,
    #[account(mut, address = market.parent_vault)]
    pub parent_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, address = parent_market.holder_rewards_vault)]
    pub parent_rewards_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: verified by the hook program (parent mint seeds).
    pub parent_hook_config: UncheckedAccount<'info>,
    /// CHECK: verified by the hook program.
    #[account(mut)]
    pub parent_reward_state: UncheckedAccount<'info>,
    pub hook_program: Program<'info, BackstopHook>,
    /// CHECK: Pyth feed when configured.
    pub oracle_feed: Option<UncheckedAccount<'info>>,
    /// CHECK: must be the configured swap program.
    #[account(address = market.swap_program @ CoreError::BadSwapProgram)]
    pub swap_program: UncheckedAccount<'info>,
}

/// Keeper: swap the child's accumulated parent share (SOL) into the parent's
/// quote (USDC), deliver it to the parent's holder-rewards vault and record it
/// in the parent's tenure-weighted accumulator ("30 % of child fees to
/// BACKSTOP chests").
pub fn convert_parent_share<'info>(
    mut ctx: Context<'info, ConvertParentShare<'info>>,
    amount_in: u64,
    swap_data: Vec<u8>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    require!(
        amount_in > 0 && amount_in <= a.parent_vault.amount,
        CoreError::InvalidParameter
    );
    let before_in = a.parent_vault.amount;
    let before_out = a.parent_rewards_vault.amount;
    let seeds = market_seeds(&a.market);
    invoke_swap(
        &a.swap_program.to_account_info(),
        ctx.remaining_accounts,
        swap_data,
        &a.market.key(),
        &seeds,
    )?;
    let a = &mut ctx.accounts;
    a.parent_vault.reload()?;
    a.parent_rewards_vault.reload()?;
    assert_vault_clean(&a.parent_vault, &a.market.key())?;
    let spent = before_in
        .checked_sub(a.parent_vault.amount)
        .ok_or(CoreError::MathOverflow)?;
    require!(spent <= amount_in, CoreError::InvalidParameter);
    let received = a
        .parent_rewards_vault
        .amount
        .checked_sub(before_out)
        .ok_or(CoreError::MathOverflow)?;
    // Child quote is SOL; parent quote is USDC → price in USDC per SOL.
    let price = quote_per_sol(
        &a.parent_market.oracle,
        a.oracle_feed.as_ref().map(|f| f.as_ref()),
        now,
    )?;
    let min_out = min_quote_out(spent, price, a.market.params.max_swap_slippage_bps)?;
    require!(received >= min_out, CoreError::SwapSlippage);
    let pseeds = market_seeds(&a.parent_market);
    backstop_hook::cpi::deposit_rewards(
        CpiContext::new_with_signer(
            ids::HOOK,
            backstop_hook::cpi::accounts::DepositRewards {
                authority: a.parent_market.to_account_info(),
                config: a.parent_hook_config.to_account_info(),
                reward_state: a.parent_reward_state.to_account_info(),
            },
            &[&pseeds],
        ),
        received,
    )?;
    emit!(FeeSwap {
        mint: a.market.mint,
        kind: 1,
        amount_in: spent,
        amount_out: received,
        oracle_min_out: min_out,
        ts: now
    });
    Ok(())
}

// ------------------------------------ redemption fees (SOL) → Shield rewards

#[derive(Accounts)]
pub struct ConvertShieldLamports<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,
    #[account(mut, seeds = [seeds::MARKET, market.mint.as_ref()], bump = market.bump, has_one = keeper @ CoreError::Unauthorized)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [seeds::TREASURY, market.mint.as_ref()], bump = market.treasury_bump)]
    pub treasury: Box<Account<'info, Treasury>>,
    #[account(address = ids::WSOL)]
    pub wsol_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: ATA(treasury, wSOL), created and closed here.
    #[account(
        mut,
        address = anchor_spl::associated_token::get_associated_token_address_with_program_id(&treasury.key(), &ids::WSOL, &ids::TOKEN)
    )]
    pub temp_wsol: UncheckedAccount<'info>,
    #[account(mut, address = market.shield_rewards_vault)]
    pub shield_rewards_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: Pyth feed when configured.
    pub oracle_feed: Option<UncheckedAccount<'info>>,
    /// CHECK: must be the configured swap program.
    #[account(address = market.swap_program @ CoreError::BadSwapProgram)]
    pub swap_program: UncheckedAccount<'info>,
    #[account(address = ids::TOKEN)]
    pub wsol_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Keeper: convert pending redemption-fee lamports into Shield rewards.
pub fn convert_shield_lamports<'info>(
    mut ctx: Context<'info, ConvertShieldLamports<'info>>,
    lamports: u64,
    swap_data: Vec<u8>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    require!(
        lamports > 0 && lamports <= a.market.shield_lamports_pending,
        CoreError::InvalidParameter
    );
    let mint_key = a.market.mint;
    let tbump = [a.market.treasury_bump];
    let t_seeds: [&[u8]; 3] = [seeds::TREASURY, mint_key.as_ref(), &tbump];
    let treasury_ai = a.treasury.to_account_info();
    associated_token::create_idempotent(CpiContext::new(
        a.associated_token_program.key(),
        Create {
            payer: a.keeper.to_account_info(),
            associated_token: a.temp_wsol.to_account_info(),
            authority: treasury_ai.clone(),
            mint: a.wsol_mint.to_account_info(),
            system_program: a.system_program.to_account_info(),
            token_program: a.wsol_token_program.to_account_info(),
        },
    ))?;
    let temp_rent = a.temp_wsol.lamports();
    // wrap: move lamports from the treasury PDA into the wSOL account
    **treasury_ai.try_borrow_mut_lamports()? -= lamports;
    **a.temp_wsol.to_account_info().try_borrow_mut_lamports()? += lamports;
    token_interface::sync_native(CpiContext::new(
        a.wsol_token_program.key(),
        SyncNative {
            account: a.temp_wsol.to_account_info(),
        },
    ))?;
    let before_out = a.shield_rewards_vault.amount;
    let (received, min_out) = if a.market.quote_mint == ids::WSOL {
        transfer_quote(
            &a.wsol_token_program,
            &a.temp_wsol.to_account_info(),
            &a.wsol_mint.to_account_info(),
            &a.shield_rewards_vault.to_account_info(),
            &treasury_ai,
            lamports,
            9,
            &[&t_seeds],
        )?;
        (lamports, lamports)
    } else {
        invoke_swap(
            &a.swap_program.to_account_info(),
            ctx.remaining_accounts,
            swap_data,
            &treasury_ai.key(),
            &t_seeds,
        )?;
        let a = &mut ctx.accounts;
        a.shield_rewards_vault.reload()?;
        let received = a
            .shield_rewards_vault
            .amount
            .checked_sub(before_out)
            .ok_or(CoreError::MathOverflow)?;
        let price = quote_per_sol(
            &a.market.oracle,
            a.oracle_feed.as_ref().map(|f| f.as_ref()),
            now,
        )?;
        let min_out = min_quote_out(lamports, price, a.market.params.max_swap_slippage_bps)?;
        require!(received >= min_out, CoreError::SwapSlippage);
        (received, min_out)
    };
    let a = &ctx.accounts;
    token_interface::close_account(CpiContext::new_with_signer(
        a.wsol_token_program.key(),
        CloseAccount {
            account: a.temp_wsol.to_account_info(),
            destination: a.keeper.to_account_info(),
            authority: treasury_ai.clone(),
        },
        &[&t_seeds],
    ))?;
    // `close_account` returned the rent (and any dust) to the keeper who paid it.
    let _ = temp_rent;
    let m = &mut ctx.accounts.market;
    m.shield_lamports_pending -= lamports;
    emit!(FeeSwap {
        mint: m.mint,
        kind: 2,
        amount_in: lamports,
        amount_out: received,
        oracle_min_out: min_out,
        ts: now
    });
    Ok(())
}
