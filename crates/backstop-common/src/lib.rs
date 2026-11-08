//! Shared constants for the BACKSTOP program suite.
//!
//! * [`ids`] – program IDs (must match each program's `declare_id!`).
//! * [`seeds`] – every PDA seed prefix, documented in `docs/ACCOUNTS.md`.
//! * [`pda`] – canonical derivations used by programs (at init), tests and
//!   off-chain tooling.
//! * [`defaults`] – default governable parameters (spec §3).

use anchor_lang::prelude::Pubkey;

pub mod cpi;

pub mod ids {
    use super::Pubkey;

    pub const HOOK: Pubkey = Pubkey::from_str_const("g86T56A9yM46y5cyVCVzB1K6MtV5cx89DsFiapy59eP");
    pub const CORE: Pubkey = Pubkey::from_str_const("AstnKdypNsaRAxX88cTCDCit11mCqeRRnQ2x6cfZJFzK");
    pub const AMM: Pubkey = Pubkey::from_str_const("8m9GWYsGaqmGECJnN6kipQXiaJfk8t2MhS8U5LugUw8b");
    pub const OFFERS: Pubkey =
        Pubkey::from_str_const("DW1bgui9AwKGmBxRryjGn6CtKYfo2aXuyeHXLxzewGj");
    pub const CHEST: Pubkey =
        Pubkey::from_str_const("5Hwrxz9JJoGxcZNSzP7TTAju2C2KMPtNBHtdifnU3tB5");
    pub const LAUNCHPAD: Pubkey =
        Pubkey::from_str_const("ZzoHe1DMEHWDVnHQs7UnHJF8p6pdRVpk7629ygyLEXU");
    /// Test-only stand-ins for Jupiter and Kamino (never deployed to mainnet).
    pub const MOCK_SWAP: Pubkey =
        Pubkey::from_str_const("6Z91SCsTwG12QF5A52G2TcvWXSrzToVe4d574TX3CHVg");
    pub const MOCK_LENDING: Pubkey =
        Pubkey::from_str_const("CFjsjWmeiniEPZoqm7sfRZErbTdAk5sHmQ2HTdBYyCwu");

