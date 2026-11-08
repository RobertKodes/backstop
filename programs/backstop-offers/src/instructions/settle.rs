use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};
use backstop_amm::program::BackstopAmm;
use backstop_common::cpi::transfer_checked_with_hook;
use backstop_common::{defaults, ids, pda, seeds};
use backstop_core::state::Market;
use backstop_math::allocation::random_offset;
use backstop_math::fees::fee_ceil;
use backstop_math::BPS;

use crate::errors::{MathExt, OffersError};
use crate::events::{BiddingClosed, OfferClosed, OfferSettled, RemainderSold, TicketIssued};
use crate::rng::{allocation_seed, slot_hash, SLOT_HASHES, SLOT_HASH_RETENTION};
use crate::state::{status, Offer, OfferBook, Ticket};

// ------------------------------------------------------------- close ---

#[derive(Accounts)]
pub struct CloseBidding<'info> {
    #[account(mut, seeds = [seeds::OFFER, offer.mint.as_ref(), &offer.id.to_le_bytes()], bump = offer.bump)]
    pub offer: Box<Account<'info, Offer>>,
}

/// Permissionless. Closes bidding at expiry — or early once the bids cover
/// the offer *and* the bid-epoch in which coverage happened has ended (so
/// everyone bidding in that epoch competes pro-rata, not first-come). Commits
/// the randomness slot. Re-arms the slot if its hash expired unused.
pub fn close_bidding(ctx: Context<CloseBidding>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let slot = Clock::get()?.slot;
    let o = &mut ctx.accounts.offer;
    match o.status {
        status::OPEN => {
            let early = if o.covered_at > 0 {
                let e = o.bid_epoch_secs.max(1) as i64;
                let epoch_end = o.created_at + ((o.covered_at - o.created_at) / e + 1) * e;
                now >= epoch_end
            } else {
                false
            };
            require!(now >= o.expires_at || early, OffersError::CannotCloseYet);
            o.status = status::CLOSING;
            o.closed_at = now;
            o.rand_slot = slot + defaults::RAND_SLOT_DELAY;
            emit!(BiddingClosed {
                mint: o.mint,
                offer: o.key(),
                rand_slot: o.rand_slot,
                early: now < o.expires_at,
                ts: now
            });
        }
        status::CLOSING => {
            require!(
                slot > o.rand_slot + SLOT_HASH_RETENTION,
                OffersError::CannotCloseYet
            );
            o.rand_slot = slot + defaults::RAND_SLOT_DELAY;
            emit!(BiddingClosed {
                mint: o.mint,
                offer: o.key(),
                rand_slot: o.rand_slot,
                early: false,
                ts: now
            });
        }
        _ => return err!(OffersError::NotOpen),
    }
    Ok(())
}

// ------------------------------------------------------------ settle ---

#[derive(Accounts)]
pub struct Settle<'info> {
    /// Shield PDA of the chest program: settlement is always routed through
    /// the chest program so the Shield's priority slice is booked atomically
    /// (D-025).
    #[account(address = pda::shield(&mint.key()).0 @ OffersError::Unauthorized)]
    pub shield_authority: Signer<'info>,
    /// Pays rent for the Return Ticket (keeper / cranker).
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [seeds::MARKET, mint.key().as_ref()], bump = market.bump, seeds::program = ids::CORE, has_one = mint, has_one = fee_vault)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [seeds::BOOK, mint.key().as_ref()], bump = book.bump, has_one = mint, has_one = escrow_vault)]
    pub book: Box<Account<'info, OfferBook>>,
    #[account(
        mut,
        seeds = [seeds::OFFER, mint.key().as_ref(), &offer.id.to_le_bytes()],
        bump = offer.bump,
        has_one = mint,
        has_one = bid_vault,
        has_one = seller_quote,
    )]
    pub offer: Box<Account<'info, Offer>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub escrow_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub bid_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub seller_quote: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub fee_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = quote_mint, token::authority = shield_authority)]
    pub shield_quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = shield_authority)]
    pub shield_token_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        space = 8 + Ticket::INIT_SPACE,
        seeds = [seeds::TICKET, mint.key().as_ref(), offer.seller.as_ref(), &offer.id.to_le_bytes()],
        bump
    )]
    pub ticket: Box<Account<'info, Ticket>>,
    /// CHECK: address-checked SlotHashes sysvar.
    #[account(address = SLOT_HASHES)]
    pub slot_hashes: UncheckedAccount<'info>,
    #[account(address = ids::TOKEN_2022)]
    pub base_token_program: Interface<'info, TokenInterface>,
    #[account(address = market.quote_token_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    // remaining accounts: hook accounts for escrow → shield token vault
}

