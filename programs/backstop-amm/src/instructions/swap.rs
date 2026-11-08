use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use backstop_common::cpi::transfer_checked_with_hook;
use backstop_common::{defaults, ids, pda, seeds};
use backstop_core::state::Market;
use backstop_math::amm::{self, SwapResult};
use backstop_math::twap::spot_price;

use crate::errors::{AmmError, MathExt};
use crate::events::{side, Swapped};
use crate::state::Pool;

const HOUR: i64 = 3_600;

// ------------------------------------------------------------- accounts ---

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        seeds = [seeds::MARKET, mint.key().as_ref()],
        bump = market.bump,
        seeds::program = ids::CORE,
        has_one = mint,
        has_one = fee_vault,
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        seeds = [seeds::POOL, mint.key().as_ref()],
        bump = pool.load()?.bump,
        has_one = mint,
        has_one = base_vault,
        has_one = quote_vault,
    )]
    pub pool: AccountLoader<'info, Pool>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub base_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub fee_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::token_program = base_token_program)]
    pub user_base: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = quote_mint, token::token_program = quote_token_program)]
    pub user_quote: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = ids::TOKEN_2022)]
    pub base_token_program: Interface<'info, TokenInterface>,
    #[account(address = market.quote_token_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
    // remaining accounts: transfer-hook extra accounts
}

/// Offer remainder sale, signed by the offers escrow authority.
#[derive(Accounts)]
pub struct ProtocolSwap<'info> {
    /// `backstop-offers` book PDA (escrow authority) — only reachable via CPI.
    #[account(address = pda::book(&mint.key()).0 @ AmmError::Unauthorized)]
    pub escrow_authority: Signer<'info>,
    /// CHECK: seller / buyer identity, used for events only.
    pub trader: UncheckedAccount<'info>,
    #[account(
        seeds = [seeds::MARKET, mint.key().as_ref()],
        bump = market.bump,
        seeds::program = ids::CORE,
        has_one = mint,
        has_one = fee_vault,
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        seeds = [seeds::POOL, mint.key().as_ref()],
        bump = pool.load()?.bump,
        has_one = mint,
        has_one = base_vault,
        has_one = quote_vault,
    )]
    pub pool: AccountLoader<'info, Pool>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub base_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub fee_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Sell: escrow vault (base). Ticket buy: buyer's quote account.
    #[account(mut)]
    pub source: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Sell: seller's quote account. Ticket buy: buyer's base account.
    #[account(mut)]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Ticket buy: the buyer (signer, owner of `source`). Sell: unused (= escrow authority).
    pub source_authority: Signer<'info>,
    #[account(address = ids::TOKEN_2022)]
    pub base_token_program: Interface<'info, TokenInterface>,
    #[account(address = market.quote_token_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ReadPool<'info> {
    pub pool: AccountLoader<'info, Pool>,
}

// --------------------------------------------------------------- helpers ---

struct Ctx<'a, 'info> {
    pool: &'a AccountLoader<'info, Pool>,
    mint: &'a InterfaceAccount<'info, Mint>,
    quote_mint: &'a InterfaceAccount<'info, Mint>,
    base_vault: &'a InterfaceAccount<'info, TokenAccount>,
    quote_vault: &'a InterfaceAccount<'info, TokenAccount>,
    fee_vault: &'a InterfaceAccount<'info, TokenAccount>,
    base_program: &'a Interface<'info, TokenInterface>,
    quote_program: &'a Interface<'info, TokenInterface>,
}

impl<'a, 'info> Ctx<'a, 'info> {
    fn pool_seeds(&self, bump: &'a [u8; 1], mint: &'a Pubkey) -> [&'a [u8]; 3] {
        [seeds::POOL, mint.as_ref(), bump]
    }

