//! Phase 3: offer book lifecycle — creation, escrow, bids, randomised
//! settlement, remainder routing, claims, tenure transfer, Return Tickets.

#![allow(clippy::result_large_err, clippy::manual_range_contains)] // test-only

use backstop_common::pda;
use backstop_math::allocation::allocate;
use backstop_tests::flows::usdc_ata;
use backstop_tests::market::{GenesisOpts, Mkt, TOKEN, USDC};
use backstop_tests::*;

const DAY: i64 = 86_400;

/// A registered seller holding `tokens` bought from the AMM, aged `age` secs.
fn seller(env: &mut Env, m: &Mkt, usdc: u64, age: i64) -> Keypair {
    let s = env.trader(m, usdc);
    env.register(&s, &m.mint).unwrap();
    env.buy(m, &s, usdc).unwrap();
    env.warp(age);
    s
}

fn bidder(env: &mut Env, m: &Mkt, usdc: u64) -> Keypair {
    let b = env.trader(m, usdc);
    env.register(&b, &m.mint).unwrap();
    b
}

fn token_bal(env: &Env, owner: &Keypair, m: &Mkt) -> u64 {
    env.token_balance(&Env::ata(&owner.pubkey(), &m.mint))
}

#[test]
fn oversubscribed_offer_full_lifecycle() {
    let mut env = Env::new();
    let m = env.full_genesis(GenesisOpts::default());
    let s = seller(&mut env, &m, 1_000 * USDC, 10 * DAY);
    let amount = 5_000_000 * TOKEN; // 0.5 % of supply
    let tenure_before = env
        .holder(&m.mint, &s.pubkey())
        .unwrap()
        .tenure()
        .tenure_at(env.now())
        .unwrap();
    let seller_q0 = env.usdc_balance(&s.pubkey(), &m.quote);
    let id = env.create_offer(&m, &s, amount).expect("create offer");
    let o = env.offer(&m.mint, id);
    assert_eq!(o.amount, amount);
    assert_eq!(o.lots, 100);
    assert_eq!(o.discount_bps, 500, "flat market → base discount");
    assert!(o.fill_price < o.twap);
    assert_eq!(
        env.holder(&m.mint, &s.pubkey()).unwrap().acc.get(),
        0,
        "offer escrow resets seller tenure"
    );
    assert!(o.seller_lot_tenure > 0 && o.seller_lot_tenure <= tenure_before);
    assert_eq!(env.book(&m.mint).total_escrowed, amount);

    // three bidders, 120 lots of demand for 100 lots
    let caps = [30u64, 50, 40];
    let bidders: Vec<Keypair> = caps
        .iter()
        .map(|_| bidder(&mut env, &m, 1_000 * USDC))
        .collect();
    for (b, c) in bidders.iter().zip(caps) {
        env.wallet_bid(&m, id, b, c * o.lot_cost + o.lot_cost / 2)
            .unwrap();
    }
    let o = env.offer(&m.mint, id);
    assert_eq!(o.total_capacity, 120);
    assert_eq!(
        o.bid_quote_total,
        120 * o.lot_cost,
        "only whole lots are locked"
    );

    // seller cannot bid on own offer
    let ix = env.wallet_bid_ix(&m, id, &s.pubkey(), 10 * o.lot_cost);
    assert_fails_with(env.send(&[ix], &[&s]), "SelfBid");

    let fee_before = env.token_balance(&env.market(&m.mint).fee_vault);
    env.finish_offer(&m, id);
    let o = env.offer(&m.mint, id);
    assert_eq!(o.shield_lots, 0);
    assert_eq!(o.bidder_lots, 100);
    assert!(o.remainder_sold && o.remainder_tokens == o.dust);
    let proceeds = 100 * o.lot_cost;
    assert_eq!(o.proceeds, proceeds);
    assert_eq!(
        o.fee,
        backstop_math::fees::fee_ceil(proceeds, 300).unwrap(),
        "fee = ceil(3 % of proceeds)"
    );
    // fee vault receives the offer fee (plus the tiny fee on the dust remainder sale)
    assert!(env.token_balance(&env.market(&m.mint).fee_vault) - fee_before >= o.fee);
    assert!(
        env.usdc_balance(&s.pubkey(), &m.quote) - seller_q0 >= proceeds - o.fee,
        "seller paid at ≥ fill price minus fee"
    );

    // claims: allocations are exact, within one lot of pro-rata, and sum to 100
    let mut total_lots = 0;
    let mut q = 0;
    for (b, c) in bidders.iter().zip(caps) {
        let usdc0 = env.usdc_balance(&b.pubkey(), &m.quote);
        let acc0 = env.holder(&m.mint, &b.pubkey()).unwrap().acc.get();
        env.claim_wallet_bid(&m, id, &b.pubkey()).unwrap();
        let expect = allocate(q, c, 120, 100, o.random_offset).unwrap();
        q += c;
        let got = token_bal(&env, b, &m) / o.lot_size;
        assert_eq!(got, expect);
        assert!((got as f64 - c as f64 * 100.0 / 120.0).abs() < 1.0);
        assert_eq!(
            env.usdc_balance(&b.pubkey(), &m.quote) - usdc0,
            (c - got) * o.lot_cost,
            "refund of unfilled lots"
        );
        let h = env.holder(&m.mint, &b.pubkey()).unwrap();
        let credited = h.acc.get() - acc0;
        let expected =
            o.seller_lot_tenure * (got * o.lot_size) as u128 / amount as u128 * 4_000 / 10_000;
        assert!(
            credited.abs_diff(expected) <= 1,
            "40 % tenure transfer: {credited} vs {expected}"
        );
        total_lots += got;
    }
    assert_eq!(total_lots, 100);
    assert_eq!(env.book(&m.mint).total_escrowed, 0);
    assert_eq!(
        env.token_balance(&Env::ata(&pda::book(&m.mint).0, &m.mint)),
        0,
        "escrow invariant"
    );

    // Return Ticket: fee-free re-buy up to the absorbed amount
    let t = env.ticket(&m, &s.pubkey(), id);
    assert_eq!(t.amount, 100 * o.lot_size);
    let fee0 = env.token_balance(&env.market(&m.mint).fee_vault);
    let ix = env.ticket_buy_ix(&m, &s.pubkey(), id, 10 * USDC);
    env.send_ok(&[ix], &[&s]);
    assert_eq!(
        env.token_balance(&env.market(&m.mint).fee_vault),
        fee0,
        "0 % fee on ticket re-buy"
    );
    assert!(env.ticket(&m, &s.pubkey(), id).used > 0);
    // a purchase beyond the remaining allowance is rejected
    let ix = env.ticket_buy_ix(&m, &s.pubkey(), id, 500_000 * USDC);
    assert_fails_with(env.send(&[ix], &[&s]), "TicketExceeded");
}

