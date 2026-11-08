//! Integration tests for the transfer hook (Phase 1).

use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::{InstructionData, ToAccountMetas};
use backstop_common::{defaults, ids, pda};
use backstop_tests::*;

const TOKEN: u64 = 1_000_000_000; // 1 token (9 decimals)
const DAY: i64 = 86_400;

fn funded(env: &mut Env, mint: &Pubkey, auth: &Keypair, amount: u64) -> Keypair {
    let w = env.wallet(1);
    let ata = env.create_ata(&w.pubkey(), mint);
    if amount > 0 {
        env.mint_to(mint, auth, &ata, amount);
    }
    w
}

#[test]
fn initialize_grows_reward_state_and_sets_allowlist() {
    let mut env = Env::new();
    let (mint, _auth) = env.setup_hook_mint();
    let cfg = env.hook_config(&mint);
    assert!(cfg.reward_ready);
    assert_eq!(cfg.governance, env.governance.pubkey());
    assert_eq!(cfg.amm_authority, pda::pool(&mint).0);
    for p in ids::PROTOCOL_PROGRAMS {
        assert!(cfg.is_allowed_program(&p));
    }
    for o in pda::protocol_owners(&mint) {
        assert!(cfg.is_allowed_owner(&o));
    }
    let rs = env.reward_state(&mint);
    assert_eq!(rs.mint, mint);
    assert!(env.exists(&pda::extra_account_metas(&mint).0));
}

#[test]
fn initialize_requires_mint_authority() {
    let mut env = Env::new();
    let auth = env.wallet(1);
    let mint = env.create_engine_mint(&auth.pubkey()).pubkey();
    let impostor = env.wallet(1);
    let args = env.default_hook_args();
    let ix = Instruction::new_with_bytes(
        ids::HOOK,
        &backstop_hook::instruction::Initialize { args }.data(),
        backstop_hook::accounts::Initialize {
            payer: env.payer.pubkey(),
            mint_authority: impostor.pubkey(),
            mint,
            config: pda::hook_config(&mint).0,
            extra_metas: pda::extra_account_metas(&mint).0,
            reward_state: pda::reward_state(&mint).0,
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None),
    );
    assert_fails_with(env.send(&[ix], &[&impostor]), "NotMintAuthority");
}

#[test]
fn direct_transfer_resets_sender_and_tracks_receiver() {
    let mut env = Env::new();
    let (mint, auth) = env.setup_hook_mint();
    let a = funded(&mut env, &mint, &auth, 1_000 * TOKEN);
    let b = funded(&mut env, &mint, &auth, 0);
    env.register(&a, &mint).unwrap();
    env.register(&b, &mint).unwrap();
    assert_eq!(
        env.holder(&mint, &a.pubkey()).unwrap().balance,
        1_000 * TOKEN
    );

    env.warp(10 * DAY);
    let before = env.holder(&mint, &a.pubkey()).unwrap();
    assert_eq!(
        before.tenure().tenure_at(env.now()).unwrap(),
        (1_000 * TOKEN) as u128 * (10 * DAY) as u128
    );

    env.transfer(&mint, &a, &b.pubkey(), 100 * TOKEN).unwrap();
    let ha = env.holder(&mint, &a.pubkey()).unwrap();
    let hb = env.holder(&mint, &b.pubkey()).unwrap();
    assert_eq!(ha.balance, 900 * TOKEN);
    assert_eq!(ha.acc.get(), 0, "outbound transfer resets tenure");
    assert_eq!(hb.balance, 100 * TOKEN);
    assert_eq!(
        hb.tenure().tenure_at(env.now()).unwrap(),
        0,
        "inbound tokens start at zero"
    );
    assert!(
        hb.received_from_recently(&a.pubkey(), env.now(), 86_400),
        "sender recorded for self-fill checks"
    );
    assert_eq!(
        env.token_balance(&Env::ata(&b.pubkey(), &mint)),
        100 * TOKEN
    );
}

