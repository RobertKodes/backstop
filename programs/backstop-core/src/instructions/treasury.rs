//! SOL treasury floor: redemption and accounting snapshots (spec §3.6).

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Burn, Mint, TokenAccount, TokenInterface};
use backstop_common::{ids, seeds};
use backstop_hook::program::BackstopHook;
use backstop_math::fees::{floor_price, redemption};

use crate::errors::{CoreError, MathExt};
use crate::events::{Redeemed, TreasurySnapshot};
use crate::state::{Market, Treasury};

/// Treasury SOL backing the floor: lamports − rent − pending Shield fees.
pub fn treasury_free_lamports(t: &AccountInfo, m: &Market) -> Result<u64> {
    let rent = Rent::get()?.minimum_balance(t.data_len());
    Ok(t.lamports()
        .saturating_sub(rent)
        .saturating_sub(m.shield_lamports_pending))
}

/// Tokens that are claims on the treasury: supply minus the AMM reserve (D-030).
pub fn circulating(
    mint: &InterfaceAccount<Mint>,
    amm_base_vault: &InterfaceAccount<TokenAccount>,
) -> u64 {
    mint.supply.saturating_sub(amm_base_vault.amount)
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [seeds::MARKET, mint.key().as_ref()],
        bump = market.bump,
        has_one = mint,
        has_one = amm_base_vault,
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [seeds::TREASURY, mint.key().as_ref()], bump = market.treasury_bump)]
    pub treasury: Box<Account<'info, Treasury>>,
    #[account(mut, mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = user, token::token_program = token_program)]
    pub user_token: Box<InterfaceAccount<'info, TokenAccount>>,
    pub amm_base_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: hook config PDA (validated by the hook program).
    #[account(seeds = [seeds::HOOK_CONFIG, mint.key().as_ref()], bump, seeds::program = ids::HOOK)]
    pub hook_config: UncheckedAccount<'info>,
    /// CHECK: the redeemer's holder PDA (may be uninitialised).
    #[account(mut, seeds = [seeds::HOLDER, mint.key().as_ref(), user.key().as_ref()], bump, seeds::program = ids::HOOK)]
    pub holder: UncheckedAccount<'info>,
    /// CHECK: reward state PDA (validated by the hook program).
    #[account(mut, seeds = [seeds::REWARD_STATE, mint.key().as_ref()], bump, seeds::program = ids::HOOK)]
    pub reward_state: UncheckedAccount<'info>,
    pub hook_program: Program<'info, BackstopHook>,
    #[account(address = ids::TOKEN_2022)]
    pub token_program: Interface<'info, TokenInterface>,
}

/// Burn `amount` tokens for their pro-rata share of treasury SOL. Always
/// available (only a 48 h-timelocked governance action can pause it).
pub fn redeem(ctx: Context<Redeem>, amount: u64, min_lamports_out: u64) -> Result<()> {
    let a = &ctx.accounts;
    require!(!a.market.redemption_paused, CoreError::RedemptionPaused);
    require!(amount > 0, CoreError::NothingToRedeem);
    let circ = circulating(&a.mint, &a.amm_base_vault);
    require!(circ > 0, CoreError::NothingToRedeem);
    let treasury_ai = a.treasury.to_account_info();
    let free = treasury_free_lamports(&treasury_ai, &a.market)?;
    let (gross, fee, net) = redemption(
        amount,
        free,
        circ,
        a.market.params.redemption_fee_bps as u32,
    )
    .mx()?;
    require!(net >= min_lamports_out, CoreError::RedemptionSlippage);

    token_interface::burn(
        CpiContext::new(
            a.token_program.key(),
            Burn {
                mint: a.mint.to_account_info(),
                from: a.user_token.to_account_info(),
                authority: a.user.to_account_info(),
            },
        ),
        amount,
    )?;
    // Burns bypass the transfer hook: report the exit so tenure resets.
    let mseeds: [&[u8]; 3] = [
        seeds::MARKET,
        a.market.mint.as_ref(),
        core::slice::from_ref(&a.market.bump),
    ];
    backstop_hook::cpi::record_burn(
        CpiContext::new_with_signer(
            ids::HOOK,
            backstop_hook::cpi::accounts::RecordBurn {
                authority: a.market.to_account_info(),
                config: a.hook_config.to_account_info(),
                holder: a.holder.to_account_info(),
                reward_state: a.reward_state.to_account_info(),
            },
            &[&mseeds],
        ),
        a.user.key(),
        amount,
    )?;

    // Pay out; the fee stays in the treasury PDA earmarked for the Shield.
    **treasury_ai.try_borrow_mut_lamports()? -= net;
    **a.user.to_account_info().try_borrow_mut_lamports()? += net;
    let now = Clock::get()?.unix_timestamp;
    let m = &mut ctx.accounts.market;
    m.shield_lamports_pending = m.shield_lamports_pending.saturating_add(fee);
    m.redeemed_tokens = m.redeemed_tokens.saturating_add(amount);
    m.redeemed_lamports = m.redeemed_lamports.saturating_add(net);
    let after = treasury_free_lamports(&treasury_ai, m)?;
    emit!(Redeemed {
        mint: m.mint,
        wallet: ctx.accounts.user.key(),
        tokens: amount,
        gross_lamports: gross,
        fee_lamports: fee,
        net_lamports: net,
        treasury_lamports_after: after,
        circulating_before: circ,
        ts: now,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Snapshot<'info> {
    #[account(seeds = [seeds::MARKET, mint.key().as_ref()], bump = market.bump, has_one = mint, has_one = amm_base_vault)]
    pub market: Box<Account<'info, Market>>,
    #[account(seeds = [seeds::TREASURY, mint.key().as_ref()], bump = market.treasury_bump)]
    pub treasury: Box<Account<'info, Treasury>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub amm_base_vault: Box<InterfaceAccount<'info, TokenAccount>>,
}

/// Permissionless: emit the current treasury floor (keeper snapshot job).
pub fn snapshot(ctx: Context<Snapshot>) -> Result<()> {
    let a = &ctx.accounts;
    let t = treasury_free_lamports(&a.treasury.to_account_info(), &a.market)?;
    let circ = circulating(&a.mint, &a.amm_base_vault);
    emit!(TreasurySnapshot {
        mint: a.market.mint,
        treasury_lamports: t,
        circulating: circ,
        floor_price: floor_price(t, circ).mx()?,
        ts: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

/// Anyone may add SOL to the treasury (e.g. protocol-owned revenue).
#[derive(Accounts)]
pub struct DonateTreasury<'info> {
    #[account(mut)]
    pub donor: Signer<'info>,
    #[account(seeds = [seeds::MARKET, market.mint.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [seeds::TREASURY, market.mint.as_ref()], bump = market.treasury_bump)]
    pub treasury: Box<Account<'info, Treasury>>,
    pub system_program: Program<'info, System>,
}

pub fn donate_treasury(ctx: Context<DonateTreasury>, lamports: u64) -> Result<()> {
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.donor.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
        ),
        lamports,
    )?;
    let m = &mut ctx.accounts.market;
    m.treasury_sol_in = m.treasury_sol_in.saturating_add(lamports);
    Ok(())
}