    fn quote_xfer(&self, from: &AccountInfo<'info>, to: &AccountInfo<'info>, auth: &AccountInfo<'info>, amt: u64, signer: &[&[&[u8]]]) -> Result<()> {
        if amt == 0 {
            return Ok(());
        }
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                self.quote_program.key(),
                TransferChecked { from: from.clone(), mint: self.quote_mint.to_account_info(), to: to.clone(), authority: auth.clone() },
                signer,
            ),
            amt,
            self.quote_mint.decimals,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn base_xfer(
        &self,
        from: &AccountInfo<'info>,
        to: &AccountInfo<'info>,
        auth: &AccountInfo<'info>,
        hook: &[AccountInfo<'info>],
        amt: u64,
        signer: &[&[&[u8]]],
    ) -> Result<()> {
        transfer_checked_with_hook(
            &self.base_program.to_account_info(),
            from,
            &self.mint.to_account_info(),
            to,
            auth,
            hook,
            amt,
            defaults::DECIMALS,
            signer,
        )
    }
}

/// Apply a swap to the pool's reserves, stats and oracle. `buy` = quote in.
fn apply(pool: &AccountLoader<Pool>, r: &SwapResult, buy: bool, now: i64) -> Result<(u64, u64, u128, u8)> {
    let mut p = pool.load_mut()?;
    if buy {
        p.quote_reserve = p.quote_reserve.checked_add(r.reserve_in).ok_or(AmmError::MathOverflow)?;
        p.base_reserve = p.base_reserve.checked_sub(r.reserve_out).ok_or(AmmError::InsufficientLiquidity)?;
        p.volume_base = p.volume_base.saturating_add(r.reserve_out);
        p.volume_quote = p.volume_quote.saturating_add(r.reserve_in);
    } else {
        p.base_reserve = p.base_reserve.checked_add(r.reserve_in).ok_or(AmmError::MathOverflow)?;
        p.quote_reserve = p.quote_reserve.checked_sub(r.reserve_out).ok_or(AmmError::InsufficientLiquidity)?;
        p.volume_base = p.volume_base.saturating_add(r.reserve_in);
        p.volume_quote = p.volume_quote.saturating_add(r.reserve_out);
    }
    p.fees_collected = p.fees_collected.saturating_add(r.fee);
    p.swaps = p.swaps.saturating_add(1);
    let price = spot_price(p.quote_reserve, p.base_reserve).mx()?;
    let mut o = p.oracle();
    o.set_price(price);
    p.set_oracle(&o);
    let _ = now;
    Ok((p.base_reserve, p.quote_reserve, price, p.bump))
}

/// Advance the oracle with the pre-trade price and return the reserves.
fn pre_trade(pool: &AccountLoader<Pool>, now: i64) -> Result<(u64, u64)> {
    let mut p = pool.load_mut()?;
    let mut o = p.oracle();
    o.update(now);
    p.set_oracle(&o);
    Ok((p.base_reserve, p.quote_reserve))
}

// ---------------------------------------------------------- user swaps ---

pub fn buy<'info>(ctx: Context<'info, Swap<'info>>, quote_in: u64, min_base_out: u64) -> Result<u64> {
    require!(quote_in > 0, AmmError::InvalidAmount);
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    let (base_r, quote_r) = pre_trade(&a.pool, now)?;
    let r = amm::buy(quote_in, base_r, quote_r, a.market.params.trade_fee_bps as u32).mx()?;
    require!(r.user_out >= min_base_out, AmmError::Slippage);
    let (br, qr, price, bump) = apply(&a.pool, &r, true, now)?;

    let c = Ctx {
        pool: &a.pool,
        mint: &a.mint,
        quote_mint: &a.quote_mint,
        base_vault: &a.base_vault,
        quote_vault: &a.quote_vault,
        fee_vault: &a.fee_vault,
        base_program: &a.base_token_program,
        quote_program: &a.quote_token_program,
    };
    let user = a.user.to_account_info();
    c.quote_xfer(&a.user_quote.to_account_info(), &c.quote_vault.to_account_info(), &user, r.reserve_in, &[])?;
    c.quote_xfer(&a.user_quote.to_account_info(), &c.fee_vault.to_account_info(), &user, r.fee, &[])?;
    let (b, m) = ([bump], a.mint.key());
    let ps = c.pool_seeds(&b, &m);
    c.base_xfer(&c.base_vault.to_account_info(), &a.user_base.to_account_info(), &c.pool.to_account_info(), ctx.remaining_accounts, r.user_out, &[&ps])?;

