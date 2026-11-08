//! Phases 4–6: chests (deposit, lock, penalty, harvest), tenure-weighted fee
//! distribution, Auto-Absorb grants, Shield priority absorption, idle yield.

#![allow(clippy::result_large_err, clippy::manual_range_contains)] // test-only

use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::{InstructionData, ToAccountMetas};
use backstop_chest::instructions::GrantArgs;
use backstop_common::{ids, pda};
use backstop_tests::flows::{usdc_ata, SYSTEM};
use backstop_tests::market::{GenesisOpts, Mkt, TOKEN, USDC};
use backstop_tests::*;

const DAY: i64 = 86_400;

fn member(env: &mut Env, m: &Mkt, usdc: u64, buy: u64) -> Keypair {
    let w = env.trader(m, usdc);
    env.register(&w, &m.mint).unwrap();
    if buy > 0 {
        env.buy(m, &w, buy).unwrap();
    }
    env.open_chest(m, &w.pubkey());
    w
}

fn assert_chest_invariants(env: &Env, m: &Mkt, members: &[&Keypair]) {
    let cm = env.chest_market(&m.mint);
    let vault = env.token_balance(&usdc_ata(&pda::chest_market(&m.mint).0, &m.quote));
    assert_eq!(vault, cm.idle_assets, "idle vault == tracked idle assets");
    let shares: u64 = members
        .iter()
        .map(|w| env.chest(&m.mint, &w.pubkey()).shares)
        .sum();
    assert_eq!(shares, cm.total_shares, "Σ chest shares == total shares");
    let bal: u64 = members
        .iter()
        .map(|w| env.chest_balance(&m.mint, &w.pubkey()))
        .sum();
    assert!(
        bal <= cm.total_assets(),
        "chests never claim more than the pool holds"
    );
    assert!(
        cm.total_assets() - bal <= members.len() as u64 + 1,
        "rounding ≤ 1 unit per chest"
    );
}

#[test]
fn deposit_lock_and_early_withdraw_penalty() {
    let mut env = Env::new();
    let m = env.full_genesis(GenesisOpts::default());
    let a = member(&mut env, &m, 2_000 * USDC, 0);
    env.chest_deposit(&m, &a, 1_000 * USDC).unwrap();
    let c = env.chest(&m.mint, &a.pubkey());
    assert_eq!(c.lock_until, env.now() + 60 * DAY);
    assert_eq!(env.chest_balance(&m.mint, &a.pubkey()), 1_000 * USDC);
    let q0 = env.usdc_balance(&a.pubkey(), &m.quote);
    env.chest_withdraw(&m, &a, 100 * USDC).unwrap();
    assert_eq!(
        env.usdc_balance(&a.pubkey(), &m.quote) - q0,
        75 * USDC,
        "25 % early penalty"
    );
    assert_eq!(
        env.token_balance(&pda::shield_rewards_vault(&m.mint).0),
        25 * USDC,
        "penalty → Shield rewards"
    );
    env.warp(60 * DAY);
    let q1 = env.usdc_balance(&a.pubkey(), &m.quote);
    env.chest_withdraw(&m, &a, 100 * USDC).unwrap();
    assert_eq!(
        env.usdc_balance(&a.pubkey(), &m.quote) - q1,
        100 * USDC,
        "no penalty after the lock"
    );
    // cannot withdraw more than the chest holds
    assert!(env.chest_withdraw(&m, &a, 10_000 * USDC).is_err());
    assert_chest_invariants(&env, &m, &[&a]);
}