#[test]
fn tenure_multiplier_grows_to_cap() {
    let mut env = Env::new();
    let (mint, auth) = env.setup_hook_mint();
    let a = funded(&mut env, &mint, &auth, 10 * TOKEN);
    env.register(&a, &mint).unwrap();
    let p = env.hook_config(&mint);
    let m = |env: &Env| {
        env.holder(&mint, &a.pubkey())
            .unwrap()
            .tenure()
            .multiplier_bps(env.now(), p.tenure_cap_secs, p.tenure_extra_bps)
            .unwrap()
    };
    assert_eq!(m(&env), 10_000);
    env.warp(45 * DAY);
    assert_eq!(m(&env), 20_000);
    env.warp(60 * DAY);
    assert_eq!(m(&env), 30_000);
}

#[test]
fn unregistered_receiver_is_untracked_until_registration() {
    let mut env = Env::new();
    let (mint, auth) = env.setup_hook_mint();
    let a = funded(&mut env, &mint, &auth, 50 * TOKEN);
    let c = funded(&mut env, &mint, &auth, 0);
    env.register(&a, &mint).unwrap();
    env.transfer(&mint, &a, &c.pubkey(), 20 * TOKEN).unwrap();
    assert!(env.holder(&mint, &c.pubkey()).is_none());
    env.register(&c, &mint).unwrap();
    let hc = env.holder(&mint, &c.pubkey()).unwrap();
    assert_eq!(hc.balance, 20 * TOKEN);
    assert_eq!(hc.acc.get(), 0);
}

#[test]
fn self_transfer_between_own_accounts_does_not_reset() {
    let mut env = Env::new();
    let (mint, auth) = env.setup_hook_mint();
    let a = funded(&mut env, &mint, &auth, 10 * TOKEN);
    env.register(&a, &mint).unwrap();
    env.warp(DAY);
    // second account for the same owner (with ImmutableOwner via a fresh mint-less ATA is impossible,
    // so use a plain account and expect the ImmutableOwner rule to reject it)
    let other = env.create_mutable_owner_account(&a.pubkey(), &mint);
    let ix = Env::transfer_ix(
        &mint,
        &Env::ata(&a.pubkey(), &mint),
        &a.pubkey(),
        &other,
        &a.pubkey(),
        TOKEN,
    );
    assert_fails_with(env.send(&[ix], &[&a]), "MissingImmutableOwner");
    let h = env.holder(&mint, &a.pubkey()).unwrap();
    assert!(h.acc.get() > 0 || h.tenure().tenure_at(env.now()).unwrap() > 0);
}

#[test]
fn rejects_destination_without_immutable_owner() {
    let mut env = Env::new();
    let (mint, auth) = env.setup_hook_mint();
    let a = funded(&mut env, &mint, &auth, 10 * TOKEN);
    let b = env.wallet(1);
    let acct = env.create_mutable_owner_account(&b.pubkey(), &mint);
    let ix = Env::transfer_ix(
        &mint,
        &Env::ata(&a.pubkey(), &mint),
        &a.pubkey(),
        &acct,
        &b.pubkey(),
        TOKEN,
    );
    assert_fails_with(env.send(&[ix], &[&a]), "MissingImmutableOwner");
}

#[test]
fn rejects_direct_transfer_to_program_owned_account() {
    let mut env = Env::new();
    let (mint, auth) = env.setup_hook_mint();
    let a = funded(&mut env, &mint, &auth, 10 * TOKEN);
    // A foreign "pool authority" PDA (off-curve, not allowlisted).
    let (foreign_pda, _) = Pubkey::find_program_address(&[b"raydium-like-pool"], &ids::MOCK_SWAP);
    let vault = env.create_ata(&foreign_pda, &mint);
    let ix = Env::transfer_ix(
        &mint,
        &Env::ata(&a.pubkey(), &mint),
        &a.pubkey(),
        &vault,
        &foreign_pda,
        TOKEN,
    );
    assert_fails_with(env.send(&[ix], &[&a]), "DirectTransferToProtocolAccount");
    // Even a protocol-owned account cannot be a *direct* transfer target.
    let pool = pda::pool(&mint).0;
    let pool_vault = env.create_ata(&pool, &mint);
    let ix = Env::transfer_ix(
        &mint,
        &Env::ata(&a.pubkey(), &mint),
        &a.pubkey(),
        &pool_vault,
        &pool,
        TOKEN,
    );
    assert_fails_with(env.send(&[ix], &[&a]), "DirectTransferToProtocolAccount");
}