/// Allocate the offer: Shield priority slice (`shield_lots`, computed by the
/// chest program from its funds and caps), then randomised pro-rata over the
/// bidders. Pays the seller (net of the 3 % fee), delivers the Shield's
/// tokens, and issues the seller's Return Ticket. Bidders claim lazily.
pub fn settle<'info>(ctx: Context<'info, Settle<'info>>, shield_lots: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let slot = Clock::get()?.slot;
    let a = &ctx.accounts;
    let o = &a.offer;
    require!(o.status == status::CLOSING, OffersError::NotClosing);
    require!(slot > o.rand_slot, OffersError::RandomnessPending);
    let hash = slot_hash(&a.slot_hashes.to_account_info(), o.rand_slot)?;
    let seed = allocation_seed(&hash, &o.key(), o.id);

    let p = a.market.params;
    let max_shield = o.lots * p.shield_max_share_bps as u64 / BPS;
    require!(shield_lots <= max_shield, OffersError::ShieldSliceTooLarge);
    let available = o.lots - shield_lots;
    let bidder_lots = o.total_capacity.min(available);
    let offset = if o.total_capacity > available {
        random_offset(&seed, o.total_capacity).mx()?
    } else {
        0
    };
    let filled = shield_lots + bidder_lots;
    let proceeds = filled
        .checked_mul(o.lot_cost)
        .ok_or(OffersError::MathOverflow)?;
    let fee = fee_ceil(proceeds, p.trade_fee_bps as u32).mx()?;
    let net = proceeds - fee;
    let shield_cost = shield_lots * o.lot_cost;
    let shield_tokens = shield_lots * o.lot_size;
    let remainder = (available - bidder_lots) * o.lot_size + o.dust;

    let mint_key = a.mint.key();
    let id_bytes = o.id.to_le_bytes();
    let obump = [o.bump];
    let offer_seeds: [&[u8]; 4] = [seeds::OFFER, mint_key.as_ref(), &id_bytes, &obump];
    let bbump = [a.book.bump];
    let book_seeds: [&[u8]; 3] = [seeds::BOOK, mint_key.as_ref(), &bbump];
    let quote_xfer = |from: &AccountInfo<'info>,
                      to: &AccountInfo<'info>,
                      auth: &AccountInfo<'info>,
                      amt: u64,
                      signer: &[&[&[u8]]]|
     -> Result<()> {
        if amt == 0 {
            return Ok(());
        }
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                a.quote_token_program.key(),
                TransferChecked {
                    from: from.clone(),
                    mint: a.quote_mint.to_account_info(),
                    to: to.clone(),
                    authority: auth.clone(),
                },
                signer,
            ),
            amt,
            a.quote_mint.decimals,
        )
    };
    // Shield pays for its slice (signature inherited from the chest program).
    quote_xfer(
        &a.shield_quote_vault.to_account_info(),
        &a.bid_vault.to_account_info(),
        &a.shield_authority.to_account_info(),
        shield_cost,
        &[],
    )?;
    let offer_ai = a.offer.to_account_info();
    quote_xfer(
        &a.bid_vault.to_account_info(),
        &a.seller_quote.to_account_info(),
        &offer_ai,
        net,
        &[&offer_seeds],
    )?;
    quote_xfer(
        &a.bid_vault.to_account_info(),
        &a.fee_vault.to_account_info(),
        &offer_ai,
        fee,
        &[&offer_seeds],
    )?;
    if shield_tokens > 0 {
        transfer_checked_with_hook(
            &a.base_token_program.to_account_info(),
            &a.escrow_vault.to_account_info(),
            &a.mint.to_account_info(),
            &a.shield_token_vault.to_account_info(),
            &a.book.to_account_info(),
            ctx.remaining_accounts,
            shield_tokens,
            defaults::DECIMALS,
            &[&book_seeds],
        )?;
    }

    let ticket_amount = filled * o.lot_size;
    let seller = o.seller;
    let t = &mut ctx.accounts.ticket;
    t.bump = ctx.bumps.ticket;
    t.mint = mint_key;
    t.seller = seller;
    t.offer_id = ctx.accounts.offer.id;
    t.amount = ticket_amount;
    t.used = 0;
    t.created_at = now;
    t.expires_at = now + p.ticket_validity_secs as i64;

    let o = &mut ctx.accounts.offer;
    o.status = status::SETTLED;
    o.settled_at = now;
    o.seed = seed;
    o.random_offset = offset;
    o.shield_lots = shield_lots;
    o.bidder_lots = bidder_lots;
    o.remainder_tokens = remainder;
    o.remainder_sold = remainder == 0;
    o.proceeds = proceeds;
    o.fee = fee;
    o.escrowed -= shield_tokens;
    let b = &mut ctx.accounts.book;
    b.total_escrowed -= shield_tokens;
    b.tokens_to_shield = b.tokens_to_shield.saturating_add(shield_tokens);
    b.tokens_absorbed = b.tokens_absorbed.saturating_add(bidder_lots * o.lot_size);
    b.quote_to_sellers = b.quote_to_sellers.saturating_add(net);
    b.fees_paid = b.fees_paid.saturating_add(fee);

    emit!(TicketIssued {
        mint: mint_key,
        seller,
        offer_id: o.id,
        amount: ticket_amount,
        expires_at: now + p.ticket_validity_secs as i64
    });
    emit!(OfferSettled {
        mint: mint_key,
        offer: o.key(),
        seller,
        shield_lots,
        bidder_lots,
        total_capacity: o.total_capacity,
        random_offset: offset,
        seed,
        proceeds,
        fee,
        seller_net: net,
        remainder_tokens: remainder,
        ticket_amount,
        ts: now,
    });
    Ok(())
}