#[test]
fn fees_reach_chests_by_tenure_weight() {
    let mut env = Env::new();
    let m = env.full_genesis(GenesisOpts::default());
    let old = member(&mut env, &m, 10_000 * USDC, 1_000 * USDC);
    env.warp(100 * DAY); // 3.0× multiplier
    let newer = member(&mut env, &m, 10_000 * USDC, 1_000 * USDC);
    // generate fees with some trading
    let trader = env.trader(&m, 100_000 * USDC);
    for _ in 0..5 {
        env.buy(&m, &trader, 5_000 * USDC).unwrap();
    }
    let fees = env.token_balance(&env.market(&m.mint).fee_vault);
    assert!(fees > 0);
    let ix = env.distribute_fees_ix(&m);
    env.send_ok(&[ix], &[]);
    let mk = env.market(&m.mint);
    assert_eq!(mk.fees.distributed, fees);
    assert_eq!(
        mk.fees.distributed,
        mk.fees.to_chests + mk.fees.to_shield + mk.fees.to_treasury + mk.fees.to_parent
    );
    assert_eq!(mk.fees.to_chests, fees * 7 / 10);
    assert_eq!(
        env.token_balance(&mk.holder_rewards_vault),
        mk.fees.to_chests
    );

    // weights at the next boundary decide the split
    let rs = env.reward_state(&m.mint);
    let k = rs.last_epoch + 1;
    let wo = env
        .holder(&m.mint, &old.pubkey())
        .unwrap()
        .weight()
        .weight_at(k)
        .unwrap();
    let wn = env
        .holder(&m.mint, &newer.pubkey())
        .unwrap()
        .weight()
        .weight_at(k)
        .unwrap();
    env.warp(6 * 3_600);
    for w in [&old, &newer] {
        let ix = env.harvest_ix(&m, &w.pubkey());
        env.crank_epochs_if_needed(&m.mint);
        env.send_ok(&[ix], &[w]);
    }
    let ho = env.chest(&m.mint, &old.pubkey()).harvested;
    let hn = env.chest(&m.mint, &newer.pubkey()).harvested;
    assert!(ho + hn <= mk.fees.to_chests);
    assert!(
        ho + hn + 2 >= mk.fees.to_chests,
        "all holder rewards distributed (minus rounding)"
    );
    let ratio = ho as f64 / hn as f64;
    let expect = wo as f64 / wn as f64;
    assert!(
        (ratio - expect).abs() / expect < 1e-3,
        "split follows tenure weights: {ratio} vs {expect}"
    );
    assert!(expect > 2.0, "the 100-day holder earns ~3× per token");
    // a harvest is a deposit event: the lock restarted
    assert_eq!(
        env.chest(&m.mint, &old.pubkey()).lock_until,
        env.now() + 60 * DAY
    );
    assert_chest_invariants(&env, &m, &[&old, &newer]);
}

fn grant(
    max_per_offer: u64,
    max_per_day: u64,
    min_discount_bps: u32,
    reserve_floor: u64,
) -> GrantArgs {
    GrantArgs {
        enabled: true,
        max_per_offer,
        max_per_day,
        min_discount_bps,
        reserve_floor,
        keeper: Pubkey::default(),
    }
}

