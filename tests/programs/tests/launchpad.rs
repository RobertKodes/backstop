//! Phase 9: launchpad — child launch, safety invariants, parent fee share,
//! creator vesting.

#![allow(clippy::result_large_err)] // test-only

use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::{InstructionData, ToAccountMetas};
use anchor_spl::token_2022::spl_token_2022 as t22;
use backstop_common::{ids, pda};
use backstop_tests::flows::{usdc_ata, SYSTEM};
use backstop_tests::launch::ChildArgs;
use backstop_tests::market::{GenesisOpts, Mkt, USDC};
use backstop_tests::*;
use t22::extension::{BaseStateWithExtensions, StateWithExtensionsOwned};

const DAY: i64 = 86_400;
const SOL: u64 = 1_000_000_000;

fn setup() -> (Env, Mkt, Keypair) {
    let mut env = Env::new();
    let parent = env.full_genesis(GenesisOpts::default());
    env.init_launchpad(&parent);
    let creator = env.wallet(30);
    (env, parent, creator)
}

#[test]
fn child_launch_end_to_end() {
    let (mut env, parent, creator) = setup();
    let args = ChildArgs::default();
    let supply = args.supply;
    let child = env.launch_child(&parent, &creator, args).expect("launch");
    let rec = env.child(&child.mint);
    assert_eq!(rec.status, 6, "live");
    assert_eq!(rec.creator_amount, supply / 20, "5 % creator allocation");

    // mint safety: fixed supply, no freeze, metadata frozen, hook pinned
    let data = env.account_data(&child.mint).unwrap();
    let st = StateWithExtensionsOwned::<t22::state::Mint>::unpack(data).unwrap();
    assert!(Option::<anchor_lang::prelude::Pubkey>::from(st.base.mint_authority).is_none());
    assert!(Option::<anchor_lang::prelude::Pubkey>::from(st.base.freeze_authority).is_none());
    assert_eq!(st.base.supply, supply);
    let meta = st.get_variable_len_extension::<anchor_spl::token_2022_extensions::spl_token_metadata_interface::state::TokenMetadata>().unwrap();
    assert_eq!(meta.symbol, "FROG");
    assert!(
        Option::<anchor_lang::prelude::Pubkey>::from(meta.update_authority).is_none(),
        "metadata frozen"
    );

    // market wiring: parent share, wSOL quote, locked liquidity
    let mk = env.market(&child.mint);
    assert_eq!(mk.parent, parent.mint);
    assert_eq!(mk.quote_mint, ids::WSOL);
    assert_eq!(mk.params.parent_share_bps, 3_000);
    let p = env.pool(&child.mint);
    assert_eq!(p.base_reserve, supply - supply / 20);
    assert_eq!(p.quote_reserve, 6 * SOL);
    assert_eq!(
        env.token_balance(&Env::ata(&pda::vesting(&child.mint).0, &child.mint)),
        supply / 20
    );
}