    emit!(Swapped {
        mint: m,
        trader: a.user.key(),
        side: side::BUY,
        base_amount: r.user_out,
        quote_amount: quote_in,
        fee: r.fee,
        base_reserve: br,
        quote_reserve: qr,
        price,
        ts: now,
    });
    Ok(r.user_out)
}

/// Direct sell — only for amounts below the minimum offer size. Larger sells
/// must go through the offer book. Per-wallet rolling cap: transfer hook.
/// Global hourly cap: here.
pub fn sell<'info>(ctx: Context<'info, Swap<'info>>, base_in: u64, min_quote_out: u64) -> Result<u64> {
    require!(base_in > 0, AmmError::InvalidAmount);
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    require!(base_in < a.market.params.min_offer_size, AmmError::UseOfferBook);
    {
        let mut p = a.pool.load_mut()?;
        if now.saturating_sub(p.direct_hour_start) >= HOUR {
            p.direct_hour_start = now;
            p.direct_hour_sold = 0;
        }
        let next = p.direct_hour_sold.checked_add(base_in).ok_or(AmmError::MathOverflow)?;
        require!(next <= a.market.params.direct_sell_hourly_cap, AmmError::DirectSellHourlyCap);
        p.direct_hour_sold = next;
    }
    let (base_r, quote_r) = pre_trade(&a.pool, now)?;
    let r = amm::sell(base_in, base_r, quote_r, a.market.params.trade_fee_bps as u32).mx()?;
    require!(r.user_out >= min_quote_out, AmmError::Slippage);
    let (br, qr, price, bump) = apply(&a.pool, &r, false, now)?;

    let c = Ctx {
        pool: &a.pool,
        mint: &a.mint,
        quote_mint: &a.quote_mint,
        base_vault: &a.base_vault,
        quote_vault: &a.quote_vault,
        fee_vault: &a.fee_vault,
        base_program: &a.base_token_program,
        quote_program: &a.quote_token_program,
    };
    c.base_xfer(&a.user_base.to_account_info(), &c.base_vault.to_account_info(), &a.user.to_account_info(), ctx.remaining_accounts, base_in, &[])?;
    let (b, m) = ([bump], a.mint.key());
    let ps = c.pool_seeds(&b, &m);
    let pool_ai = c.pool.to_account_info();
    c.quote_xfer(&c.quote_vault.to_account_info(), &a.user_quote.to_account_info(), &pool_ai, r.user_out, &[&ps])?;
    c.quote_xfer(&c.quote_vault.to_account_info(), &c.fee_vault.to_account_info(), &pool_ai, r.fee, &[&ps])?;

    emit!(Swapped {
        mint: m,
        trader: a.user.key(),
        side: side::SELL,
        base_amount: base_in,
        quote_amount: r.user_out,
        fee: r.fee,
        base_reserve: br,
        quote_reserve: qr,
        price,
        ts: now,
    });
    Ok(r.user_out)
}

// ------------------------------------------------------ protocol swaps ---