#[test]
fn undersubscribed_offer_routes_remainder_to_amm() {
    let mut env = Env::new();
    let m = env.full_genesis(GenesisOpts::default());
    let s = seller(&mut env, &m, 1_000 * USDC, DAY);
    let amount = 2_000_000 * TOKEN;
    let id = env.create_offer(&m, &s, amount).unwrap();
    let o = env.offer(&m.mint, id);
    let b = bidder(&mut env, &m, 1_000 * USDC);
    env.wallet_bid(&m, id, &b, 25 * o.lot_cost).unwrap();
    let pool0 = env.pool(&m.mint).base_reserve;
    let q0 = env.usdc_balance(&s.pubkey(), &m.quote);
    env.finish_offer(&m, id);
    let o = env.offer(&m.mint, id);
    assert_eq!(o.bidder_lots, 25);
    assert_eq!(o.remainder_tokens, 75 * o.lot_size + o.dust);
    assert_eq!(
        env.pool(&m.mint).base_reserve - pool0,
        o.remainder_tokens,
        "remainder sold into the AMM"
    );
    assert!(o.remainder_proceeds > 0);
    assert_eq!(
        env.usdc_balance(&s.pubkey(), &m.quote) - q0,
        o.proceeds - o.fee + o.remainder_proceeds
    );
    env.claim_wallet_bid(&m, id, &b.pubkey()).unwrap();
    assert_eq!(token_bal(&env, &b, &m), 25 * o.lot_size);
    assert_eq!(
        env.ticket(&m, &s.pubkey(), id).amount,
        25 * o.lot_size,
        "ticket only covers absorbed tokens"
    );
}