#[test]
fn auto_absorb_respects_grant_limits() {
    let mut env = Env::new();
    let m = env.full_genesis(GenesisOpts::default());
    let a = member(&mut env, &m, 2_000 * USDC, 0);
    env.chest_deposit(&m, &a, 1_000 * USDC).unwrap();
    let keeper = m.keeper.insecure_clone();
    let s = member(&mut env, &m, 2_000 * USDC, 1_000 * USDC);
    env.warp(DAY);
    let id = env.create_offer(&m, &s, 3_000_000 * TOKEN).unwrap();
    let lot = env.offer(&m.mint, id).lot_cost;

    // no grant yet
    let ix = env.chest_bid_ix(&m, id, &a.pubkey(), &keeper.pubkey(), 10 * lot, true);
    assert_fails_with(env.send(&[ix], &[&keeper]), "GrantDisabled");

    env.set_grant(&m, &a, grant(20 * lot, 30 * lot, 400, 100 * USDC));
    let over = env.chest_bid_ix(&m, id, &a.pubkey(), &keeper.pubkey(), 21 * lot, true);
    assert_fails_with(env.send(&[over], &[&keeper]), "GrantLimit");
    let ok = env.chest_bid_ix(&m, id, &a.pubkey(), &keeper.pubkey(), 20 * lot, true);
    env.send_ok(&[ok], &[&keeper]);
    assert_eq!(env.chest(&m.mint, &a.pubkey()).day_spent, 20 * lot);

    // per-day limit on a second offer
    let id2 = env.create_offer(&m, &s, 3_000_000 * TOKEN).unwrap();
    let day = env.chest_bid_ix(&m, id2, &a.pubkey(), &keeper.pubkey(), 15 * lot, true);
    assert_fails_with(env.send(&[day], &[&keeper]), "GrantLimit");
    // minimum discount
    env.set_grant(&m, &a, grant(20 * lot, 1_000 * lot, 600, 100 * USDC));
    let disc = env.chest_bid_ix(&m, id2, &a.pubkey(), &keeper.pubkey(), 5 * lot, true);
    assert_fails_with(env.send(&[disc], &[&keeper]), "DiscountTooLow");
    // reserve floor
    env.set_grant(&m, &a, grant(1_000 * USDC, 10_000 * USDC, 0, 990 * USDC));
    let floor = env.chest_bid_ix(&m, id2, &a.pubkey(), &keeper.pubkey(), 20 * lot, true);
    assert_fails_with(env.send(&[floor], &[&keeper]), "ReserveFloor");
    // emergency pause of Auto-Absorb (guardian)
    env.set_grant(&m, &a, grant(1_000 * USDC, 10_000 * USDC, 0, 0));
    let g = m.guardian.insecure_clone();
    let pause = Instruction::new_with_bytes(
        ids::CORE,
        &backstop_core::instruction::SetPauses { pauses: 2 }.data(),
        backstop_core::accounts::SetPauses {
            signer: g.pubkey(),
            market: pda::market(&m.mint).0,
        }
        .to_account_metas(None),
    );
    env.send_ok(&[pause], &[&g]);
    let paused = env.chest_bid_ix(&m, id2, &a.pubkey(), &keeper.pubkey(), 5 * lot, true);
    assert_fails_with(env.send(&[paused], &[&keeper]), "AutoAbsorbPaused");
    // the owner can still bid manually from the chest
    let manual = env.chest_bid_ix(&m, id2, &a.pubkey(), &a.pubkey(), 5 * lot, false);
    env.send_ok(&[manual], &[&a]);

    // settle the first offer and claim through the chest program
    env.finish_offer(&m, id);
    let before = env.chest_balance(&m.mint, &a.pubkey());
    let ix = env.chest_claim_ix(&m, id, &a.pubkey(), 2, &keeper.pubkey());
    env.send_ok(&[ix], &[]);
    let o = env.offer(&m.mint, id);
    assert_eq!(
        env.token_balance(&Env::ata(&a.pubkey(), &m.mint)),
        20 * o.lot_size,
        "undersubscribed → full fill"
    );
    assert_eq!(
        env.chest_balance(&m.mint, &a.pubkey()),
        before,
        "no refund when fully filled"
    );
    assert_chest_invariants(&env, &m, &[&a, &s]);
}

