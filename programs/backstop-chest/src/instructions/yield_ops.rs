//! Idle-yield rebalancing (spec §3.4 / Phase 6).

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use backstop_common::{ids, seeds};
use backstop_core::state::Market;
use backstop_math::u256::mul_div_floor;
use backstop_math::BPS;

use crate::errors::{ChestError, MathExt};
use crate::events::YieldEvent;
use crate::instructions::chest::chest_market_seeds;
use crate::state::{adapter_kind, ChestMarket};
use crate::yield_adapter::{adapter_for, AdapterCtx};

/// Hysteresis around the buffer target (10 % of the target).
const HYSTERESIS_BPS: u128 = 1_000;

#[derive(Accounts)]
pub struct SetAdapter<'info> {
    pub governance: Signer<'info>,
    #[account(seeds = [seeds::MARKET, chest_market.mint.as_ref()], bump = market.bump, seeds::program = ids::CORE, has_one = governance @ ChestError::Unauthorized)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [seeds::CHEST_MARKET, chest_market.mint.as_ref()], bump = chest_market.bump)]
    pub chest_market: Box<Account<'info, ChestMarket>>,
}

/// Governance selects the adapter. Switching requires the old position to
/// be fully withdrawn (`deployed_principal == 0`).
pub fn set_adapter(
    ctx: Context<SetAdapter>,
    kind: u8,
    program: Pubkey,
    pool: Pubkey,
    position: Pubkey,
) -> Result<()> {
    let cm = &mut ctx.accounts.chest_market;
    require!(
        cm.adapter_value == 0 && cm.deployed_principal == 0,
        ChestError::InvalidAmount
    );
    require!(kind <= adapter_kind::KAMINO, ChestError::AdapterUnsupported);
    cm.adapter_kind = kind;
    cm.adapter_program = program;
    cm.adapter_pool = pool;
    cm.adapter_position = position;
    Ok(())
}

#[derive(Accounts)]
pub struct Rebalance<'info> {
    pub cranker: Signer<'info>,
    #[account(seeds = [seeds::MARKET, chest_market.mint.as_ref()], bump = market.bump, seeds::program = ids::CORE)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [seeds::CHEST_MARKET, chest_market.mint.as_ref()], bump = chest_market.bump, has_one = vault)]
    pub chest_market: Box<Account<'info, ChestMarket>>,
    #[account(address = chest_market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = chest_market.quote_token_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
    // remaining accounts: adapter-specific (see yield_adapter.rs)
}

fn adapter_ctx<'a, 'info>(
    a: &'a Rebalance<'info>,
    rem: &'a [AccountInfo<'info>],
    seeds: &'a [&'a [&'a [u8]]],
) -> AdapterCtx<'a, 'info> {
    AdapterCtx {
        market: &a.chest_market,
        authority: a.chest_market.to_account_info(),
        vault: a.vault.to_account_info(),
        quote_mint: a.quote_mint.to_account_info(),
        token_program: a.quote_token_program.to_account_info(),
        accounts: rem,
        signer_seeds: seeds,
    }
}

/// Permissionless: refresh the position value and move idle USDC toward the
/// buffer target (default 20 % of chest assets kept liquid).
pub fn rebalance<'info>(ctx: Context<'info, Rebalance<'info>>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    let adapter = adapter_for(a.chest_market.adapter_kind)?;
    let s = chest_market_seeds(&a.chest_market);
    let signer: &[&[&[u8]]] = &[&s];
    let cx = adapter_ctx(a, ctx.remaining_accounts, signer);
    let value = adapter.value(&cx, now)?;
    let idle = a.chest_market.idle_assets;
    let total = idle as u128 + value as u128;
    let target =
        mul_div_floor(total, a.market.params.yield_buffer_bps as u128, BPS as u128).mx()?;
    let band = target * HYSTERESIS_BPS / BPS as u128;
    let (kind, moved) = if (idle as u128) > target + band {
        let amt = (idle as u128 - target) as u64;
        adapter.deposit(&cx, amt)?;
        (0u8, amt)
    } else if (idle as u128) + band < target && value > 0 {
        let amt = ((target - idle as u128) as u64).min(value);
        adapter.withdraw(&cx, amt)?;
        (1u8, amt)
    } else {
        (2u8, 0)
    };
    let cm = &mut ctx.accounts.chest_market;
    // Realise yield accrued since the last sync before moving funds.
    if value > cm.adapter_value {
        cm.total_yield_realised = cm
            .total_yield_realised
            .saturating_add(value - cm.adapter_value);
    }
    match kind {
        0 => {
            cm.idle_assets -= moved;
            cm.deployed_principal = cm.deployed_principal.saturating_add(moved);
            cm.adapter_value = value + moved;
        }
        1 => {
            cm.idle_assets += moved;
            cm.deployed_principal = cm.deployed_principal.saturating_sub(moved);
            cm.adapter_value = value - moved;
        }
        _ => cm.adapter_value = value,
    }
    cm.adapter_synced_at = now;
    emit!(YieldEvent {
        mint: cm.mint,
        kind,
        amount: moved,
        adapter_value: cm.adapter_value,
        idle_assets: cm.idle_assets,
        ts: now
    });
    Ok(())
}

/// Permissionless: withdraw `amount` from the adapter (e.g. so a large
/// withdrawal or bid can proceed) regardless of the buffer target.
pub fn unwind<'info>(ctx: Context<'info, Rebalance<'info>>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    let adapter = adapter_for(a.chest_market.adapter_kind)?;
    let s = chest_market_seeds(&a.chest_market);
    let signer: &[&[&[u8]]] = &[&s];
    let cx = adapter_ctx(a, ctx.remaining_accounts, signer);
    let value = adapter.value(&cx, now)?;
    let amt = amount.min(value);
    adapter.withdraw(&cx, amt)?;
    let cm = &mut ctx.accounts.chest_market;
    if value > cm.adapter_value {
        cm.total_yield_realised = cm
            .total_yield_realised
            .saturating_add(value - cm.adapter_value);
    }
    cm.idle_assets += amt;
    cm.deployed_principal = cm.deployed_principal.saturating_sub(amt);
    cm.adapter_value = value - amt;
    cm.adapter_synced_at = now;
    emit!(YieldEvent {
        mint: cm.mint,
        kind: 1,
        amount: amt,
        adapter_value: cm.adapter_value,
        idle_assets: cm.idle_assets,
        ts: now
    });
    Ok(())
}
