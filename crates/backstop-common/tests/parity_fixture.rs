//! Rust ↔ TypeScript parity fixture.
//!
//! Produces `sdk/test/fixtures/parity.json` (PDAs + math vectors). The Rust
//! side regenerates the JSON and compares it byte-for-byte with the committed
//! file; the SDK test suite checks its own implementations against the same
//! file. Regenerate with `BACKSTOP_WRITE_FIXTURES=1 cargo test -p backstop-common --test parity_fixture`.

use anchor_lang::prelude::Pubkey;
use backstop_common::pda;

fn fixture() -> String {
    let mint = Pubkey::from_str_const("BSTPmint11111111111111111111111111111111111");
    let wallet = Pubkey::from_str_const("Wa11et1111111111111111111111111111111111111");
    let offer = pda::offer(&mint, 7).0;
    let pdas = [
        ("hookConfig", pda::hook_config(&mint).0),
        ("extraAccountMetas", pda::extra_account_metas(&mint).0),
        ("holder", pda::holder(&mint, &wallet).0),
        ("rewardState", pda::reward_state(&mint).0),
        ("market", pda::market(&mint).0),
        ("treasury", pda::treasury(&mint).0),
        ("agent", pda::agent(&mint).0),
        ("timelock", pda::timelock(&mint, 3).0),
        ("parentVault", pda::parent_vault(&mint).0),
        ("pool", pda::pool(&mint).0),
        ("book", pda::book(&mint).0),
        ("offer", offer),
        ("bid", pda::bid(&offer, &wallet, 2).0),
        ("ticket", pda::ticket(&mint, &wallet, 7).0),
        ("chestMarket", pda::chest_market(&mint).0),
        ("chest", pda::chest(&mint, &wallet).0),
        ("grant", pda::grant(&mint, &wallet).0),
        ("shield", pda::shield(&mint).0),
        ("shieldPosition", pda::shield_position(&mint, &wallet, 5).0),
        ("rewardsVaultAuthority", pda::rewards_vault_authority(&mint).0),
        ("shieldRewardsVault", pda::shield_rewards_vault(&mint).0),
        ("launchpad", pda::launchpad().0),
        ("child", pda::child(&mint).0),
        ("vesting", pda::vesting(&mint).0),
        ("childMintAuthority", pda::child_mint_authority(&mint).0),
    ];
    let mut s = String::from("{\n  \"mint\": \"");
    s += &mint.to_string();
    s += "\",\n  \"wallet\": \"";
    s += &wallet.to_string();
    s += "\",\n  \"pdas\": {\n";
    let body: Vec<String> = pdas.iter().map(|(k, v)| format!("    \"{k}\": \"{v}\"")).collect();
    s += &body.join(",\n");
    s += "\n  },\n  \"allocate\": [\n";
    let mut rows = vec![];
    for (prefix, cap, total, avail, off) in
        [(0u64, 30u64, 120u64, 100u64, 0u64), (30, 50, 120, 100, 77), (80, 40, 120, 100, 119), (0, 3, 3, 10, 0), (2, 1, 9, 4, 5)]
    {
        let n = backstop_math::allocation::allocate(prefix, cap, total, avail, off).unwrap();
        rows.push(format!("    [{prefix}, {cap}, {total}, {avail}, {off}, {n}]"));
    }
    s += &rows.join(",\n");
    s += "\n  ],\n  \"discount\": [\n";
    let p = backstop_math::discount::DiscountParams::default();
    let rows: Vec<String> = [-50_000i64, -2_000, -1_000, 0, 999, 2_000, 4_000, 100_000]
        .iter()
        .map(|m| format!("    [{m}, {}]", backstop_math::discount::discount_bps(*m, &p).unwrap()))
        .collect();
    s += &rows.join(",\n");
    s += "\n  ],\n  \"buy\": [\n";
    let rows: Vec<String> = [(1_000u64, 1_000_000u64, 1_000_000u64), (123_456_789, 999_999_999_999, 50_000_000_000)]
        .iter()
        .map(|(q, b, r)| {
            let x = backstop_math::amm::buy(*q, *b, *r, 300).unwrap();
            format!("    [\"{q}\", \"{b}\", \"{r}\", \"{}\", \"{}\"]", x.fee, x.user_out)
        })
        .collect();
    s += &rows.join(",\n");
    s += "\n  ],\n  \"multiplier\": [\n";
    let rows: Vec<String> = [(1_000u64, 0u128), (1_000, 1_000u128 * 45 * 86_400), (7, 7u128 * 200 * 86_400)]
        .iter()
        .map(|(b, t)| {
            let tenure = backstop_math::tenure::Tenure { balance: *b, acc: *t, last_ts: 0 };
            format!("    [\"{b}\", \"{t}\", {}]", tenure.multiplier_bps(0, 90 * 86_400, 20_000).unwrap())
        })
        .collect();
    s += &rows.join(",\n");
    s += "\n  ]\n}\n";
    s
}

#[test]
fn parity_fixture_is_current() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../sdk/test/fixtures/parity.json");
    let want = fixture();
    if std::env::var("BACKSTOP_WRITE_FIXTURES").is_ok() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, &want).unwrap();
    }
    let have = std::fs::read_to_string(&path).expect("fixture missing: run with BACKSTOP_WRITE_FIXTURES=1");
    assert_eq!(have, want, "parity fixture out of date — regenerate it");
}
