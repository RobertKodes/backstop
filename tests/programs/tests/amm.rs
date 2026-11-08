//! Phase 2: AMM with fee routing and the on-chain TWAP.

use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::{InstructionData, ToAccountMetas};
use anchor_spl::associated_token::get_associated_token_address_with_program_id;
use backstop_common::{defaults, ids, pda};
use backstop_math::amm::k;
use backstop_tests::market::{GenesisOpts, USDC};
use backstop_tests::*;

#[test]
fn genesis_creates_pool_with_full_supply() {
    let mut env = Env::new();
    let m = env.genesis(GenesisOpts::default());
    let p = env.pool(&m.mint);
    assert_eq!(p.base_reserve, defaults::TOTAL_SUPPLY);
    assert_eq!(p.quote_reserve, 100_000 * USDC);
    let mk = env.market(&m.mint);
    assert_eq!(mk.amm_base_vault, Env::ata(&pda::pool(&m.mint).0, &m.mint));
    assert_eq!(mk.params.trade_fee_bps, 300);
}

#[test]
fn buy_routes_fee_and_keeps_k() {
    let mut env = Env::new();
    let m = env.genesis(GenesisOpts::default());
    let user = env.trader(&m, 10_000 * USDC);
    env.register(&user, &m.mint).unwrap();
    let p0 = env.pool(&m.mint);
    let k0 = k(p0.base_reserve, p0.quote_reserve);
    env.buy(&m, &user, 1_000 * USDC).unwrap();
    let p1 = env.pool(&m.mint);
    assert!(k(p1.base_reserve, p1.quote_reserve) >= k0);
    let fee_vault = env.market(&m.mint).fee_vault;
    assert_eq!(env.token_balance(&fee_vault), 30 * USDC, "3 % fee to the core fee vault");
    let got = env.token_balance(&Env::ata(&user.pubkey(), &m.mint));
    assert_eq!(got, p0.base_reserve - p1.base_reserve);
    let h = env.holder(&m.mint, &user.pubkey()).unwrap();
    assert_eq!(h.balance, got, "tenure tracked for registered buyer");
    assert_eq!(p1.fees_collected, 30 * USDC);
}

#[test]
fn buy_respects_slippage() {
    let mut env = Env::new();
    let m = env.genesis(GenesisOpts::default());
    let user = env.trader(&m, 10_000 * USDC);
    let ix = env.buy_ix(&m, &user.pubkey(), 1_000 * USDC, u64::MAX);
    assert_fails_with(env.send(&[ix], &[&user]), "Slippage");
}

#[test]
fn direct_sell_rules() {
    let mut env = Env::new();
    let m = env.genesis(GenesisOpts::default());
    let min_offer = env.market(&m.mint).params.min_offer_size;
    let user = env.trader(&m, 50_000 * USDC);
    env.buy(&m, &user, 40_000 * USDC).unwrap();
    let bal = env.token_balance(&Env::ata(&user.pubkey(), &m.mint));
    assert!(bal > 2 * min_offer);

    // unregistered wallets cannot sell directly (per-wallet cap needs a holder)
    assert_fails_with(env.sell(&m, &user, min_offer / 10), "DirectSellRequiresHolder");
    env.register(&user, &m.mint).unwrap();

    // at or above the minimum offer size → must use the offer book
    assert_fails_with(env.sell(&m, &user, min_offer), "UseOfferBook");

    // below the minimum: works and pays the fee
    let fee_before = env.token_balance(&env.market(&m.mint).fee_vault);
    let q_before = env.usdc_balance(&user.pubkey(), &m.quote);
    env.sell(&m, &user, min_offer / 2).unwrap();
    assert!(env.usdc_balance(&user.pubkey(), &m.quote) > q_before);
    assert!(env.token_balance(&env.market(&m.mint).fee_vault) > fee_before);
    let h = env.holder(&m.mint, &user.pubkey()).unwrap();
    assert_eq!(h.acc.get(), 0, "a sell resets tenure");

    // per-wallet rolling cap (hook): another sell pushing past the cap fails
    assert_fails_with(env.sell(&m, &user, min_offer / 2 + 1), "DirectSellCapExceeded");
    // …but the window resets after 24 h
    env.warp(86_401);
    env.sell(&m, &user, min_offer / 2).unwrap();
}

