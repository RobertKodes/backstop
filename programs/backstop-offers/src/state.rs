use anchor_lang::prelude::*;

pub const MAX_MESSAGE: usize = 140;

/// On-chain offer status. UI status (spec §3.3) is derived:
/// * `OPEN` + no bids → **Open**; `OPEN` + capacity < lots → **PartiallyFilled**;
///   `OPEN` + capacity ≥ lots → **Filled** (oversubscribed, awaiting close);
/// * `OPEN`/`CLOSING` past `expires_at` → **Expired** (awaiting settlement);
/// * `SETTLED` → **Settled**.
pub mod status {
    pub const OPEN: u8 = 0;
    pub const CLOSING: u8 = 1;
    pub const SETTLED: u8 = 2;
}

pub mod bid_kind {
    /// Fresh quote tokens from the bidder's wallet.
    pub const WALLET: u8 = 0;
    /// Manual bid funded from the bidder's chest (via the chest program).
    pub const CHEST: u8 = 1;
    /// Auto-Absorb bid placed by a keeper under the bidder's grant.
    pub const AUTO: u8 = 2;
}

#[account]
#[derive(InitSpace)]
pub struct OfferBook {
    pub bump: u8,
    pub mint: Pubkey,
    pub quote_mint: Pubkey,
    /// ATA(book, mint): escrow for every offer of this market (D-013).
    pub escrow_vault: Pubkey,
    pub next_offer_id: u64,
    pub open_offers: u64,
    /// Σ offer.escrowed — always equals the escrow vault balance.
    pub total_escrowed: u64,
    pub offers_created: u64,
    pub tokens_offered: u64,
    pub tokens_absorbed: u64,
    pub tokens_to_shield: u64,
    pub tokens_to_amm: u64,
    pub quote_to_sellers: u64,
    pub fees_paid: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Offer {
    pub bump: u8,
    pub status: u8,
    pub id: u64,
    pub mint: Pubkey,
    pub seller: Pubkey,
    /// Seller's quote account receiving fill and remainder proceeds.
    pub seller_quote: Pubkey,
    /// ATA(offer, quote) holding bid funds.
    pub bid_vault: Pubkey,
    pub created_at: i64,
    pub expires_at: i64,
    pub covered_at: i64,
    pub closed_at: i64,
    pub settled_at: i64,
    /// Tokens escrowed at creation.
    pub amount: u64,
    pub lots: u64,
    pub lot_size: u64,
    pub lot_cost: u64,
    pub dust: u64,
    /// TWAP at creation (quote per base × 1e18) and the frozen fill price.
    pub twap: u128,
    pub fill_price: u128,
    pub discount_bps: u32,
    pub momentum_bps: i64,
    pub bid_epoch_secs: u32,
    /// Tenure carried by the escrowed tokens (seller's lot tenure).
    pub seller_lot_tenure: u128,
    /// Σ bid capacities (lots) — `C` in the allocation.
    pub total_capacity: u64,
    pub bid_count: u32,
    pub bid_quote_total: u64,
    pub rand_slot: u64,
    pub seed: [u8; 32],
    /// Systematic-sampling offset `U ∈ [0, C)`.
    pub random_offset: u64,
    pub shield_lots: u64,
    /// Lots allocated to bidders: min(C, lots − shield_lots).
    pub bidder_lots: u64,
    pub remainder_tokens: u64,
    pub remainder_sold: bool,
    pub proceeds: u64,
    pub fee: u64,
    pub remainder_proceeds: u64,
    pub claimed_count: u32,
    pub tokens_claimed: u64,
    /// Tokens still in escrow for this offer.
    pub escrowed: u64,
    pub message_len: u8,
    pub message: [u8; MAX_MESSAGE],
}

impl Offer {
    /// Lots available to bidders after the Shield's priority slice.
    pub fn available_lots(&self) -> u64 {
        self.lots - self.shield_lots
    }
}

#[account]
#[derive(InitSpace)]
pub struct Bid {
    pub bump: u8,
    pub kind: u8,
    pub offer: Pubkey,
    /// Wallet that receives the tokens (and tenure credit).
    pub bidder: Pubkey,
    /// Account the refund is returned to (bidder's quote ATA or chest vault).
    pub refund_to: Pubkey,
    /// Receives the bid account's rent on claim.
    pub rent_payer: Pubkey,
    /// Quote locked (= capacity × lot_cost).
    pub amount: u64,
    pub capacity: u64,
    /// Σ capacities of earlier bids (`Q_i`).
    pub prefix: u64,
    pub created_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct Ticket {
    pub bump: u8,
    pub mint: Pubkey,
    pub seller: Pubkey,
    pub offer_id: u64,
    /// Tokens that may be re-bought fee-free.
    pub amount: u64,
    pub used: u64,
    pub created_at: i64,
    pub expires_at: i64,
}