// ---------------------------------------------------------- remainder ---

#[derive(Accounts)]
pub struct SellRemainder<'info> {
    pub cranker: Signer<'info>,
    /// CHECK: seller identity for the AMM event.
    #[account(address = offer.seller)]
    pub seller: UncheckedAccount<'info>,
    /// CHECK: core market (validated by the AMM).
    pub market: UncheckedAccount<'info>,
    #[account(mut, seeds = [seeds::BOOK, mint.key().as_ref()], bump = book.bump, has_one = mint, has_one = escrow_vault)]
    pub book: Box<Account<'info, OfferBook>>,
    #[account(
        mut,
        seeds = [seeds::OFFER, mint.key().as_ref(), &offer.id.to_le_bytes()],
        bump = offer.bump,
        has_one = mint,
        has_one = seller_quote,
    )]
    pub offer: Box<Account<'info, Offer>>,
    /// CHECK: AMM pool (validated by the AMM).
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: validated by the AMM.
    pub quote_mint: UncheckedAccount<'info>,
    /// CHECK: validated by the AMM.
    #[account(mut)]
    pub base_vault: UncheckedAccount<'info>,
    /// CHECK: validated by the AMM.
    #[account(mut)]
    pub quote_vault: UncheckedAccount<'info>,
    /// CHECK: validated by the AMM.
    #[account(mut)]
    pub fee_vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub escrow_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: equals offer.seller_quote.
    #[account(mut)]
    pub seller_quote: UncheckedAccount<'info>,
    pub amm_program: Program<'info, BackstopAmm>,
    /// CHECK: Token-2022 (validated by the AMM).
    pub base_token_program: UncheckedAccount<'info>,
    /// CHECK: quote token program (validated by the AMM).
    pub quote_token_program: UncheckedAccount<'info>,
    // remaining accounts: hook accounts for escrow → pool
}

