//! Phase 2/5: core market verification, governance, agent bounds, timelock,
//! treasury floor and redemption.

#![allow(clippy::result_large_err, clippy::manual_range_contains)] // test-only

use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::system_instruction;
use anchor_lang::{InstructionData, ToAccountMetas};
use anchor_spl::token_2022::spl_token_2022 as t22;
use backstop_common::{defaults, ids, pda};
use backstop_core::state::{ParamId, TimelockAction};
use backstop_tests::market::{GenesisOpts, Mkt, USDC};
use backstop_tests::*;
use t22::extension::ExtensionType;

fn govern(_env: &Env, mint: &Pubkey, signer: &Pubkey, data: Vec<u8>) -> Instruction {
    Instruction::new_with_bytes(
        ids::CORE,
        &data,
        backstop_core::accounts::Govern {
            governance: *signer,
            market: pda::market(mint).0,
        }
        .to_account_metas(None),
    )
}

/// Engine mint with custom extensions/authorities for negative tests.
fn custom_mint(
    env: &mut Env,
    freeze: bool,
    permanent_delegate: bool,
    hook_authority: bool,
    revoke: bool,
) -> Pubkey {
    let auth = env.wallet(2);
    let mint = Keypair::new();
    let mut exts = vec![ExtensionType::TransferHook];
    if permanent_delegate {
        exts.push(ExtensionType::PermanentDelegate);
    }
    let space = ExtensionType::try_calculate_account_len::<t22::state::Mint>(&exts).unwrap();
    let rent = env.svm.minimum_balance_for_rent_exemption(space);
    let mut ixs = vec![system_instruction::create_account(
        &env.payer.pubkey(),
        &mint.pubkey(),
        rent,
        space as u64,
        &ids::TOKEN_2022,
    )];
    let hook_auth = if hook_authority {
        Some(auth.pubkey())
    } else {
        None
    };
    ixs.push(
        t22::extension::transfer_hook::instruction::initialize(
            &ids::TOKEN_2022,
            &mint.pubkey(),
            hook_auth,
            Some(ids::HOOK),
        )
        .unwrap(),
    );
    if permanent_delegate {
        ixs.push(
            t22::instruction::initialize_permanent_delegate(
                &ids::TOKEN_2022,
                &mint.pubkey(),
                &auth.pubkey(),
            )
            .unwrap(),
        );
    }
    let freeze_auth = if freeze { Some(auth.pubkey()) } else { None };
    ixs.push(
        t22::instruction::initialize_mint2(
            &ids::TOKEN_2022,
            &mint.pubkey(),
            &auth.pubkey(),
            freeze_auth.as_ref(),
            9,
        )
        .unwrap(),
    );
    env.send_ok(&ixs, &[&mint]);
    let m = mint.pubkey();
    let args = env.default_hook_args();
    env.init_hook(&m, &auth, args);
    let vault = env.create_ata(&pda::pool(&m).0, &m);
    env.mint_to(&m, &auth, &vault, 1_000 * 1_000_000_000);
    if revoke {
        let ix = t22::instruction::set_authority(
            &ids::TOKEN_2022,
            &m,
            None,
            t22::instruction::AuthorityType::MintTokens,
            &auth.pubkey(),
            &[],
        )
        .unwrap();
        env.send_ok(&[ix], &[&auth]);
    }
    m
}

fn try_init(env: &mut Env, mint: &Pubkey) -> TxResult {
    let qa = env.wallet(1);
    let quote = env.create_classic_mint(&qa.pubkey(), 6);
    let k = env.wallet(1);
    let args = env.market_args(&k.pubkey(), &k.pubkey(), None);
    let gov = env.governance.insecure_clone();
    let ix = env.init_market_ix(mint, &quote, &gov.pubkey(), args);
    env.send(&[ix], &[&gov])
}

#[test]
fn init_market_enforces_mint_safety() {
    let mut env = Env::new();
    let m = custom_mint(&mut env, false, false, false, false);
    assert_fails_with(try_init(&mut env, &m), "MintAuthorityNotRevoked");
    let m = custom_mint(&mut env, true, false, false, true);
    assert_fails_with(try_init(&mut env, &m), "FreezeAuthorityPresent");
    let m = custom_mint(&mut env, false, true, false, true);
    assert_fails_with(try_init(&mut env, &m), "ForbiddenExtension");
    let m = custom_mint(&mut env, false, false, true, true);
    assert_fails_with(try_init(&mut env, &m), "BadTransferHook");
    let m = custom_mint(&mut env, false, false, false, true);
    try_init(&mut env, &m).unwrap();
}

