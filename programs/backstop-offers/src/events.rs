use anchor_lang::prelude::*;

#[event]
pub struct OfferCreated {
    pub mint: Pubkey,
    pub offer: Pubkey,
    pub id: u64,
    pub seller: Pubkey,
    pub amount: u64,
    pub lots: u64,
    pub lot_size: u64,
    pub lot_cost: u64,
    pub twap: u128,
    pub fill_price: u128,
    pub discount_bps: u32,
    pub momentum_bps: i64,
    pub seller_lot_tenure: u128,
    pub created_at: i64,
    pub expires_at: i64,
    pub message: String,
}

#[event]
pub struct BidPlaced {
    pub mint: Pubkey,
    pub offer: Pubkey,
    pub bid: Pubkey,
    pub bidder: Pubkey,
    pub kind: u8,
    pub amount: u64,
    pub capacity: u64,
    pub prefix: u64,
    pub total_capacity: u64,
    pub ts: i64,
}

#[event]
pub struct BiddingClosed {
    pub mint: Pubkey,
    pub offer: Pubkey,
    pub rand_slot: u64,
    pub early: bool,
    pub ts: i64,
}

#[event]
pub struct OfferSettled {
    pub mint: Pubkey,
    pub offer: Pubkey,
    pub seller: Pubkey,
    pub shield_lots: u64,
    pub bidder_lots: u64,
    pub total_capacity: u64,
    pub random_offset: u64,
    pub seed: [u8; 32],
    pub proceeds: u64,
    pub fee: u64,
    pub seller_net: u64,
    pub remainder_tokens: u64,
    pub ticket_amount: u64,
    pub ts: i64,
}

#[event]
pub struct RemainderSold {
    pub mint: Pubkey,
    pub offer: Pubkey,
    pub tokens: u64,
    pub quote_out: u64,
    pub ts: i64,
}

#[event]
pub struct BidClaimed {
    pub mint: Pubkey,
    pub offer: Pubkey,
    pub bid: Pubkey,
    pub bidder: Pubkey,
    pub kind: u8,
    pub lots: u64,
    pub tokens: u64,
    pub cost: u64,
    pub refund: u64,
    pub tenure_credited_raw: u128,
    pub ts: i64,
}

#[event]
pub struct TicketIssued {
    pub mint: Pubkey,
    pub seller: Pubkey,
    pub offer_id: u64,
    pub amount: u64,
    pub expires_at: i64,
}

#[event]
pub struct TicketUsed {
    pub mint: Pubkey,
    pub seller: Pubkey,
    pub offer_id: u64,
    pub tokens: u64,
    pub remaining: u64,
}

#[event]
pub struct OfferClosed {
    pub mint: Pubkey,
    pub offer: Pubkey,
    pub id: u64,
}
