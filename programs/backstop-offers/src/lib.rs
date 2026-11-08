//! # backstop-offers
//!
//! Every sell above the minimum size becomes a 10-minute **offer** to
//! existing holders at a counter-cyclical discount:
//!
//! 1. `create_offer` — tokens escrowed (no cancel), discount and fill price
//!    frozen from the AMM TWAP, lots fixed.
//! 2. `place_bid` — wallet, chest or Auto-Absorb funds locked in whole lots.
//! 3. `close_bidding` — at expiry (or after the bid epoch in which the offer
//!    became covered); commits a future slot for randomness.
//! 4. `settle` — via the chest program (Shield priority slice), randomised
//!    pro-rata allocation, seller paid, Return Ticket issued.
//! 5. `sell_remainder` — unfilled lots to the AMM (permissionless).
//! 6. `claim` — each bid's O(1) allocation, refund and tenure credit.
//! 7. `buy_with_ticket` — fee-free re-buy up to the absorbed amount.
//!
//! PDAs: `["book", mint]` (also escrow authority), `["offer", mint, id]`,
//! `["bid", offer, bidder, kind]`, `["ticket", mint, seller, offer_id]`.

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod rng;
pub mod state;

use instructions::*;

declare_id!("DW1bgui9AwKGmBxRryjGn6CtKYfo2aXuyeHXLxzewGj");

#[program]
pub mod backstop_offers {
    use super::*;

    pub fn init_book(ctx: Context<InitBook>) -> Result<()> {
        instructions::create::init_book(ctx)
    }

    pub fn create_offer<'info>(
        ctx: Context<'info, CreateOffer<'info>>,
        amount: u64,
        message: Vec<u8>,
    ) -> Result<()> {
        instructions::create::create_offer(ctx, amount, message)
    }

    pub fn place_bid(ctx: Context<PlaceBid>, amount: u64, kind: u8) -> Result<()> {
        instructions::bid::place_bid(ctx, amount, kind)
    }

    pub fn close_bidding(ctx: Context<CloseBidding>) -> Result<()> {
        instructions::settle::close_bidding(ctx)
    }

    pub fn settle<'info>(ctx: Context<'info, Settle<'info>>, shield_lots: u64) -> Result<()> {
        instructions::settle::settle(ctx, shield_lots)
    }

    pub fn sell_remainder<'info>(ctx: Context<'info, SellRemainder<'info>>) -> Result<()> {
        instructions::settle::sell_remainder(ctx)
    }

    pub fn claim<'info>(ctx: Context<'info, ClaimBid<'info>>) -> Result<u64> {
        instructions::claim::claim(ctx)
    }

    pub fn close_offer(ctx: Context<CloseOffer>) -> Result<()> {
        instructions::settle::close_offer(ctx)
    }

    pub fn buy_with_ticket<'info>(
        ctx: Context<'info, UseTicket<'info>>,
        quote_in: u64,
        min_base_out: u64,
    ) -> Result<()> {
        instructions::ticket::buy_with_ticket(ctx, quote_in, min_base_out)
    }

    pub fn close_ticket(ctx: Context<CloseTicket>) -> Result<()> {
        instructions::ticket::close_ticket(ctx)
    }
}