#[test]
fn early_close_after_coverage_epoch() {
    let mut env = Env::new();
    let m = env.full_genesis(GenesisOpts::default());
    let s = seller(&mut env, &m, 1_000 * USDC, DAY);
    let id = env.create_offer(&m, &s, 1_000_000 * TOKEN).unwrap();
    let o = env.offer(&m.mint, id);
    let b = bidder(&mut env, &m, 1_000 * USDC);
    env.warp(10);
    env.wallet_bid(&m, id, &b, 100 * o.lot_cost).unwrap();
    // still inside the bid epoch in which coverage happened
    assert_fails_with(env.close_bidding(&m, id), "CannotCloseYet");
    env.warp(60);
    env.close_bidding(&m, id).unwrap();
    assert!(
        env.now() < o.expires_at,
        "closed before the 10-minute window ended"
    );
    // no bids after close
    let late = bidder(&mut env, &m, 100 * USDC);
    assert_fails_with(env.wallet_bid(&m, id, &late, 5 * o.lot_cost), "NotOpen");
}

#[test]
fn offer_rules() {
    let mut env = Env::new();
    let m = env.full_genesis(GenesisOpts::default());
    let s = seller(&mut env, &m, 1_000 * USDC, DAY);
    let min = env.market(&m.mint).params.min_offer_size;
    assert!(env
        .create_offer(&m, &s, min - 1)
        .unwrap_err()
        .contains("BelowMinimumOffer"));
    // messages are capped at 140 bytes
    let (ix, _) = env.create_offer_ix(&m, &s.pubkey(), min, &[b'x'; 141]);
    assert_fails_with(env.send(&[ix], &[&s]), "MessageTooLong");
    // unregistered sellers cannot create offers
    let u = env.trader(&m, 100 * USDC);
    env.buy(&m, &u, 50 * USDC).unwrap();
    let (ix, _) = env.create_offer_ix(&m, &u.pubkey(), min, b"");
    assert!(env.send(&[ix], &[&u]).is_err());
    // guardian pause blocks new offers only
    let g = m.guardian.insecure_clone();
    let ix = anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
        backstop_common::ids::CORE,
        &anchor_lang::InstructionData::data(&backstop_core::instruction::SetPauses { pauses: 1 }),
        anchor_lang::ToAccountMetas::to_account_metas(
            &backstop_core::accounts::SetPauses {
                signer: g.pubkey(),
                market: pda::market(&m.mint).0,
            },
            None,
        ),
    );
    env.send_ok(&[ix], &[&g]);
    assert!(env
        .create_offer(&m, &s, min)
        .unwrap_err()
        .contains("OffersPaused"));
    // buys still work while offers are paused
    let x = env.trader(&m, 10 * USDC);
    env.buy(&m, &x, 5 * USDC).unwrap();
}

#[test]
fn linked_wallet_cannot_absorb() {
    let mut env = Env::new();
    let m = env.full_genesis(GenesisOpts::default());
    let s = seller(&mut env, &m, 1_000 * USDC, DAY);
    let friend = bidder(&mut env, &m, 1_000 * USDC);
    env.buy(&m, &friend, 10 * USDC).unwrap();
    // friend funds the seller with a direct transfer, then tries to absorb
    env.transfer(&m.mint, &friend, &s.pubkey(), 50_000 * TOKEN)
        .unwrap();
    let id = env.create_offer(&m, &s, 1_000_000 * TOKEN).unwrap();
    let o = env.offer(&m.mint, id);
    assert_fails_with(
        env.wallet_bid(&m, id, &friend, 10 * o.lot_cost),
        "LinkedWallet",
    );
    // after the 24 h window the link expires… but the offer window is 10 min,
    // so test on a fresh offer a day later
    env.finish_offer(&m, id);
    env.warp(DAY + 1);
    let id2 = env.create_offer(&m, &s, 1_000_000 * TOKEN).unwrap();
    let o2 = env.offer(&m.mint, id2);
    env.wallet_bid(&m, id2, &friend, 10 * o2.lot_cost).unwrap();
}

#[test]
fn randomness_slot_must_be_revealed() {
    let mut env = Env::new();
    let m = env.full_genesis(GenesisOpts::default());
    let s = seller(&mut env, &m, 1_000 * USDC, DAY);
    let id = env.create_offer(&m, &s, 1_000_000 * TOKEN).unwrap();
    let o = env.offer(&m.mint, id);
    env.warp(o.expires_at - env.now());
    env.close_bidding(&m, id).unwrap();
    // settling in the same slot window (before rand_slot) fails
    let ix = env.settle_ix(&m, id);
    assert_fails_with(env.send(&[ix], &[]), "RandomnessPending");
    env.reveal_randomness(&m, id, 1);
    let ix = env.settle_ix(&m, id);
    env.send_ok(&[ix], &[]);
    let _ = usdc_ata;
}