#[test]
fn child_fees_reach_backstop_holders() {
    let (mut env, parent, creator) = setup();
    let child = env
        .launch_child(&parent, &creator, ChildArgs::default())
        .unwrap();

    // a BACKSTOP holder who should receive the child's parent share
    let holder = env.trader(&parent, 1_000 * USDC);
    env.register(&holder, &parent.mint).unwrap();
    env.buy(&parent, &holder, 500 * USDC).unwrap();

    // trade the child with wSOL
    let buyer = env.wallet(20);
    env.create_ata(&buyer.pubkey(), &child.mint);
    env.wrap_sol(&buyer, 10 * SOL);
    env.buy(&child, &buyer, 4 * SOL).unwrap();
    let fees = env.token_balance(&env.market(&child.mint).fee_vault);
    assert_eq!(fees, 4 * SOL * 3 / 100);
    let ix = env.distribute_fees_ix(&child);
    env.send_ok(&[ix], &[]);
    let parent_share = env.token_balance(&pda::parent_vault(&child.mint).0);
    assert_eq!(
        parent_share,
        fees * 3 / 10,
        "30 % of child fees reserved for BACKSTOP"
    );

    // mock route SOL→USDC at the oracle price (150 USDC/SOL)
    let gov = env.governance.insecure_clone();
    let swap_pool = anchor_lang::prelude::Pubkey::find_program_address(
        &[b"mock_pool", ids::WSOL.as_ref(), parent.quote.as_ref()],
        &ids::MOCK_SWAP,
    )
    .0;
    let ix = Instruction::new_with_bytes(
        ids::MOCK_SWAP,
        &mock_swap::instruction::InitPool {
            rate_num: 3,
            rate_den: 20,
        }
        .data(),
        mock_swap::accounts::InitPool {
            admin: gov.pubkey(),
            mint_in: ids::WSOL,
            mint_out: parent.quote,
            pool: swap_pool,
            system_program: SYSTEM,
        }
        .to_account_metas(None),
    );
    env.send_ok(&[ix], &[&gov]);
    env.create_ata_with_program(&swap_pool, &ids::WSOL, &ids::TOKEN);
    let qa = parent.quote_authority.insecure_clone();
    env.mint_classic(&parent.quote, &qa, &swap_pool, 1_000 * USDC);

    let child_market = pda::market(&child.mint).0;
    let parent_market = env.market(&parent.mint);
    let route: Vec<AccountMeta> = vec![
        AccountMeta::new_readonly(child_market, false),
        AccountMeta::new_readonly(swap_pool, false),
        AccountMeta::new_readonly(ids::WSOL, false),
        AccountMeta::new_readonly(parent.quote, false),
        AccountMeta::new(pda::parent_vault(&child.mint).0, false),
        AccountMeta::new(parent_market.holder_rewards_vault, false),
        AccountMeta::new(usdc_ata(&swap_pool, &ids::WSOL), false),
        AccountMeta::new(usdc_ata(&swap_pool, &parent.quote), false),
        AccountMeta::new_readonly(ids::TOKEN, false),
        AccountMeta::new_readonly(ids::TOKEN, false),
    ];
    let swap_data = {
        let mut d =
            <mock_swap::instruction::Swap as anchor_lang::Discriminator>::DISCRIMINATOR.to_vec();
        d.extend_from_slice(&parent_share.to_le_bytes());
        d.extend_from_slice(&0u64.to_le_bytes());
        d
    };
    let mut metas = backstop_core::accounts::ConvertParentShare {
        keeper: parent.keeper.pubkey(),
        market: child_market,
        parent_market: pda::market(&parent.mint).0,
        parent_vault: pda::parent_vault(&child.mint).0,
        parent_rewards_vault: parent_market.holder_rewards_vault,
        parent_hook_config: pda::hook_config(&parent.mint).0,
        parent_reward_state: pda::reward_state(&parent.mint).0,
        hook_program: ids::HOOK,
        oracle_feed: None,
        swap_program: ids::MOCK_SWAP,
    }
    .to_account_metas(None);
    metas.extend(route);
    let pending0 = env.reward_state(&parent.mint).pending;
    let rewards0 = env.token_balance(&parent_market.holder_rewards_vault);
    let ix = Instruction::new_with_bytes(
        ids::CORE,
        &backstop_core::instruction::ConvertParentShare {
            amount_in: parent_share,
            swap_data,
        }
        .data(),
        metas,
    );
    let k = parent.keeper.insecure_clone();
    env.send_ok(&[ix], &[&k]);
    let expected_usdc = parent_share * 3 / 20;
    assert_eq!(
        env.token_balance(&parent_market.holder_rewards_vault) - rewards0,
        expected_usdc
    );
    assert_eq!(
        env.reward_state(&parent.mint).pending - pending0,
        expected_usdc,
        "credited to BACKSTOP holders' accumulator"
    );
}

#[test]
fn creator_allocation_vests_linearly() {
    let (mut env, parent, creator) = setup();
    let child = env
        .launch_child(&parent, &creator, ChildArgs::default())
        .unwrap();
    env.create_ata(&creator.pubkey(), &child.mint);
    assert_fails_with(env.claim_vested(&creator, &child.mint), "NothingToClaim");
    env.warp(45 * DAY);
    env.crank_epochs_if_needed(&child.mint);
    env.claim_vested(&creator, &child.mint).unwrap();
    let alloc = env.child(&child.mint).creator_amount;
    let got = env.token_balance(&Env::ata(&creator.pubkey(), &child.mint));
    assert!(
        (got as f64 / alloc as f64 - 0.5).abs() < 0.001,
        "≈ half vested after 45 days"
    );
    env.warp(60 * DAY);
    env.crank_epochs_if_needed(&child.mint);
    env.claim_vested(&creator, &child.mint).unwrap();
    assert_eq!(
        env.token_balance(&Env::ata(&creator.pubkey(), &child.mint)),
        alloc
    );
    assert_fails_with(env.claim_vested(&creator, &child.mint), "NothingToClaim");
}

#[test]
fn launch_rules_are_enforced() {
    let (mut env, parent, creator) = setup();
    let e = env
        .launch_child(
            &parent,
            &creator,
            ChildArgs {
                creator_bps: 501,
                ..Default::default()
            },
        )
        .err()
        .expect("launch should fail");
    assert!(e.contains("CreatorAllocationTooHigh"), "{e}");
    let e = env
        .launch_child(
            &parent,
            &creator,
            ChildArgs {
                liquidity_lamports: 4 * SOL,
                ..Default::default()
            },
        )
        .err()
        .expect("launch should fail");
    assert!(e.contains("LiquidityTooLow"), "{e}");
    let e = env
        .launch_child(
            &parent,
            &creator,
            ChildArgs {
                name: "x".repeat(33),
                ..Default::default()
            },
        )
        .err()
        .expect("launch should fail");
    assert!(e.contains("BadMetadata"), "{e}");
    // emergency pause of the launchpad (BACKSTOP guardian)
    let g = parent.guardian.insecure_clone();
    let ix = Instruction::new_with_bytes(
        ids::CORE,
        &backstop_core::instruction::SetPauses { pauses: 4 }.data(),
        backstop_core::accounts::SetPauses {
            signer: g.pubkey(),
            market: pda::market(&parent.mint).0,
        }
        .to_account_metas(None),
    );
    env.send_ok(&[ix], &[&g]);
    let e = env
        .launch_child(&parent, &creator, ChildArgs::default())
        .err()
        .expect("launch should fail");
    assert!(e.contains("Paused"), "{e}");
}
