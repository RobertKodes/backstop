use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use backstop_amm::state::Pool;
use backstop_common::cpi::transfer_checked_with_hook;
use backstop_common::{defaults, ids, pda, seeds};
use backstop_core::state::{pause, Market};
use backstop_hook::state::Holder;
use backstop_math::allocation::make_lots;
use backstop_math::discount::{discount_bps, fill_price, momentum_bps};

use crate::errors::{MathExt, OffersError};
use crate::events::OfferCreated;
use crate::state::{status, Offer, OfferBook, MAX_MESSAGE};

#[derive(Accounts)]
pub struct InitBook<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// Market governance (root markets) or the launchpad PDA (children).
    pub authority: Signer<'info>,
    #[account(seeds = [seeds::MARKET, mint.key().as_ref()], bump = market.bump, seeds::program = ids::CORE, has_one = mint, has_one = quote_mint)]
    pub market: Box<Account<'info, Market>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(init, payer = payer, space = 8 + OfferBook::INIT_SPACE, seeds = [seeds::BOOK, mint.key().as_ref()], bump)]
    pub book: Box<Account<'info, OfferBook>>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = book,
        associated_token::token_program = base_token_program,
    )]
    pub escrow_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = ids::TOKEN_2022)]
    pub base_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn init_book(ctx: Context<InitBook>) -> Result<()> {
    let a = &ctx.accounts;
    let auth = a.authority.key();
    require!(
        auth == a.market.governance || auth == pda::launchpad().0,
        OffersError::Unauthorized
    );
    let b = &mut ctx.accounts.book;
    b.bump = ctx.bumps.book;
    b.mint = ctx.accounts.mint.key();
    b.quote_mint = ctx.accounts.quote_mint.key();
    b.escrow_vault = ctx.accounts.escrow_vault.key();
    Ok(())
}

#[derive(Accounts)]
pub struct CreateOffer<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(seeds = [seeds::MARKET, mint.key().as_ref()], bump = market.bump, seeds::program = ids::CORE, has_one = mint)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [seeds::BOOK, mint.key().as_ref()], bump = book.bump, has_one = mint, has_one = escrow_vault)]
    pub book: Box<Account<'info, OfferBook>>,
    #[account(seeds = [seeds::POOL, mint.key().as_ref()], bump = pool.load()?.bump, seeds::program = ids::AMM)]
    pub pool: AccountLoader<'info, Pool>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = seller,
        space = 8 + Offer::INIT_SPACE,
        seeds = [seeds::OFFER, mint.key().as_ref(), &book.next_offer_id.to_le_bytes()],
        bump
    )]
    pub offer: Box<Account<'info, Offer>>,
    #[account(
        init,
        payer = seller,
        associated_token::mint = quote_mint,
        associated_token::authority = offer,
        associated_token::token_program = quote_token_program,
    )]
    pub bid_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = seller, token::token_program = base_token_program)]
    pub seller_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(token::mint = quote_mint, token::authority = seller, token::token_program = quote_token_program)]
    pub seller_quote: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub escrow_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Seller's holder (tenure carried by the offer + self-fill ring).
    #[account(
        seeds = [seeds::HOLDER, mint.key().as_ref(), seller.key().as_ref()],
        bump = seller_holder.load()?.bump,
        seeds::program = ids::HOOK,
    )]
    pub seller_holder: AccountLoader<'info, Holder>,
    #[account(address = ids::TOKEN_2022)]
    pub base_token_program: Interface<'info, TokenInterface>,
    #[account(address = market.quote_token_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    // remaining accounts: hook accounts for seller → escrow
}

/// Escrow `amount` tokens as a 10-minute offer to holders. Offers cannot be
/// cancelled (anti-spoofing). The discount and fill price are frozen now.
pub fn create_offer<'info>(
    ctx: Context<'info, CreateOffer<'info>>,
    amount: u64,
    message: Vec<u8>,
) -> Result<()> {
    let a = &ctx.accounts;
    let p = a.market.params;
    require!(
        !a.market.is_paused(pause::NEW_OFFERS),
        OffersError::OffersPaused
    );
    require!(amount >= p.min_offer_size, OffersError::BelowMinimumOffer);
    require!(message.len() <= MAX_MESSAGE, OffersError::MessageTooLong);
    let now = Clock::get()?.unix_timestamp;

    // Frozen pricing from the on-chain TWAP.
    let (twap, momentum) = {
        let pool = a.pool.load()?;
        let o = pool.oracle();
        let twap = o.twap_or_available(now, p.price_twap_window_secs).mx()?;
        let momentum = match o.twap(now, p.price_twap_window_secs, p.momentum_lookback_secs) {
            Ok(then) if then > 0 => momentum_bps(twap, then).mx()?,
            _ => 0,
        };
        (twap, momentum)
    };
    let discount = discount_bps(momentum, &p.discount()).mx()?;
    let price = fill_price(twap, discount).mx()?;
    let lots = make_lots(amount, p.lots_per_offer as u64, price).mx()?;

    // Tenure carried by these tokens — read before the escrow transfer resets it.
    let lot_tenure = a
        .seller_holder
        .load()?
        .tenure()
        .lot_tenure(amount, now)
        .mx()?;

    transfer_checked_with_hook(
        &a.base_token_program.to_account_info(),
        &a.seller_token.to_account_info(),
        &a.mint.to_account_info(),
        &a.escrow_vault.to_account_info(),
        &a.seller.to_account_info(),
        ctx.remaining_accounts,
        amount,
        defaults::DECIMALS,
        &[],
    )?;

    let book = &mut ctx.accounts.book;
    let id = book.next_offer_id;
    book.next_offer_id += 1;
    book.open_offers += 1;
    book.offers_created += 1;
    book.total_escrowed = book
        .total_escrowed
        .checked_add(amount)
        .ok_or(OffersError::MathOverflow)?;
    book.tokens_offered = book.tokens_offered.saturating_add(amount);

    let o = &mut ctx.accounts.offer;
    o.bump = ctx.bumps.offer;
    o.status = status::OPEN;
    o.id = id;
    o.mint = ctx.accounts.mint.key();
    o.seller = ctx.accounts.seller.key();
    o.seller_quote = ctx.accounts.seller_quote.key();
    o.bid_vault = ctx.accounts.bid_vault.key();
    o.created_at = now;
    o.expires_at = now + p.offer_window_secs as i64;
    o.amount = amount;
    o.lots = lots.lots;
    o.lot_size = lots.lot_size;
    o.lot_cost = lots.lot_cost;
    o.dust = lots.dust;
    o.twap = twap;
    o.fill_price = price;
    o.discount_bps = discount;
    o.momentum_bps = momentum;
    o.bid_epoch_secs = p.bid_epoch_secs;
    o.seller_lot_tenure = lot_tenure;
    o.escrowed = amount;
    o.message_len = message.len() as u8;
    o.message[..message.len()].copy_from_slice(&message);

    emit!(OfferCreated {
        mint: o.mint,
        offer: o.key(),
        id,
        seller: o.seller,
        amount,
        lots: o.lots,
        lot_size: o.lot_size,
        lot_cost: o.lot_cost,
        twap,
        fill_price: price,
        discount_bps: discount,
        momentum_bps: momentum,
        seller_lot_tenure: lot_tenure,
        created_at: now,
        expires_at: o.expires_at,
        message: String::from_utf8_lossy(&message).into_owned(),
    });
    Ok(())
}
