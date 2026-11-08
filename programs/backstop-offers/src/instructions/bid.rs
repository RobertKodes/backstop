use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use backstop_common::{ids, pda, seeds};
use backstop_core::state::Market;
use backstop_hook::state::{Holder, HookConfig};
use backstop_math::allocation::capacity;

use crate::errors::{MathExt, OffersError};
use crate::events::BidPlaced;
use crate::state::{bid_kind, status, Bid, Offer};

#[derive(Accounts)]
#[instruction(amount: u64, kind: u8)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub rent_payer: Signer<'info>,
    /// The bidder (wallet bids) or the chest-market PDA (chest/auto bids).
    pub funder: Signer<'info>,
    /// CHECK: identity of the bidder (receives the tokens and tenure credit).
    pub bidder: UncheckedAccount<'info>,
    #[account(seeds = [seeds::MARKET, mint.key().as_ref()], bump = market.bump, seeds::program = ids::CORE, has_one = mint)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        seeds = [seeds::OFFER, mint.key().as_ref(), &offer.id.to_le_bytes()],
        bump = offer.bump,
        has_one = mint,
        has_one = bid_vault,
    )]
    pub offer: Box<Account<'info, Offer>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = rent_payer,
        space = 8 + Bid::INIT_SPACE,
        seeds = [seeds::BID, offer.key().as_ref(), bidder.key().as_ref(), &[kind]],
        bump
    )]
    pub bid: Box<Account<'info, Bid>>,
    #[account(mut, token::mint = quote_mint, token::authority = funder, token::token_program = quote_token_program)]
    pub funder_quote: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(token::mint = quote_mint, token::token_program = quote_token_program)]
    pub refund_to: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub bid_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        seeds = [seeds::HOLDER, mint.key().as_ref(), offer.seller.as_ref()],
        bump = seller_holder.load()?.bump,
        seeds::program = ids::HOOK,
    )]
    pub seller_holder: AccountLoader<'info, Holder>,
    #[account(seeds = [seeds::HOOK_CONFIG, mint.key().as_ref()], bump = hook_config.bump, seeds::program = ids::HOOK)]
    pub hook_config: Box<Account<'info, HookConfig>>,
    #[account(address = market.quote_token_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

/// Lock `amount` quote tokens (rounded down to whole lots) as a bid. Bids are
/// final for the window; allocation happens at settlement.
pub fn place_bid(ctx: Context<PlaceBid>, amount: u64, kind: u8) -> Result<()> {
    let a = &ctx.accounts;
    let now = Clock::get()?.unix_timestamp;
    let bidder = a.bidder.key();
    let funder = a.funder.key();
    match kind {
        bid_kind::WALLET => {
            require_keys_eq!(funder, bidder, OffersError::Unauthorized);
            require_keys_eq!(a.refund_to.owner, bidder, OffersError::AccountMismatch);
        }
        bid_kind::CHEST | bid_kind::AUTO => {
            require_keys_eq!(
                funder,
                pda::chest_market(&a.mint.key()).0,
                OffersError::Unauthorized
            );
            require_keys_eq!(a.refund_to.owner, funder, OffersError::AccountMismatch);
        }
        _ => return err!(OffersError::Unauthorized),
    }
    let o = &a.offer;
    require!(o.status == status::OPEN, OffersError::NotOpen);
    require!(now < o.expires_at, OffersError::WindowEnded);
    require_keys_neq!(bidder, o.seller, OffersError::SelfBid);
    // Self-fill protection (D-031): the bidder must not have funded the seller recently.
    let h = a.seller_holder.load()?;
    require!(
        !h.received_from_recently(&bidder, now, a.hook_config.link_window_secs),
        OffersError::LinkedWallet
    );
    drop(h);

    let cap = capacity(amount, o.lot_cost).mx()?;
    require!(cap >= 1, OffersError::BidTooSmall);
    let locked = cap
        .checked_mul(o.lot_cost)
        .ok_or(OffersError::MathOverflow)?;
    token_interface::transfer_checked(
        CpiContext::new(
            a.quote_token_program.key(),
            TransferChecked {
                from: a.funder_quote.to_account_info(),
                mint: a.quote_mint.to_account_info(),
                to: a.bid_vault.to_account_info(),
                authority: a.funder.to_account_info(),
            },
        ),
        locked,
        a.quote_mint.decimals,
    )?;

    let offer_key = ctx.accounts.offer.key();
    let o = &mut ctx.accounts.offer;
    let prefix = o.total_capacity;
    o.total_capacity = o
        .total_capacity
        .checked_add(cap)
        .ok_or(OffersError::MathOverflow)?;
    o.bid_count += 1;
    o.bid_quote_total = o.bid_quote_total.saturating_add(locked);
    if o.covered_at == 0 && o.total_capacity >= o.lots {
        o.covered_at = now;
    }
    let total = o.total_capacity;

    let b = &mut ctx.accounts.bid;
    b.bump = ctx.bumps.bid;
    b.kind = kind;
    b.offer = offer_key;
    b.bidder = bidder;
    b.refund_to = ctx.accounts.refund_to.key();
    b.rent_payer = ctx.accounts.rent_payer.key();
    b.amount = locked;
    b.capacity = cap;
    b.prefix = prefix;
    b.created_at = now;

    emit!(BidPlaced {
        mint: ctx.accounts.mint.key(),
        offer: offer_key,
        bid: b.key(),
        bidder,
        kind,
        amount: locked,
        capacity: cap,
        prefix,
        total_capacity: total,
        ts: now,
    });
    Ok(())
}