#[test]
fn shield_takes_priority_slice_and_shares_gains() {
    let mut env = Env::new();
    let gov = env.governance.insecure_clone();
    let m = env.full_genesis(GenesisOpts::default());
    let p = member(&mut env, &m, 10_000 * USDC, 0);
    env.chest_deposit(&m, &p, 5_000 * USDC).unwrap();
    // lock 4 000 USDC in the Shield for 60 days (2× multiplier)
    let ix = env.shield_deposit_ix(&m, &p.pubkey(), 4_000 * USDC, 60 * DAY as u32, 0);
    env.send_ok(&[ix], &[&p]);
    assert_eq!(env.shield_state(&m.mint).pool.total_deposits, 4_000 * USDC);
    // lift the per-offer cap so the 50 % share limit binds
    let ix = Instruction::new_with_bytes(
        ids::CORE,
        &backstop_core::instruction::SetParam {
            param: backstop_core::state::ParamId::ShieldPerOfferCap,
            value: 1_000_000 * USDC,
        }
        .data(),
        backstop_core::accounts::Govern {
            governance: gov.pubkey(),
            market: pda::market(&m.mint).0,
        }
        .to_account_metas(None),
    );
    env.send_ok(&[ix], &[&gov]);

    let s = member(&mut env, &m, 5_000 * USDC, 2_000 * USDC);
    env.warp(DAY);
    let id = env.create_offer(&m, &s, 4_000_000 * TOKEN).unwrap();
    let o = env.offer(&m.mint, id);
    let b = member(&mut env, &m, 5_000 * USDC, 0);
    env.wallet_bid(&m, id, &b, 100 * o.lot_cost).unwrap();
    env.finish_offer(&m, id);
    let o = env.offer(&m.mint, id);
    assert_eq!(o.shield_lots, 50, "Shield priority slice = 50 % of lots");
    assert_eq!(o.bidder_lots, 50);
    let sh = env.shield_state(&m.mint);
    assert_eq!(sh.absorbed_tokens, 50 * o.lot_size);
    assert_eq!(
        env.token_balance(&Env::ata(&pda::shield(&m.mint).0, &m.mint)),
        50 * o.lot_size
    );
    assert_eq!(sh.pool.total_deposits, 4_000 * USDC - 50 * o.lot_cost);

    // fee rewards (10 % stream) reach the Shield and are claimable
    let ix = env.distribute_fees_ix(&m);
    env.send_ok(&[ix], &[]);
    let rewards = env.token_balance(&pda::shield_rewards_vault(&m.mint).0);
    assert!(rewards > 0);
    let chest0 = env.chest_balance(&m.mint, &p.pubkey());
    let ix = env.shield_claim_ix(&m, &p.pubkey(), 0, false);
    env.send_ok(&[ix], &[&p]);
    let got_tokens = env.token_balance(&Env::ata(&p.pubkey(), &m.mint));
    assert!(
        got_tokens + 1 >= 50 * o.lot_size && got_tokens <= 50 * o.lot_size,
        "absorbed tokens to the depositor"
    );
    let gained = env.chest_balance(&m.mint, &p.pubkey()) - chest0;
    assert!(
        gained + 2 >= rewards && gained <= rewards,
        "Shield rewards to the depositor's chest"
    );

    // principal is locked for 60 days
    let ix = env.shield_claim_ix(&m, &p.pubkey(), 0, true);
    assert_fails_with(env.send(&[ix], &[&p]), "StillLocked");
    env.warp(60 * DAY);
    let c1 = env.chest_balance(&m.mint, &p.pubkey());
    let ix = env.shield_claim_ix(&m, &p.pubkey(), 0, true);
    env.send_ok(&[ix], &[&p]);
    let back = env.chest_balance(&m.mint, &p.pubkey()) - c1;
    let expect = 4_000 * USDC - 50 * o.lot_cost;
    assert!(
        back + 2 >= expect && back <= expect,
        "compounded principal returned: {back} vs {expect}"
    );
    assert!(
        !env.exists(&pda::shield_position(&m.mint, &p.pubkey(), 0).0),
        "position closed"
    );
    let _ = SYSTEM;
}

