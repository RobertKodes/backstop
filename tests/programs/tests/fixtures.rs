//! Dumps real transaction logs from a mini lifecycle so the TypeScript
//! indexer is tested against genuine program output.
//! Regenerate: `BACKSTOP_WRITE_FIXTURES=1 cargo test -p backstop-tests --test fixtures`.

#![allow(clippy::result_large_err)] // test-only

use backstop_tests::market::{GenesisOpts, TOKEN, USDC};
use backstop_tests::*;

#[test]
fn lifecycle_logs_fixture() {
    let mut env = Env::new();
    let m = env.full_genesis(GenesisOpts::default());
    let mut txs: Vec<(String, u64, Vec<String>)> = vec![];
    let mut rec = |env: &Env, meta: litesvm::types::TransactionMetadata| {
        txs.push((meta.signature.to_string(), env.svm.get_sysvar::<anchor_lang::prelude::Clock>().slot, meta.logs));
    };

    let seller = env.trader(&m, 2_000 * USDC);
    let ix = env.register_ix(&seller.pubkey(), &m.mint, &[Env::ata(&seller.pubkey(), &m.mint)]);
    let meta = env.send_ok(&[ix], &[&seller]);
    rec(&env, meta);
    let meta = env.send_ok(&[env.buy_ix(&m, &seller.pubkey(), 1_000 * USDC, 0)], &[&seller]);
    rec(&env, meta);
    env.warp(86_400);

    let bidder = env.trader(&m, 2_000 * USDC);
    env.register(&bidder, &m.mint).unwrap();
    env.open_chest(&m, &bidder.pubkey());
    let ix = anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
        backstop_common::ids::CHEST,
        &anchor_lang::InstructionData::data(&backstop_chest::instruction::Deposit { amount: 500 * USDC }),
        anchor_lang::ToAccountMetas::to_account_metas(
            &backstop_chest::accounts::ChestTransfer {
                owner: bidder.pubkey(),
                market: backstop_common::pda::market(&m.mint).0,
                chest_market: backstop_common::pda::chest_market(&m.mint).0,
                chest: backstop_common::pda::chest(&m.mint, &bidder.pubkey()).0,
                quote_mint: m.quote,
                vault: backstop_tests::flows::usdc_ata(&backstop_common::pda::chest_market(&m.mint).0, &m.quote),
                owner_quote: backstop_tests::flows::usdc_ata(&bidder.pubkey(), &m.quote),
                shield_rewards_vault: backstop_common::pda::shield_rewards_vault(&m.mint).0,
                quote_token_program: backstop_common::ids::TOKEN,
            },
            None,
        ),
    );
    let meta = env.send_ok(&[ix], &[&bidder]);
    rec(&env, meta);

    let (ix, id) = env.create_offer_ix(&m, &seller.pubkey(), 2_000_000 * TOKEN, b"first offer");
    let meta = env.send_ok(&[ix], &[&seller]);
    rec(&env, meta);
    let o = env.offer(&m.mint, id);
    let meta = env.send_ok(&[env.wallet_bid_ix(&m, id, &bidder.pubkey(), 40 * o.lot_cost)], &[&bidder]);
    rec(&env, meta);
    let meta = env.send_ok(&[env.chest_bid_ix(&m, id, &bidder.pubkey(), &bidder.pubkey(), 10 * o.lot_cost, false)], &[&bidder]);
    rec(&env, meta);
    env.warp(o.expires_at - env.now());
    env.close_bidding(&m, id).unwrap();
    env.reveal_randomness(&m, id, 9);
    let meta = env.send_ok(&[env.settle_ix(&m, id)], &[]);
    rec(&env, meta);
    let meta = env.send_ok(&[env.sell_remainder_ix(&m, id)], &[]);
    rec(&env, meta);
    let meta = env.send_ok(&[env.claim_wallet_bid_ix(&m, id, &bidder.pubkey())], &[]);
    rec(&env, meta);
    let payer = env.payer.pubkey();
    let meta = env.send_ok(&[env.chest_claim_ix(&m, id, &bidder.pubkey(), 1, &bidder.pubkey())], &[]);
    let _ = payer;
    rec(&env, meta);
    let meta = env.send_ok(&[env.ticket_buy_ix(&m, &seller.pubkey(), id, 5 * USDC)], &[&seller]);
    rec(&env, meta);
    let meta = env.send_ok(&[env.distribute_fees_ix(&m)], &[]);
    rec(&env, meta);
    env.warp(6 * 3_600);
    env.crank_epochs_if_needed(&m.mint);
    let meta = env.send_ok(&[env.harvest_ix(&m, &bidder.pubkey())], &[&bidder]);
    rec(&env, meta);

    let mut json = String::from("{\n  \"mint\": \"");
    json += &m.mint.to_string();
    json += "\",\n  \"txs\": [\n";
    let rows: Vec<String> = txs
        .iter()
        .map(|(sig, slot, logs)| {
            let l: Vec<String> = logs.iter().map(|x| format!("{:?}", x)).collect();
            format!("    {{ \"signature\": \"{sig}\", \"slot\": {slot}, \"logs\": [{}] }}", l.join(", "))
        })
        .collect();
    json += &rows.join(",\n");
    json += "\n  ]\n}\n";
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../indexer/test/fixtures/lifecycle.json");
    if std::env::var("BACKSTOP_WRITE_FIXTURES").is_ok() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, &json).unwrap();
    }
    assert!(path.exists(), "fixture missing — run with BACKSTOP_WRITE_FIXTURES=1");
}
