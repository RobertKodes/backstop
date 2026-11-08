use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use backstop_common::cpi::transfer_checked_with_hook;
use backstop_common::{defaults, ids, pda, seeds};
use backstop_hook::program::BackstopHook;
use backstop_math::allocation::allocate;
use backstop_math::u256::mul_div_floor;

use crate::errors::{MathExt, OffersError};
use crate::events::BidClaimed;
use crate::state::{bid_kind, status, Bid, Offer, OfferBook};

#[derive(Accounts)]
pub struct ClaimBid<'info> {
    pub claimer: Signer<'info>,
    /// Required for chest-funded bids: the chest-market PDA (so the chest
    /// program can credit the refund to the bidder's chest atomically).
    pub refund_authority: Option<Signer<'info>>,
    #[account(mut, seeds = [seeds::BOOK, mint.key().as_ref()], bump = book.bump, has_one = mint, has_one = escrow_vault)]
    pub book: Box<Account<'info, OfferBook>>,
    #[account(
        mut,
        seeds = [seeds::OFFER, mint.key().as_ref(), &offer.id.to_le_bytes()],
        bump = offer.bump,
        has_one = mint,
        has_one = bid_vault,
    )]
    pub offer: Box<Account<'info, Offer>>,
    #[account(mut, has_one = offer, close = rent_payer)]
    pub bid: Box<Account<'info, Bid>>,
    /// CHECK: receives the bid account rent.
    #[account(mut, address = bid.rent_payer)]
    pub rent_payer: UncheckedAccount<'info>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = bid.bidder, token::token_program = base_token_program)]
    pub bidder_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, address = bid.refund_to)]
    pub refund_to: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub escrow_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub bid_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: hook config (validated by the hook program).
    pub hook_config: UncheckedAccount<'info>,
    /// CHECK: bidder's holder PDA; may be uninitialised (no tenure credit then).
    #[account(mut, seeds = [seeds::HOLDER, mint.key().as_ref(), bid.bidder.as_ref()], bump, seeds::program = ids::HOOK)]
    pub bidder_holder: UncheckedAccount<'info>,
    /// CHECK: reward state (validated by the hook program).
    #[account(mut)]
    pub reward_state: UncheckedAccount<'info>,
    pub hook_program: Program<'info, BackstopHook>,
    #[account(address = ids::TOKEN_2022)]
    pub base_token_program: Interface<'info, TokenInterface>,
    pub quote_token_program: Interface<'info, TokenInterface>,
    // remaining accounts: hook accounts for escrow → bidder
}

/// Deliver a bid's allocation (O(1), see D-022), credit the absorber 40 % of
/// the seller's lot tenure, and refund unspent quote. Returns the refund.
pub fn claim<'info>(ctx: Context<'info, ClaimBid<'info>>) -> Result<u64> {
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    let o = &a.offer;
    let b = &a.bid;
    require!(o.status == status::SETTLED, OffersError::NotSettled);
    if b.kind != bid_kind::WALLET {
        let ra = a
            .refund_authority
            .as_ref()
            .ok_or(OffersError::Unauthorized)?;
        require_keys_eq!(
            ra.key(),
            pda::chest_market(&a.mint.key()).0,
            OffersError::Unauthorized
        );
    }
    let lots = allocate(
        b.prefix,
        b.capacity,
        o.total_capacity,
        o.available_lots(),
        o.random_offset,
    )
    .mx()?;
    let tokens = lots * o.lot_size;
    let cost = lots * o.lot_cost;
    let refund = b.amount - cost;

    let mint_key = a.mint.key();
    let bbump = [a.book.bump];
    let book_seeds: [&[u8]; 3] = [seeds::BOOK, mint_key.as_ref(), &bbump];
    if tokens > 0 {
        transfer_checked_with_hook(
            &a.base_token_program.to_account_info(),
            &a.escrow_vault.to_account_info(),
            &a.mint.to_account_info(),
            &a.bidder_token.to_account_info(),
            &a.book.to_account_info(),
            ctx.remaining_accounts,
            tokens,
            defaults::DECIMALS,
            &[&book_seeds],
        )?;
    }
    if refund > 0 {
        let id_bytes = o.id.to_le_bytes();
        let obump = [o.bump];
        let offer_seeds: [&[u8]; 4] = [seeds::OFFER, mint_key.as_ref(), &id_bytes, &obump];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                a.quote_token_program.key(),
                TransferChecked {
                    from: a.bid_vault.to_account_info(),
                    mint: a.quote_mint.to_account_info(),
                    to: a.refund_to.to_account_info(),
                    authority: a.offer.to_account_info(),
                },
                &[&offer_seeds],
            ),
            refund,
            a.quote_mint.decimals,
        )?;
    }

    // Tenure transfers to the absorber (spec §3.1), pro-rata to the lot.
    let raw = if tokens > 0 && o.amount > 0 {
        mul_div_floor(o.seller_lot_tenure, tokens as u128, o.amount as u128).mx()?
    } else {
        0
    };
    let holder_ai = a.bidder_holder.to_account_info();
    if raw > 0 && holder_ai.owner == &ids::HOOK && holder_ai.data_len() > 0 {
        backstop_hook::cpi::credit_tenure(
            CpiContext::new_with_signer(
                ids::HOOK,
                backstop_hook::cpi::accounts::CreditTenure {
                    authority: a.book.to_account_info(),
                    config: a.hook_config.to_account_info(),
                    holder: holder_ai.clone(),
                    reward_state: a.reward_state.to_account_info(),
                },
                &[&book_seeds],
            ),
            raw,
        )?;
    }

    let (bid_key, bidder, kind) = (a.bid.key(), a.bid.bidder, a.bid.kind);
    let o = &mut ctx.accounts.offer;
    o.claimed_count += 1;
    o.tokens_claimed = o.tokens_claimed.saturating_add(tokens);
    o.escrowed -= tokens;
    ctx.accounts.book.total_escrowed -= tokens;
    emit!(BidClaimed {
        mint: mint_key,
        offer: o.key(),
        bid: bid_key,
        bidder,
        kind,
        lots,
        tokens,
        cost,
        refund,
        tenure_credited_raw: raw,
        ts: now,
    });
    Ok(refund)
}