#[test]
fn rejects_movement_initiated_by_foreign_program() {
    let mut env = Env::new();
    let (mint, auth) = env.setup_hook_mint();
    let a = funded(&mut env, &mint, &auth, 10 * TOKEN);
    let b = funded(&mut env, &mint, &auth, 0);
    let mut metas = mock_swap::accounts::CpiTransfer {
        authority: a.pubkey(),
        from: Env::ata(&a.pubkey(), &mint),
        mint,
        to: Env::ata(&b.pubkey(), &mint),
        token_program: ids::TOKEN_2022,
    }
    .to_account_metas(None);
    metas.extend(hook_metas(&mint, &a.pubkey(), &b.pubkey()));
    let ix = Instruction::new_with_bytes(
        ids::MOCK_SWAP,
        &mock_swap::instruction::CpiTransfer {
            amount: TOKEN,
            decimals: defaults::DECIMALS,
        }
        .data(),
        metas,
    );
    assert_fails_with(env.send(&[ix], &[&a]), "UnauthorizedProgram");
    assert_eq!(env.token_balance(&Env::ata(&a.pubkey(), &mint)), 10 * TOKEN);
}

#[test]
fn rejects_direct_invocation_of_execute() {
    let mut env = Env::new();
    let (mint, auth) = env.setup_hook_mint();
    let a = funded(&mut env, &mint, &auth, 10 * TOKEN);
    let b = funded(&mut env, &mint, &auth, 0);
    env.register(&b, &mint).unwrap();
    let mut metas = vec![
        AccountMeta::new_readonly(Env::ata(&a.pubkey(), &mint), false),
        AccountMeta::new_readonly(mint, false),
        AccountMeta::new_readonly(Env::ata(&b.pubkey(), &mint), false),
        AccountMeta::new_readonly(a.pubkey(), false),
        AccountMeta::new_readonly(pda::extra_account_metas(&mint).0, false),
    ];
    metas.extend(
        hook_metas(&mint, &a.pubkey(), &b.pubkey())
            .into_iter()
            .skip(2),
    );
    let ix = Instruction::new_with_bytes(
        ids::HOOK,
        &backstop_hook::instruction::Execute { amount: 5 * TOKEN }.data(),
        metas,
    );
    assert_fails_with(env.send(&[ix], &[]), "NotTransferring");
    assert_eq!(env.holder(&mint, &b.pubkey()).unwrap().balance, 0);
}

#[test]
fn privileged_instructions_reject_outsiders() {
    let mut env = Env::new();
    let (mint, auth) = env.setup_hook_mint();
    let a = funded(&mut env, &mint, &auth, 10 * TOKEN);
    env.register(&a, &mint).unwrap();
    let outsider = env.wallet(1);

    let deposit = Instruction::new_with_bytes(
        ids::HOOK,
        &backstop_hook::instruction::DepositRewards { amount: 1_000 }.data(),
        backstop_hook::accounts::DepositRewards {
            authority: outsider.pubkey(),
            config: pda::hook_config(&mint).0,
            reward_state: pda::reward_state(&mint).0,
        }
        .to_account_metas(None),
    );
    assert_fails_with(env.send(&[deposit], &[&outsider]), "Unauthorized");

    let credit = Instruction::new_with_bytes(
        ids::HOOK,
        &backstop_hook::instruction::CreditTenure {
            raw_lot_tenure: u128::MAX / 4,
        }
        .data(),
        backstop_hook::accounts::CreditTenure {
            authority: outsider.pubkey(),
            config: pda::hook_config(&mint).0,
            holder: pda::holder(&mint, &a.pubkey()).0,
            reward_state: pda::reward_state(&mint).0,
        }
        .to_account_metas(None),
    );
    assert_fails_with(env.send(&[credit], &[&outsider]), "Unauthorized");

    let harvest = Instruction::new_with_bytes(
        ids::HOOK,
        &backstop_hook::instruction::Harvest {}.data(),
        backstop_hook::accounts::Harvest {
            authority: outsider.pubkey(),
            config: pda::hook_config(&mint).0,
            holder: pda::holder(&mint, &a.pubkey()).0,
            reward_state: pda::reward_state(&mint).0,
        }
        .to_account_metas(None),
    );
    assert_fails_with(env.send(&[harvest], &[&outsider]), "Unauthorized");

    let burn = Instruction::new_with_bytes(
        ids::HOOK,
        &backstop_hook::instruction::RecordBurn {
            wallet: a.pubkey(),
            amount: TOKEN,
        }
        .data(),
        backstop_hook::accounts::RecordBurn {
            authority: outsider.pubkey(),
            config: pda::hook_config(&mint).0,
            holder: pda::holder(&mint, &a.pubkey()).0,
            reward_state: pda::reward_state(&mint).0,
        }
        .to_account_metas(None),
    );
    assert_fails_with(env.send(&[burn], &[&outsider]), "Unauthorized");
}