    /// Token-2022 program.
    pub const TOKEN_2022: Pubkey =
        Pubkey::from_str_const("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
    /// Classic SPL Token program (USDC, wSOL).
    pub const TOKEN: Pubkey = Pubkey::from_str_const("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    /// Mainnet USDC mint.
    pub const USDC_MAINNET: Pubkey =
        Pubkey::from_str_const("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    /// Wrapped SOL mint.
    pub const WSOL: Pubkey = Pubkey::from_str_const("So11111111111111111111111111111111111111112");
    /// Jupiter v6 aggregator program.
    pub const JUPITER_V6: Pubkey =
        Pubkey::from_str_const("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
    /// Kamino Lend program.
    pub const KAMINO_LEND: Pubkey =
        Pubkey::from_str_const("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");

    /// Programs allowed to be the top-level instruction of a token movement
    /// (besides Token-2022 itself for direct wallet transfers).
    pub const PROTOCOL_PROGRAMS: [Pubkey; 5] = [CORE, AMM, OFFERS, CHEST, LAUNCHPAD];
}

pub mod seeds {
    // transfer-hook
    pub const HOOK_CONFIG: &[u8] = b"hook_config";
    pub const EXTRA_ACCOUNT_METAS: &[u8] = b"extra-account-metas";
    pub const HOLDER: &[u8] = b"holder";
    pub const REWARD_STATE: &[u8] = b"reward_state";
    // core
    pub const MARKET: &[u8] = b"market";
    pub const TREASURY: &[u8] = b"treasury";
    pub const AGENT: &[u8] = b"agent";
    pub const TIMELOCK: &[u8] = b"timelock";
    pub const PARENT_VAULT: &[u8] = b"parent_vault";
    // amm
    pub const POOL: &[u8] = b"pool";
    // offers
    pub const BOOK: &[u8] = b"book";
    pub const OFFER: &[u8] = b"offer";
    pub const BID: &[u8] = b"bid";
    pub const TICKET: &[u8] = b"ticket";
    // chest
    pub const CHEST_MARKET: &[u8] = b"chest_market";
    pub const CHEST: &[u8] = b"chest";
    pub const GRANT: &[u8] = b"grant";
    pub const SHIELD: &[u8] = b"shield";
    pub const SHIELD_POSITION: &[u8] = b"shield_pos";
    pub const REWARDS_VAULT_AUTH: &[u8] = b"rewards_auth";
    pub const SHIELD_REWARDS: &[u8] = b"shield_rewards";
    pub const CHEST_VAULT: &[u8] = b"chest_vault";
    pub const SHIELD_VAULT: &[u8] = b"shield_vault";
    // launchpad
    pub const LAUNCHPAD: &[u8] = b"launchpad";
    pub const CHILD: &[u8] = b"child";
    pub const VESTING: &[u8] = b"vesting";
    pub const CHILD_MINT_AUTHORITY: &[u8] = b"child_mint_auth";
}

pub mod pda {
    use super::{ids, seeds, Pubkey};

    pub fn hook_config(mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::HOOK_CONFIG, mint.as_ref()], &ids::HOOK)
    }
    pub fn extra_account_metas(mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::EXTRA_ACCOUNT_METAS, mint.as_ref()], &ids::HOOK)
    }
    pub fn holder(mint: &Pubkey, wallet: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::HOLDER, mint.as_ref(), wallet.as_ref()], &ids::HOOK)
    }
    pub fn reward_state(mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::REWARD_STATE, mint.as_ref()], &ids::HOOK)
    }
    pub fn market(mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::MARKET, mint.as_ref()], &ids::CORE)
    }
    pub fn treasury(mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::TREASURY, mint.as_ref()], &ids::CORE)
    }
    pub fn agent(mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::AGENT, mint.as_ref()], &ids::CORE)
    }
    pub fn pool(mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::POOL, mint.as_ref()], &ids::AMM)
    }
    pub fn book(mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::BOOK, mint.as_ref()], &ids::OFFERS)
    }
    pub fn offer(mint: &Pubkey, id: u64) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[seeds::OFFER, mint.as_ref(), &id.to_le_bytes()],
            &ids::OFFERS,
        )
    }
    pub fn bid(offer: &Pubkey, wallet: &Pubkey, kind: u8) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[seeds::BID, offer.as_ref(), wallet.as_ref(), &[kind]],
            &ids::OFFERS,
        )
    }
    pub fn ticket(mint: &Pubkey, seller: &Pubkey, offer_id: u64) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[
                seeds::TICKET,
                mint.as_ref(),
                seller.as_ref(),
                &offer_id.to_le_bytes(),
            ],
            &ids::OFFERS,
        )
    }
    pub fn chest_market(mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::CHEST_MARKET, mint.as_ref()], &ids::CHEST)
    }
    pub fn chest(mint: &Pubkey, wallet: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::CHEST, mint.as_ref(), wallet.as_ref()], &ids::CHEST)
    }
    pub fn grant(mint: &Pubkey, wallet: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::GRANT, mint.as_ref(), wallet.as_ref()], &ids::CHEST)
    }
    pub fn shield(mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::SHIELD, mint.as_ref()], &ids::CHEST)
    }
    pub fn shield_position(mint: &Pubkey, wallet: &Pubkey, id: u32) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[
                seeds::SHIELD_POSITION,
                mint.as_ref(),
                wallet.as_ref(),
                &id.to_le_bytes(),
            ],
            &ids::CHEST,
        )
    }
    pub fn rewards_vault_authority(mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::REWARDS_VAULT_AUTH, mint.as_ref()], &ids::CHEST)
    }
    pub fn shield_rewards_vault(mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::SHIELD_REWARDS, mint.as_ref()], &ids::CHEST)
    }
    pub fn parent_vault(mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::PARENT_VAULT, mint.as_ref()], &ids::CORE)
    }
    pub fn timelock(mint: &Pubkey, id: u64) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[seeds::TIMELOCK, mint.as_ref(), &id.to_le_bytes()],
            &ids::CORE,
        )
    }
    pub fn launchpad() -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::LAUNCHPAD], &ids::LAUNCHPAD)
    }
    pub fn child(mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::CHILD, mint.as_ref()], &ids::LAUNCHPAD)
    }
    pub fn vesting(mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[seeds::VESTING, mint.as_ref()], &ids::LAUNCHPAD)
    }
    pub fn child_mint_authority(mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[seeds::CHILD_MINT_AUTHORITY, mint.as_ref()],
            &ids::LAUNCHPAD,
        )
    }

    /// Off-curve owners permitted to receive this market's tokens.
    pub fn protocol_owners(mint: &Pubkey) -> [Pubkey; 5] {
        [
            pool(mint).0,
            book(mint).0,
            chest_market(mint).0,
            shield(mint).0,
            vesting(mint).0,
        ]
    }
}