#[test]
fn global_hourly_cap_on_direct_sells() {
    let mut env = Env::new();
    let mut params = backstop_core::state::MarketParams::defaults(defaults::TOTAL_SUPPLY, 6);
    params.direct_sell_hourly_cap = params.min_offer_size; // tiny global cap
    let m = env.genesis(GenesisOpts { params: Some(params), ..Default::default() });
    let min_offer = params.min_offer_size;
    let mut sellers = vec![];
    for _ in 0..3 {
        let u = env.trader(&m, 20_000 * USDC);
        env.buy(&m, &u, 15_000 * USDC).unwrap();
        env.register(&u, &m.mint).unwrap();
        sellers.push(u);
    }
    env.sell(&m, &sellers[0], min_offer * 6 / 10).unwrap();
    assert_fails_with(env.sell(&m, &sellers[1], min_offer * 6 / 10), "DirectSellHourlyCap");
    env.warp(3_601);
    env.sell(&m, &sellers[1], min_offer * 6 / 10).unwrap();
}

#[test]
fn twap_tracks_price_with_time_weighting() {
    let mut env = Env::new();
    let m = env.genesis(GenesisOpts::default());
    let user = env.trader(&m, 1_000_000 * USDC);
    let p0 = env.pool(&m.mint).oracle().last_price;
    // an hour of quiet trading
    for _ in 0..60 {
        env.warp(60);
        env.buy(&m, &user, USDC).unwrap();
    }
    let now = env.now();
    let o = env.pool(&m.mint).oracle();
    let twap_then = o.twap(now, 300, 3_000).unwrap();
    // big buy now — spot jumps but the 5-minute TWAP only partially reflects it
    env.buy(&m, &user, 100_000 * USDC).unwrap();
    env.warp(30);
    let o = env.pool(&m.mint).oracle();
    let now = env.now();
    let spot = o.last_price;
    let twap_now = o.twap(now, 300, 0).unwrap();
    assert!(spot > 3 * p0, "spot moved a lot");
    assert!(twap_now < spot / 2, "TWAP resists a fresh spike: twap {twap_now} spot {spot}");
    assert!(twap_then > 0 && twap_then <= twap_now);
}

#[test]
fn protocol_swaps_require_offers_escrow_signature() {
    let mut env = Env::new();
    let m = env.genesis(GenesisOpts::default());
    let attacker = env.trader(&m, 1_000 * USDC);
    let pool = pda::pool(&m.mint).0;
    let market = env.market(&m.mint);
    let ix = Instruction::new_with_bytes(
        ids::AMM,
        &backstop_amm::instruction::BuyWithTicket { quote_in: 100 * USDC, min_base_out: 0, max_base_out: u64::MAX }.data(),
        backstop_amm::accounts::ProtocolSwap {
            escrow_authority: attacker.pubkey(),
            trader: attacker.pubkey(),
            market: pda::market(&m.mint).0,
            pool,
            mint: m.mint,
            quote_mint: m.quote,
            base_vault: Env::ata(&pool, &m.mint),
            quote_vault: get_associated_token_address_with_program_id(&pool, &m.quote, &ids::TOKEN),
            fee_vault: market.fee_vault,
            source: get_associated_token_address_with_program_id(&attacker.pubkey(), &m.quote, &ids::TOKEN),
            destination: Env::ata(&attacker.pubkey(), &m.mint),
            source_authority: attacker.pubkey(),
            base_token_program: ids::TOKEN_2022,
            quote_token_program: ids::TOKEN,
        }
        .to_account_metas(None),
    );
    assert_fails_with(env.send(&[ix], &[&attacker]), "Unauthorized");
}

#[test]
fn round_trip_costs_fees_and_k_monotone() {
    let mut env = Env::new();
    let m = env.genesis(GenesisOpts::default());
    let user = env.trader(&m, 100_000 * USDC);
    env.register(&user, &m.mint).unwrap();
    let min_offer = env.market(&m.mint).params.min_offer_size;
    let mut last_k = {
        let p = env.pool(&m.mint);
        k(p.base_reserve, p.quote_reserve)
    };
    for i in 0..10 {
        env.warp(3_700);
        env.warp(86_401);
        if i % 2 == 0 {
            env.buy(&m, &user, 500 * USDC).unwrap();
        } else {
            env.sell(&m, &user, min_offer / 3).unwrap();
        }
        let p = env.pool(&m.mint);
        let kk = k(p.base_reserve, p.quote_reserve);
        assert!(kk >= last_k);
        last_k = kk;
    }
    let p = env.pool(&m.mint);
    let vault_q = env.token_balance(&get_associated_token_address_with_program_id(&pda::pool(&m.mint).0, &m.quote, &ids::TOKEN));
    assert_eq!(vault_q, p.quote_reserve, "quote vault == tracked reserve");
    assert_eq!(env.token_balance(&Env::ata(&pda::pool(&m.mint).0, &m.mint)), p.base_reserve);
    let _ = Pubkey::default();
}