#[test]
fn sync_cannot_overcount() {
    let mut env = Env::new();
    let (mint, auth) = env.setup_hook_mint();
    let a = funded(&mut env, &mint, &auth, 10 * TOKEN);
    let b = funded(&mut env, &mint, &auth, 7 * TOKEN);
    let ata_a = Env::ata(&a.pubkey(), &mint);
    // duplicate account
    let ix = env.register_ix(&a.pubkey(), &mint, &[ata_a, ata_a]);
    assert_fails_with(env.send(&[ix], &[&a]), "DuplicateAccount");
    // someone else's account
    let ix = env.register_ix(&a.pubkey(), &mint, &[ata_a, Env::ata(&b.pubkey(), &mint)]);
    assert_fails_with(env.send(&[ix], &[&a]), "HolderMismatch");
    let ix = env.register_ix(&a.pubkey(), &mint, &[ata_a]);
    env.send_ok(&[ix], &[&a]);
    assert_eq!(env.holder(&mint, &a.pubkey()).unwrap().balance, 10 * TOKEN);
}

#[test]
fn governance_controls_params_and_handover() {
    let mut env = Env::new();
    let (mint, _auth) = env.setup_hook_mint();
    let params = backstop_hook::instructions::HookParams {
        tenure_cap_secs: 60 * 86_400,
        tenure_extra_bps: 20_000,
        absorb_tenure_bps: 3_000,
        direct_sell_cap: 1,
        direct_sell_window_secs: 86_400,
        link_min_amount: 1,
        link_window_secs: 86_400,
    };
    let ix = |gov: Pubkey, p: backstop_hook::instructions::HookParams| {
        Instruction::new_with_bytes(
            ids::HOOK,
            &backstop_hook::instruction::SetParams { params: p }.data(),
            backstop_hook::accounts::GovernHook {
                governance: gov,
                config: pda::hook_config(&mint).0,
            }
            .to_account_metas(None),
        )
    };
    let outsider = env.wallet(1);
    assert_fails_with(
        env.send(&[ix(outsider.pubkey(), params.clone())], &[&outsider]),
        "Unauthorized",
    );
    let gov = env.governance.insecure_clone();
    env.send_ok(&[ix(gov.pubkey(), params.clone())], &[&gov]);
    assert_eq!(env.hook_config(&mint).absorb_tenure_bps, 3_000);
    // a tenure cap beyond the ring horizon is rejected
    let mut bad = params.clone();
    bad.tenure_cap_secs = 200 * 86_400;
    assert_fails_with(
        env.send(&[ix(gov.pubkey(), bad)], &[&gov]),
        "InvalidParameter",
    );

    let new_gov = env.wallet(1);
    let propose = Instruction::new_with_bytes(
        ids::HOOK,
        &backstop_hook::instruction::ProposeGovernance {
            new_governance: new_gov.pubkey(),
        }
        .data(),
        backstop_hook::accounts::GovernHook {
            governance: gov.pubkey(),
            config: pda::hook_config(&mint).0,
        }
        .to_account_metas(None),
    );
    env.send_ok(&[propose], &[&gov]);
    let accept = Instruction::new_with_bytes(
        ids::HOOK,
        &backstop_hook::instruction::AcceptGovernance {}.data(),
        backstop_hook::accounts::AcceptGovernance {
            new_governance: new_gov.pubkey(),
            config: pda::hook_config(&mint).0,
        }
        .to_account_metas(None),
    );
    env.send_ok(&[accept], &[&new_gov]);
    assert_eq!(env.hook_config(&mint).governance, new_gov.pubkey());
}