/// Default parameter values (spec §3). Every one is governable.
pub mod defaults {
    pub const DECIMALS: u8 = 9;
    pub const TOTAL_SUPPLY: u64 = 1_000_000_000 * 1_000_000_000; // 1e9 tokens × 1e9
    pub const TRADE_FEE_BPS: u32 = 300;
    pub const SPLIT_CHEST_BPS: u32 = 7_000;
    pub const SPLIT_SHIELD_BPS: u32 = 1_000;
    // treasury receives the remainder: 2_000
    pub const BASE_DISCOUNT_BPS: u32 = 500;
    pub const DISCOUNT_K_UP_BPS: u32 = 2_500;
    pub const DISCOUNT_K_DOWN_BPS: u32 = 1_500;
    pub const DISCOUNT_MIN_BPS: u32 = 200;
    pub const DISCOUNT_MAX_BPS: u32 = 1_200;
    pub const OFFER_WINDOW_SECS: u32 = 600;
    pub const BID_EPOCH_SECS: u32 = 60;
    pub const MIN_OFFER_BPS_OF_SUPPLY: u32 = 1; // 0.01 %
    pub const LOTS_PER_OFFER: u32 = 100;
    pub const TENURE_CAP_SECS: u64 = 90 * 86_400;
    pub const TENURE_EXTRA_BPS: u32 = 20_000; // multiplier range 1.0–3.0
    pub const ABSORB_TENURE_BPS: u32 = 4_000;
    pub const TICKET_VALIDITY_SECS: u32 = 7 * 86_400;
    pub const CHEST_LOCK_SECS: u32 = 60 * 86_400;
    pub const CHEST_EARLY_PENALTY_BPS: u32 = 2_500;
    pub const REDEMPTION_FEE_BPS: u32 = 100;
    pub const LAUNCHPAD_PARENT_BPS: u32 = 3_000;
    pub const EPOCH_SECS: u64 = 6 * 3_600;
    pub const YIELD_BUFFER_BPS: u32 = 2_000;
    pub const SHIELD_MAX_SHARE_BPS: u32 = 5_000;
    pub const SHIELD_MIN_LOCK_SECS: u32 = 30 * 86_400;
    pub const SHIELD_MAX_MULTIPLIER_BPS: u32 = 120_000;
    pub const PRICE_TWAP_WINDOW_SECS: u32 = 300;
    pub const MOMENTUM_LOOKBACK_SECS: u32 = 3_600;
    pub const TWAP_OBS_INTERVAL_SECS: u32 = 60;
    pub const LINK_WINDOW_SECS: u64 = 86_400;
    pub const DIRECT_SELL_WINDOW_SECS: u64 = 86_400;
    pub const GOVERNANCE_TIMELOCK_SECS: i64 = 48 * 3_600;
    pub const AGENT_COOLDOWN_SECS: i64 = 3_600;
    pub const RAND_SLOT_DELAY: u64 = 4;
    pub const CHILD_MIN_LIQUIDITY_LAMPORTS: u64 = 5_000_000_000;
    pub const CHILD_MAX_CREATOR_BPS: u32 = 500;
    pub const CHILD_VESTING_SECS: i64 = 90 * 86_400;

    /// Minimum offer size in base units for a given supply.
    pub const fn min_offer_size(supply: u64) -> u64 {
        supply / 10_000 * MIN_OFFER_BPS_OF_SUPPLY as u64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_distinct() {
        let all = [
            ids::HOOK,
            ids::CORE,
            ids::AMM,
            ids::OFFERS,
            ids::CHEST,
            ids::LAUNCHPAD,
            ids::MOCK_SWAP,
            ids::MOCK_LENDING,
        ];
        for (i, a) in all.iter().enumerate() {
            for b in &all[i + 1..] {
                assert_ne!(a, b);
            }
        }
    }

    #[test]
    fn protocol_owners_are_off_curve() {
        let mint = Pubkey::new_unique();
        for o in pda::protocol_owners(&mint) {
            assert!(!o.is_on_curve());
        }
    }

    #[test]
    fn min_offer_is_one_bp() {
        assert_eq!(
            defaults::min_offer_size(defaults::TOTAL_SUPPLY),
            100_000 * 1_000_000_000
        );
    }
}