#[test]
fn idle_yield_via_adapter_accrues_pro_rata() {
    let mut env = Env::new();
    let gov = env.governance.insecure_clone();
    let m = env.full_genesis(GenesisOpts::default());
    let a = member(&mut env, &m, 20_000 * USDC, 0);
    let b = member(&mut env, &m, 20_000 * USDC, 0);
    env.chest_deposit(&m, &a, 6_000 * USDC).unwrap();
    env.chest_deposit(&m, &b, 4_000 * USDC).unwrap();

    // mock lending pool at 10 % APR, funded for interest
    let pool = Pubkey::find_program_address(
        &[mock_lending::POOL_SEED, m.quote.as_ref()],
        &ids::MOCK_LENDING,
    )
    .0;
    let cm = pda::chest_market(&m.mint).0;
    let deposit = Pubkey::find_program_address(
        &[mock_lending::DEPOSIT_SEED, pool.as_ref(), cm.as_ref()],
        &ids::MOCK_LENDING,
    )
    .0;
    let lend_vault = usdc_ata(&pool, &m.quote);
    let ix = Instruction::new_with_bytes(
        ids::MOCK_LENDING,
        &mock_lending::instruction::InitPool { apr_bps: 1_000 }.data(),
        mock_lending::accounts::InitPool {
            admin: gov.pubkey(),
            mint: m.quote,
            pool,
            vault: lend_vault,
            token_program: ids::TOKEN,
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: SYSTEM,
        }
        .to_account_metas(None),
    );
    env.send_ok(&[ix], &[&gov]);
    let funder = env.trader(&m, 5_000 * USDC);
    let ix = Instruction::new_with_bytes(
        ids::MOCK_LENDING,
        &mock_lending::instruction::Fund {
            amount: 5_000 * USDC,
        }
        .data(),
        mock_lending::accounts::Fund {
            funder: funder.pubkey(),
            pool,
            mint: m.quote,
            vault: lend_vault,
            funder_token: usdc_ata(&funder.pubkey(), &m.quote),
            token_program: ids::TOKEN,
        }
        .to_account_metas(None),
    );
    env.send_ok(&[ix], &[&funder]);
    let ix = Instruction::new_with_bytes(
        ids::MOCK_LENDING,
        &mock_lending::instruction::InitDeposit {}.data(),
        mock_lending::accounts::InitDeposit {
            payer: env.payer.pubkey(),
            owner: cm,
            pool,
            deposit,
            system_program: SYSTEM,
        }
        .to_account_metas(None),
    );
    env.send_ok(&[ix], &[]);
    let ix = Instruction::new_with_bytes(
        ids::CHEST,
        &backstop_chest::instruction::SetAdapter {
            kind: 1,
            program: ids::MOCK_LENDING,
            pool,
            position: deposit,
        }
        .data(),
        backstop_chest::accounts::SetAdapter {
            governance: gov.pubkey(),
            market: pda::market(&m.mint).0,
            chest_market: cm,
        }
        .to_account_metas(None),
    );
    env.send_ok(&[ix], &[&gov]);

    let rebalance = |env: &Env| {
        let mut metas = backstop_chest::accounts::Rebalance {
            cranker: env.payer.pubkey(),
            market: pda::market(&m.mint).0,
            chest_market: cm,
            quote_mint: m.quote,
            vault: usdc_ata(&cm, &m.quote),
            quote_token_program: ids::TOKEN,
        }
        .to_account_metas(None);
        metas.extend([
            AccountMeta::new_readonly(ids::MOCK_LENDING, false),
            AccountMeta::new(pool, false),
            AccountMeta::new(deposit, false),
            AccountMeta::new(lend_vault, false),
        ]);
        Instruction::new_with_bytes(
            ids::CHEST,
            &backstop_chest::instruction::Rebalance {}.data(),
            metas,
        )
    };
    env.send_ok(&[rebalance(&env)], &[]);
    let st = env.chest_market(&m.mint);
    assert_eq!(st.idle_assets, 2_000 * USDC, "20 % buffer stays liquid");
    assert_eq!(st.deployed_principal, 8_000 * USDC);
    assert_chest_invariants(&env, &m, &[&a, &b]);

    env.warp(365 * DAY);
    env.send_ok(&[rebalance(&env)], &[]);
    let st = env.chest_market(&m.mint);
    let total = st.total_assets();
    assert!(
        total >= 10_790 * USDC && total <= 10_810 * USDC,
        "≈ 10 % on the deployed 80 %: {total}"
    );
    let ba = env.chest_balance(&m.mint, &a.pubkey());
    let bb = env.chest_balance(&m.mint, &b.pubkey());
    assert!(
        (ba as f64 / bb as f64 - 1.5).abs() < 1e-6,
        "variable yield accrues pro-rata to balance"
    );
    assert_chest_invariants(&env, &m, &[&a, &b]);

    // withdrawing more than the idle buffer needs an unwind first
    assert_fails_with(
        env.chest_withdraw(&m, &a, 5_000 * USDC),
        "InsufficientLiquidity",
    );
    let mut unwind = rebalance(&env);
    unwind.data = backstop_chest::instruction::Unwind {
        amount: 4_000 * USDC,
    }
    .data();
    env.send_ok(&[unwind], &[]);
    env.chest_withdraw(&m, &a, 5_000 * USDC).unwrap();
    assert_chest_invariants(&env, &m, &[&a, &b]);
}