#[test]
fn long_inactivity_requires_epoch_crank() {
    let mut env = Env::new();
    let (mint, auth) = env.setup_hook_mint();
    let a = funded(&mut env, &mint, &auth, 10 * TOKEN);
    let b = funded(&mut env, &mint, &auth, 0);
    env.register(&a, &mint).unwrap();
    // > 512 epochs (6 h) of zero activity
    env.warp(130 * DAY);
    // Bypass the harness auto-crank to observe the raw failure.
    let ix = Env::transfer_ix(
        &mint,
        &Env::ata(&a.pubkey(), &mint),
        &a.pubkey(),
        &Env::ata(&b.pubkey(), &mint),
        &b.pubkey(),
        TOKEN,
    );
    assert_fails_with(env.send(&[ix], &[&a]), "EpochCatchUpRequired");
    let crank = Instruction::new_with_bytes(
        ids::HOOK,
        &backstop_hook::instruction::AdvanceEpochs { max_steps: 300 }.data(),
        backstop_hook::accounts::AdvanceEpochs {
            config: pda::hook_config(&mint).0,
            reward_state: pda::reward_state(&mint).0,
        }
        .to_account_metas(None),
    );
    // 520 pending boundaries: two cranks of 300 steps each fit the default budget.
    env.send_ok(std::slice::from_ref(&crank), &[]);
    env.send_ok(&[crank], &[]);
    env.transfer(&mint, &a, &b.pubkey(), TOKEN).unwrap();
}

#[test]
fn tracked_transfer_compute_budget() {
    let mut env = Env::new();
    let (mint, auth) = env.setup_hook_mint();
    let a = funded(&mut env, &mint, &auth, 100 * TOKEN);
    let b = funded(&mut env, &mint, &auth, 0);
    env.register(&a, &mint).unwrap();
    env.register(&b, &mint).unwrap();
    env.warp(7 * DAY); // also exercises inline catch-up of 28 epochs
    let meta = env.transfer(&mint, &a, &b.pubkey(), TOKEN).unwrap();
    println!(
        "tracked transfer (28-epoch catch-up) CU: {}",
        meta.compute_units_consumed
    );
    assert!(meta.compute_units_consumed < 100_000);
    env.warp(60);
    let meta = env.transfer(&mint, &b, &a.pubkey(), TOKEN / 2).unwrap();
    println!(
        "tracked transfer (steady state) CU: {}",
        meta.compute_units_consumed
    );
    // TODO(hardening): optimise the hook's steady-state cost (currently ~61k CU).
    assert!(meta.compute_units_consumed < 80_000);
}

#[test]
fn reward_totals_equal_sum_of_holder_weights() {
    use backstop_math::weight::WeightTotals;
    let mut env = Env::new();
    let (mint, auth) = env.setup_hook_mint();
    let wallets: Vec<Keypair> = (0..4)
        .map(|i| funded(&mut env, &mint, &auth, (i + 1) * 7 * TOKEN))
        .collect();
    for w in &wallets {
        env.register(w, &mint).unwrap();
        env.warp(DAY);
    }
    env.transfer(&mint, &wallets[3], &wallets[0].pubkey(), 5 * TOKEN)
        .unwrap();
    env.warp(3 * DAY);
    env.transfer(&mint, &wallets[1], &wallets[2].pubkey(), TOKEN)
        .unwrap();
    let rs = env.reward_state(&mint);
    let k = rs.last_epoch + 1;
    let totals = WeightTotals {
        a: rs.a.get(),
        b: rs.b.get(),
        c: rs.c.get(),
    };
    let sum: u128 = wallets
        .iter()
        .map(|w| {
            env.holder(&mint, &w.pubkey())
                .unwrap()
                .weight()
                .weight_at(k)
                .unwrap()
        })
        .sum();
    assert_eq!(totals.total_at(k).unwrap(), sum);
}