#[test]
fn init_market_rejects_squatters() {
    let mut env = Env::new();
    let (mint, _) = env.engine_mint_with_supply(defaults::TOTAL_SUPPLY);
    let squatter = env.wallet(2);
    let qa = env.wallet(1);
    let quote = env.create_classic_mint(&qa.pubkey(), 6);
    let mut args = env.market_args(&squatter.pubkey(), &squatter.pubkey(), None);
    args.governance = squatter.pubkey();
    let ix = env.init_market_ix(&mint, &quote, &squatter.pubkey(), args);
    assert_fails_with(env.send(&[ix], &[&squatter]), "Unauthorized");
}

#[test]
fn governance_params_and_validation() {
    let mut env = Env::new();
    let m = env.genesis(GenesisOpts::default());
    let gov = env.governance.insecure_clone();
    let ix = govern(
        &env,
        &m.mint,
        &gov.pubkey(),
        backstop_core::instruction::SetParam {
            param: ParamId::YieldBufferBps,
            value: 2_500,
        }
        .data(),
    );
    env.send_ok(&[ix], &[&gov]);
    assert_eq!(env.market(&m.mint).params.yield_buffer_bps, 2_500);
    let ix = govern(
        &env,
        &m.mint,
        &gov.pubkey(),
        backstop_core::instruction::SetParam {
            param: ParamId::TradeFeeBps,
            value: 5_000,
        }
        .data(),
    );
    assert_fails_with(env.send(&[ix], &[&gov]), "InvalidParameter");
    let outsider = env.wallet(1);
    let ix = govern(
        &env,
        &m.mint,
        &outsider.pubkey(),
        backstop_core::instruction::SetParam {
            param: ParamId::YieldBufferBps,
            value: 1_500,
        }
        .data(),
    );
    assert_fails_with(env.send(&[ix], &[&outsider]), "Unauthorized");
}

fn setup_agent(env: &mut Env, m: &Mkt) -> Keypair {
    let gov = env.governance.insecure_clone();
    let agent = env.wallet(1);
    let ix = Instruction::new_with_bytes(
        ids::CORE,
        &backstop_core::instruction::InitAgent {
            agent: agent.pubkey(),
        }
        .data(),
        backstop_core::accounts::InitAgent {
            governance: gov.pubkey(),
            market: pda::market(&m.mint).0,
            agent_authority: pda::agent(&m.mint).0,
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None),
    );
    env.send_ok(&[ix], &[&gov]);
    let ix = Instruction::new_with_bytes(
        ids::CORE,
        &backstop_core::instruction::SetAgentBound {
            param: ParamId::YieldBufferBps,
            enabled: true,
            min: 1_500,
            max: 3_000,
        }
        .data(),
        backstop_core::accounts::GovernAgent {
            governance: gov.pubkey(),
            market: pda::market(&m.mint).0,
            agent_authority: pda::agent(&m.mint).0,
        }
        .to_account_metas(None),
    );
    env.send_ok(&[ix], &[&gov]);
    agent
}

fn agent_ix(m: &Mkt, agent: &Pubkey, param: ParamId, value: u64) -> Instruction {
    Instruction::new_with_bytes(
        ids::CORE,
        &backstop_core::instruction::AgentSetParam { param, value }.data(),
        backstop_core::accounts::AgentSetParam {
            agent: *agent,
            market: pda::market(&m.mint).0,
            agent_authority: pda::agent(&m.mint).0,
        }
        .to_account_metas(None),
    )
}

#[test]
fn agent_is_bounded_and_rate_limited() {
    let mut env = Env::new();
    let m = env.genesis(GenesisOpts::default());
    let agent = setup_agent(&mut env, &m);
    env.send_ok(
        &[agent_ix(
            &m,
            &agent.pubkey(),
            ParamId::YieldBufferBps,
            2_200,
        )],
        &[&agent],
    );
    assert_eq!(env.market(&m.mint).params.yield_buffer_bps, 2_200);
    // cooldown (1 h)
    assert_fails_with(
        env.send(
            &[agent_ix(
                &m,
                &agent.pubkey(),
                ParamId::YieldBufferBps,
                2_300,
            )],
            &[&agent],
        ),
        "Cooldown",
    );
    env.warp(3_601);
    // out of bounds
    assert_fails_with(
        env.send(
            &[agent_ix(
                &m,
                &agent.pubkey(),
                ParamId::YieldBufferBps,
                3_500,
            )],
            &[&agent],
        ),
        "OutOfBounds",
    );
    // not an agent-tunable parameter
    assert_fails_with(
        env.send(
            &[agent_ix(&m, &agent.pubkey(), ParamId::TradeFeeBps, 250)],
            &[&agent],
        ),
        "NotAgentTunable",
    );
    // impostor
    let imp = env.wallet(1);
    assert_fails_with(
        env.send(
            &[agent_ix(&m, &imp.pubkey(), ParamId::YieldBufferBps, 2_000)],
            &[&imp],
        ),
        "Unauthorized",
    );
    env.send_ok(
        &[agent_ix(
            &m,
            &agent.pubkey(),
            ParamId::YieldBufferBps,
            3_000,
        )],
        &[&agent],
    );
}