/// Offer remainder: escrow → pool, proceeds to the seller. No size limits.
pub fn sell_from_offer<'info>(ctx: Context<'info, ProtocolSwap<'info>>, base_in: u64, min_quote_out: u64) -> Result<u64> {
    require!(base_in > 0, AmmError::InvalidAmount);
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    require!(a.source.mint == a.mint.key() && a.destination.mint == a.quote_mint.key(), AmmError::AccountMismatch);
    let (base_r, quote_r) = pre_trade(&a.pool, now)?;
    let r = amm::sell(base_in, base_r, quote_r, a.market.params.trade_fee_bps as u32).mx()?;
    require!(r.user_out >= min_quote_out, AmmError::Slippage);
    let (br, qr, price, bump) = apply(&a.pool, &r, false, now)?;

    let c = Ctx {
        pool: &a.pool,
        mint: &a.mint,
        quote_mint: &a.quote_mint,
        base_vault: &a.base_vault,
        quote_vault: &a.quote_vault,
        fee_vault: &a.fee_vault,
        base_program: &a.base_token_program,
        quote_program: &a.quote_token_program,
    };
    // escrow authority signature is inherited from the offers program CPI
    c.base_xfer(&a.source.to_account_info(), &c.base_vault.to_account_info(), &a.escrow_authority.to_account_info(), ctx.remaining_accounts, base_in, &[])?;
    let (b, m) = ([bump], a.mint.key());
    let ps = c.pool_seeds(&b, &m);
    let pool_ai = c.pool.to_account_info();
    c.quote_xfer(&c.quote_vault.to_account_info(), &a.destination.to_account_info(), &pool_ai, r.user_out, &[&ps])?;
    c.quote_xfer(&c.quote_vault.to_account_info(), &c.fee_vault.to_account_info(), &pool_ai, r.fee, &[&ps])?;

    emit!(Swapped {
        mint: m,
        trader: a.trader.key(),
        side: side::OFFER_REMAINDER,
        base_amount: base_in,
        quote_amount: r.user_out,
        fee: r.fee,
        base_reserve: br,
        quote_reserve: qr,
        price,
        ts: now,
    });
    Ok(r.user_out)
}

/// Fee-free buy authorised by a Return Ticket (validated by the offers
/// program, which signs as escrow authority). Output capped at
/// `max_base_out` (remaining ticket allowance).
pub fn buy_with_ticket<'info>(
    ctx: Context<'info, ProtocolSwap<'info>>,
    quote_in: u64,
    min_base_out: u64,
    max_base_out: u64,
) -> Result<u64> {
    require!(quote_in > 0, AmmError::InvalidAmount);
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    require!(a.source.mint == a.quote_mint.key() && a.destination.mint == a.mint.key(), AmmError::AccountMismatch);
    let (base_r, quote_r) = pre_trade(&a.pool, now)?;
    let r = amm::buy(quote_in, base_r, quote_r, 0).mx()?;
    require!(r.user_out >= min_base_out, AmmError::Slippage);
    require!(r.user_out <= max_base_out, AmmError::TicketExceeded);
    let (br, qr, price, bump) = apply(&a.pool, &r, true, now)?;

    let c = Ctx {
        pool: &a.pool,
        mint: &a.mint,
        quote_mint: &a.quote_mint,
        base_vault: &a.base_vault,
        quote_vault: &a.quote_vault,
        fee_vault: &a.fee_vault,
        base_program: &a.base_token_program,
        quote_program: &a.quote_token_program,
    };
    c.quote_xfer(&a.source.to_account_info(), &c.quote_vault.to_account_info(), &a.source_authority.to_account_info(), r.reserve_in, &[])?;
    let (b, m) = ([bump], a.mint.key());
    let ps = c.pool_seeds(&b, &m);
    c.base_xfer(&c.base_vault.to_account_info(), &a.destination.to_account_info(), &c.pool.to_account_info(), ctx.remaining_accounts, r.user_out, &[&ps])?;

    emit!(Swapped {
        mint: m,
        trader: a.trader.key(),
        side: side::TICKET_BUY,
        base_amount: r.user_out,
        quote_amount: quote_in,
        fee: 0,
        base_reserve: br,
        quote_reserve: qr,
        price,
        ts: now,
    });
    Ok(r.user_out)
}

pub fn twap(ctx: Context<ReadPool>, window: u32, end_ago: u32) -> Result<u128> {
    let now = Clock::get()?.unix_timestamp;
    let p = ctx.accounts.pool.load()?;
    p.oracle().twap(now, window, end_ago).mx()
}
