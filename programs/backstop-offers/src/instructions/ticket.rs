use anchor_lang::prelude::*;
use backstop_amm::program::BackstopAmm;
use backstop_common::{ids, seeds};

use crate::errors::OffersError;
use crate::events::TicketUsed;
use crate::state::{OfferBook, Ticket};

#[derive(Accounts)]
pub struct UseTicket<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [seeds::TICKET, ticket.mint.as_ref(), buyer.key().as_ref(), &ticket.offer_id.to_le_bytes()],
        bump = ticket.bump,
    )]
    pub ticket: Box<Account<'info, Ticket>>,
    #[account(seeds = [seeds::BOOK, ticket.mint.as_ref()], bump = book.bump)]
    pub book: Box<Account<'info, OfferBook>>,
    /// CHECK: validated by the AMM.
    pub market: UncheckedAccount<'info>,
    /// CHECK: validated by the AMM.
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,
    /// CHECK: must be the ticket's mint (validated by the AMM against the pool).
    #[account(address = ticket.mint)]
    pub mint: UncheckedAccount<'info>,
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
    /// CHECK: buyer's quote account (spent with the buyer's signature).
    #[account(mut)]
    pub buyer_quote: UncheckedAccount<'info>,
    /// CHECK: buyer's base account (hook enforces a wallet owner).
    #[account(mut)]
    pub buyer_base: UncheckedAccount<'info>,
    pub amm_program: Program<'info, BackstopAmm>,
    /// CHECK: validated by the AMM.
    pub base_token_program: UncheckedAccount<'info>,
    /// CHECK: validated by the AMM.
    pub quote_token_program: UncheckedAccount<'info>,
    // remaining accounts: hook accounts for pool → buyer
}

/// Re-buy up to the absorbed amount with 0 % fee within the ticket's validity.
pub fn buy_with_ticket<'info>(
    ctx: Context<'info, UseTicket<'info>>,
    quote_in: u64,
    min_base_out: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    let t = &a.ticket;
    require!(
        now < t.expires_at && t.used < t.amount,
        OffersError::TicketUnavailable
    );
    let remaining = t.amount - t.used;
    let mint_key = t.mint;
    let bbump = [a.book.bump];
    let book_seeds: [&[u8]; 3] = [seeds::BOOK, mint_key.as_ref(), &bbump];
    let out = backstop_amm::cpi::buy_with_ticket(
        CpiContext::new_with_signer(
            ids::AMM,
            backstop_amm::cpi::accounts::ProtocolSwap {
                escrow_authority: a.book.to_account_info(),
                trader: a.buyer.to_account_info(),
                market: a.market.to_account_info(),
                pool: a.pool.to_account_info(),
                mint: a.mint.to_account_info(),
                quote_mint: a.quote_mint.to_account_info(),
                base_vault: a.base_vault.to_account_info(),
                quote_vault: a.quote_vault.to_account_info(),
                fee_vault: a.fee_vault.to_account_info(),
                source: a.buyer_quote.to_account_info(),
                destination: a.buyer_base.to_account_info(),
                source_authority: a.buyer.to_account_info(),
                base_token_program: a.base_token_program.to_account_info(),
                quote_token_program: a.quote_token_program.to_account_info(),
            },
            &[&book_seeds],
        )
        .with_remaining_accounts(ctx.remaining_accounts.to_vec()),
        quote_in,
        min_base_out,
        remaining,
    )?
    .get();
    let t = &mut ctx.accounts.ticket;
    t.used += out;
    emit!(TicketUsed {
        mint: mint_key,
        seller: t.seller,
        offer_id: t.offer_id,
        tokens: out,
        remaining: t.amount - t.used
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CloseTicket<'info> {
    /// CHECK: receives the rent.
    #[account(mut, address = ticket.seller)]
    pub seller: UncheckedAccount<'info>,
    #[account(
        mut,
        close = seller,
        seeds = [seeds::TICKET, ticket.mint.as_ref(), ticket.seller.as_ref(), &ticket.offer_id.to_le_bytes()],
        bump = ticket.bump,
    )]
    pub ticket: Box<Account<'info, Ticket>>,
}

/// Permissionless once the ticket has expired or been used up.
pub fn close_ticket(ctx: Context<CloseTicket>) -> Result<()> {
    let t = &ctx.accounts.ticket;
    let now = Clock::get()?.unix_timestamp;
    require!(
        now >= t.expires_at || t.used >= t.amount,
        OffersError::TicketUnavailable
    );
    Ok(())
}