#[test]
fn guardian_can_pause_but_not_unpause() {
    let mut env = Env::new();
    let m = env.genesis(GenesisOpts::default());
    let pause_ix = |signer: &Pubkey, flags: u8| {
        Instruction::new_with_bytes(
            ids::CORE,
            &backstop_core::instruction::SetPauses { pauses: flags }.data(),
            backstop_core::accounts::SetPauses {
                signer: *signer,
                market: pda::market(&m.mint).0,
            }
            .to_account_metas(None),
        )
    };
    let g = m.guardian.insecure_clone();
    env.send_ok(&[pause_ix(&g.pubkey(), 1)], &[&g]);
    env.send_ok(&[pause_ix(&g.pubkey(), 3)], &[&g]);
    assert_fails_with(
        env.send(&[pause_ix(&g.pubkey(), 1)], &[&g]),
        "GuardianCannotUnpause",
    );
    assert_fails_with(
        env.send(&[pause_ix(&g.pubkey(), 8)], &[&g]),
        "InvalidParameter",
    );
    let gov = env.governance.insecure_clone();
    env.send_ok(&[pause_ix(&gov.pubkey(), 0)], &[&gov]);
    assert_eq!(env.market(&m.mint).pauses, 0);
}

fn redeem_ix(env: &Env, m: &Mkt, user: &Pubkey, amount: u64, min_out: u64) -> Instruction {
    Instruction::new_with_bytes(
        ids::CORE,
        &backstop_core::instruction::Redeem {
            amount,
            min_lamports_out: min_out,
        }
        .data(),
        backstop_core::accounts::Redeem {
            user: *user,
            market: pda::market(&m.mint).0,
            treasury: pda::treasury(&m.mint).0,
            mint: m.mint,
            user_token: Env::ata(user, &m.mint),
            amm_base_vault: env.market(&m.mint).amm_base_vault,
            hook_config: pda::hook_config(&m.mint).0,
            holder: pda::holder(&m.mint, user).0,
            reward_state: pda::reward_state(&m.mint).0,
            hook_program: ids::HOOK,
            token_program: ids::TOKEN_2022,
        }
        .to_account_metas(None),
    )
}

fn donate(env: &mut Env, m: &Mkt, lamports: u64) {
    let payer = env.payer.insecure_clone();
    let ix = Instruction::new_with_bytes(
        ids::CORE,
        &backstop_core::instruction::DonateTreasury { lamports }.data(),
        backstop_core::accounts::DonateTreasury {
            donor: payer.pubkey(),
            market: pda::market(&m.mint).0,
            treasury: pda::treasury(&m.mint).0,
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None),
    );
    env.send_ok(&[ix], &[]);
}