/// Permissionless: route the unfilled remainder into the protocol AMM.
pub fn sell_remainder<'info>(ctx: Context<'info, SellRemainder<'info>>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    require!(a.offer.status == status::SETTLED, OffersError::NotSettled);
    require!(
        !a.offer.remainder_sold && a.offer.remainder_tokens > 0,
        OffersError::NoRemainder
    );
    let amount = a.offer.remainder_tokens;
    let mint_key = a.mint.key();
    let bbump = [a.book.bump];
    let book_seeds: [&[u8]; 3] = [seeds::BOOK, mint_key.as_ref(), &bbump];
    let out = backstop_amm::cpi::sell_from_offer(
        CpiContext::new_with_signer(
            ids::AMM,
            backstop_amm::cpi::accounts::ProtocolSwap {
                escrow_authority: a.book.to_account_info(),
                trader: a.seller.to_account_info(),
                market: a.market.to_account_info(),
                pool: a.pool.to_account_info(),
                mint: a.mint.to_account_info(),
                quote_mint: a.quote_mint.to_account_info(),
                base_vault: a.base_vault.to_account_info(),
                quote_vault: a.quote_vault.to_account_info(),
                fee_vault: a.fee_vault.to_account_info(),
                source: a.escrow_vault.to_account_info(),
                destination: a.seller_quote.to_account_info(),
                source_authority: a.book.to_account_info(),
                base_token_program: a.base_token_program.to_account_info(),
                quote_token_program: a.quote_token_program.to_account_info(),
            },
            &[&book_seeds],
        )
        .with_remaining_accounts(ctx.remaining_accounts.to_vec()),
        amount,
        0,
    )?
    .get();
    let o = &mut ctx.accounts.offer;
    o.remainder_sold = true;
    o.remainder_proceeds = out;
    o.escrowed -= amount;
    let b = &mut ctx.accounts.book;
    b.total_escrowed -= amount;
    b.tokens_to_amm = b.tokens_to_amm.saturating_add(amount);
    b.quote_to_sellers = b.quote_to_sellers.saturating_add(out);
    emit!(RemainderSold {
        mint: mint_key,
        offer: o.key(),
        tokens: amount,
        quote_out: out,
        ts: now
    });
    Ok(())
}

// ------------------------------------------------------------- close ---

#[derive(Accounts)]
pub struct CloseOffer<'info> {
    /// CHECK: receives the offer and bid-vault rent.
    #[account(mut, address = offer.seller)]
    pub seller: UncheckedAccount<'info>,
    #[account(mut, seeds = [seeds::BOOK, offer.mint.as_ref()], bump = book.bump)]
    pub book: Box<Account<'info, OfferBook>>,
    #[account(
        mut,
        close = seller,
        seeds = [seeds::OFFER, offer.mint.as_ref(), &offer.id.to_le_bytes()],
        bump = offer.bump,
        has_one = bid_vault,
    )]
    pub offer: Box<Account<'info, Offer>>,
    #[account(mut)]
    pub bid_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub quote_token_program: Interface<'info, TokenInterface>,
}

/// Permissionless once every bid is claimed and the remainder is sold.
pub fn close_offer(ctx: Context<CloseOffer>) -> Result<()> {
    let o = &ctx.accounts.offer;
    require!(o.status == status::SETTLED, OffersError::NotSettled);
    require!(
        o.remainder_sold && o.claimed_count == o.bid_count,
        OffersError::OfferNotFinished
    );
    require!(
        o.escrowed == 0 && ctx.accounts.bid_vault.amount == 0,
        OffersError::OfferNotFinished
    );
    let mint_key = o.mint;
    let id_bytes = o.id.to_le_bytes();
    let obump = [o.bump];
    let offer_seeds: [&[u8]; 4] = [seeds::OFFER, mint_key.as_ref(), &id_bytes, &obump];
    token_interface::close_account(CpiContext::new_with_signer(
        ctx.accounts.quote_token_program.key(),
        CloseAccount {
            account: ctx.accounts.bid_vault.to_account_info(),
            destination: ctx.accounts.seller.to_account_info(),
            authority: ctx.accounts.offer.to_account_info(),
        },
        &[&offer_seeds],
    ))?;
    let b = &mut ctx.accounts.book;
    b.open_offers = b.open_offers.saturating_sub(1);
    emit!(OfferClosed {
        mint: mint_key,
        offer: ctx.accounts.offer.key(),
        id: ctx.accounts.offer.id
    });
    Ok(())
}