#[test]
fn redemption_pays_pro_rata_floor_and_burns() {
    let mut env = Env::new();
    let m = env.genesis(GenesisOpts::default());
    let a = env.trader(&m, 50_000 * USDC);
    let b = env.trader(&m, 50_000 * USDC);
    env.buy(&m, &a, 10_000 * USDC).unwrap();
    env.buy(&m, &b, 10_000 * USDC).unwrap();
    env.register(&a, &m.mint).unwrap();
    donate(&mut env, &m, 100 * LAMPORTS_PER_SOL);

    let supply_before = {
        let d = env.account_data(&m.mint).unwrap();
        u64::from_le_bytes(d[36..44].try_into().unwrap())
    };
    let pool_reserve = env.pool(&m.mint).base_reserve;
    let circ = supply_before - pool_reserve;
    let bal_a = env.token_balance(&Env::ata(&a.pubkey(), &m.mint));
    let redeem_amt = bal_a / 2;
    let gross = (redeem_amt as u128 * (100 * LAMPORTS_PER_SOL) as u128 / circ as u128) as u64;
    let fee = (gross as u128 * 100).div_ceil(10_000) as u64;
    let sol_before = env.lamports(&a.pubkey());
    env.warp(10);
    let ix = redeem_ix(&env, &m, &a.pubkey(), redeem_amt, gross - fee);
    let meta = env.send_ok(&[ix], &[&a]);
    let _ = meta;
    let sol_after = env.lamports(&a.pubkey());
    // payer pays the tx fee, so the user's balance rises by exactly net
    assert_eq!(sol_after - sol_before, gross - fee);
    assert_eq!(
        env.token_balance(&Env::ata(&a.pubkey(), &m.mint)),
        bal_a - redeem_amt
    );
    let d = env.account_data(&m.mint).unwrap();
    assert_eq!(
        u64::from_le_bytes(d[36..44].try_into().unwrap()),
        supply_before - redeem_amt,
        "burned"
    );
    let mk = env.market(&m.mint);
    assert_eq!(mk.shield_lamports_pending, fee);
    assert_eq!(
        env.holder(&m.mint, &a.pubkey()).unwrap().acc.get(),
        0,
        "redemption resets tenure"
    );

    // slippage guard
    let ix = redeem_ix(&env, &m, &b.pubkey(), 1_000 * TOKEN_UNITS, u64::MAX);
    assert_fails_with(env.send(&[ix], &[&b]), "RedemptionSlippage");
}

const TOKEN_UNITS: u64 = 1_000_000_000;

fn queue_ix(env: &Env, m: &Mkt, id: u64, action: TimelockAction) -> Instruction {
    let gov = env.governance.pubkey();
    Instruction::new_with_bytes(
        ids::CORE,
        &backstop_core::instruction::QueueAction { id, action }.data(),
        backstop_core::accounts::QueueAction {
            governance: gov,
            market: pda::market(&m.mint).0,
            queued: pda::timelock(&m.mint, id).0,
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn exec_ix(env: &Env, m: &Mkt, id: u64, dest: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        ids::CORE,
        &backstop_core::instruction::ExecuteAction {}.data(),
        backstop_core::accounts::ExecuteAction {
            executor: env.payer.pubkey(),
            governance: env.governance.pubkey(),
            market: pda::market(&m.mint).0,
            treasury: pda::treasury(&m.mint).0,
            queued: pda::timelock(&m.mint, id).0,
            destination: *dest,
        }
        .to_account_metas(None),
    )
}

#[test]
fn redemption_pause_and_treasury_withdraw_need_48h_timelock() {
    let mut env = Env::new();
    let m = env.genesis(GenesisOpts::default());
    let gov = env.governance.insecure_clone();
    let user = env.trader(&m, 20_000 * USDC);
    env.buy(&m, &user, 1_000 * USDC).unwrap();
    donate(&mut env, &m, 10 * LAMPORTS_PER_SOL);

    let q = queue_ix(
        &env,
        &m,
        1,
        TimelockAction::SetRedemptionPaused { paused: true },
    );
    env.send_ok(&[q], &[&gov]);
    let gov_key = gov.pubkey();
    assert_fails_with(
        env.send(&[exec_ix(&env, &m, 1, &gov_key)], &[]),
        "TimelockNotExpired",
    );
    // redemption still works during the 48 h window
    let ix = redeem_ix(&env, &m, &user.pubkey(), 1_000 * TOKEN_UNITS, 0);
    env.send_ok(&[ix], &[&user]);
    env.warp(48 * 3_600 + 1);
    env.send_ok(&[exec_ix(&env, &m, 1, &gov_key)], &[]);
    let ix = redeem_ix(&env, &m, &user.pubkey(), 1_000 * TOKEN_UNITS, 0);
    assert_fails_with(env.send(&[ix], &[&user]), "RedemptionPaused");

    // treasury withdrawal also only via timelock
    let dest = env.wallet(0);
    let q = queue_ix(
        &env,
        &m,
        2,
        TimelockAction::TreasuryWithdraw {
            to: dest.pubkey(),
            lamports: LAMPORTS_PER_SOL,
        },
    );
    env.send_ok(&[q], &[&gov]);
    env.warp(48 * 3_600 + 1);
    let before = env.lamports(&dest.pubkey());
    env.send_ok(&[exec_ix(&env, &m, 2, &dest.pubkey())], &[]);
    assert_eq!(env.lamports(&dest.pubkey()) - before, LAMPORTS_PER_SOL);
}
