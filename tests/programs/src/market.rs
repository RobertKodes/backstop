//! Market genesis and AMM helpers for integration tests.

use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_lang::solana_program::system_instruction;
use anchor_lang::{InstructionData, ToAccountMetas};
use anchor_spl::associated_token::get_associated_token_address_with_program_id;
use anchor_spl::token::spl_token;
use anchor_spl::token_2022::spl_token_2022 as t22;
use backstop_common::{defaults, ids, pda};
use backstop_core::state::{Market, MarketParams, OracleConfig};

use crate::{hook_metas, Env, Keypair, Signer, TxResult};

pub const USDC: u64 = 1_000_000; // 6 decimals
pub const TOKEN: u64 = 1_000_000_000; // 9 decimals
/// Manual oracle price used in tests: 150 USDC per SOL.
pub const QUOTE_PER_SOL: u64 = 150 * USDC;

/// Everything a test needs to talk to one market.
pub struct Mkt {
    pub mint: Pubkey,
    pub quote: Pubkey,
    pub quote_authority: Keypair,
    pub keeper: Keypair,
    pub guardian: Keypair,
}

pub struct GenesisOpts {
    pub supply: u64,
    pub quote_liquidity: u64,
    pub params: Option<MarketParams>,
}

impl Default for GenesisOpts {
    fn default() -> Self {
        // 1B tokens against 100k USDC → 0.0001 USDC per token
        Self {
            supply: defaults::TOTAL_SUPPLY,
            quote_liquidity: 100_000 * USDC,
            params: None,
        }
    }
}

impl Env {
    // ---------- classic SPL mints (USDC stand-in) ----------

    pub fn create_classic_mint(&mut self, authority: &Pubkey, decimals: u8) -> Pubkey {
        let mint = Keypair::new();
        let space = spl_token::state::Mint::LEN;
        let rent = self.svm.minimum_balance_for_rent_exemption(space);
        let ixs = vec![
            system_instruction::create_account(
                &self.payer.pubkey(),
                &mint.pubkey(),
                rent,
                space as u64,
                &ids::TOKEN,
            ),
            spl_token::instruction::initialize_mint2(
                &ids::TOKEN,
                &mint.pubkey(),
                authority,
                None,
                decimals,
            )
            .unwrap(),
        ];
        self.send_ok(&ixs, &[&mint]);
        mint.pubkey()
    }

    pub fn mint_classic(
        &mut self,
        mint: &Pubkey,
        authority: &Keypair,
        owner: &Pubkey,
        amount: u64,
    ) -> Pubkey {
        let ata = self.create_ata_with_program(owner, mint, &ids::TOKEN);
        let ix = spl_token::instruction::mint_to(
            &ids::TOKEN,
            mint,
            &ata,
            &authority.pubkey(),
            &[],
            amount,
        )
        .unwrap();
        self.send_ok(&[ix], &[authority]);
        ata
    }

    // ---------- genesis ----------

    pub fn init_market_ix(
        &self,
        mint: &Pubkey,
        quote: &Pubkey,
        authority: &Pubkey,
        args: backstop_core::instructions::InitMarketArgs,
    ) -> Instruction {
        let market = pda::market(mint).0;
        let treasury = pda::treasury(mint).0;
        Instruction::new_with_bytes(
            ids::CORE,
            &backstop_core::instruction::InitMarket { args }.data(),
            backstop_core::accounts::InitMarket {
                payer: self.payer.pubkey(),
                authority: *authority,
                mint: *mint,
                hook_config: pda::hook_config(mint).0,
                quote_mint: *quote,
                market,
                treasury,
                fee_vault: get_associated_token_address_with_program_id(
                    &market,
                    quote,
                    &ids::TOKEN,
                ),
                treasury_quote_vault: get_associated_token_address_with_program_id(
                    &treasury,
                    quote,
                    &ids::TOKEN,
                ),
                parent_vault: pda::parent_vault(mint).0,
                quote_token_program: ids::TOKEN,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::solana_program::system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn market_args(
        &self,
        keeper: &Pubkey,
        guardian: &Pubkey,
        params: Option<MarketParams>,
    ) -> backstop_core::instructions::InitMarketArgs {
        backstop_core::instructions::InitMarketArgs {
            governance: self.governance.pubkey(),
            guardian: *guardian,
            keeper: *keeper,
            swap_program: ids::MOCK_SWAP,
            oracle: OracleConfig {
                kind: 0,
                feed: Pubkey::default(),
                manual_quote_per_sol: QUOTE_PER_SOL,
                max_staleness_secs: 120,
            },
            params,
            parent: Pubkey::default(),
        }
    }

    /// Engine mint + hook, full supply minted into the pool vault, mint
    /// authority revoked. Returns (mint, deployer).
    pub fn engine_mint_with_supply(&mut self, supply: u64) -> (Pubkey, Keypair) {
        let deployer = self.wallet(5);
        let mint = self.create_engine_mint(&deployer.pubkey()).pubkey();
        let args = self.default_hook_args();
        self.init_hook(&mint, &deployer, args);
        let pool = pda::pool(&mint).0;
        let vault = self.create_ata(&pool, &mint);
        self.mint_to(&mint, &deployer, &vault, supply);
        let revoke = t22::instruction::set_authority(
            &ids::TOKEN_2022,
            &mint,
            None,
            t22::instruction::AuthorityType::MintTokens,
            &deployer.pubkey(),
            &[],
        )
        .unwrap();
        self.send_ok(&[revoke], &[&deployer]);
        (mint, deployer)
    }

    /// Full market genesis: hook, core market, AMM pool.
    pub fn genesis(&mut self, opts: GenesisOpts) -> Mkt {
        let quote_authority = self.wallet(1);
        let quote = self.create_classic_mint(&quote_authority.pubkey(), 6);
        let (mint, _deployer) = self.engine_mint_with_supply(opts.supply);
        let keeper = self.wallet(10);
        let guardian = self.wallet(1);
        let args = self.market_args(&keeper.pubkey(), &guardian.pubkey(), opts.params);
        let gov = self.governance.insecure_clone();
        let ix = self.init_market_ix(&mint, &quote, &gov.pubkey(), args);
        self.send_ok(&[ix], &[&gov]);
        // seed liquidity from governance
        let gov_quote = self.mint_classic(
            &quote,
            &quote_authority,
            &gov.pubkey(),
            opts.quote_liquidity,
        );
        let pool = pda::pool(&mint).0;
        let ix = Instruction::new_with_bytes(
            ids::AMM,
            &backstop_amm::instruction::InitPool {
                quote_amount: opts.quote_liquidity,
            }
            .data(),
            backstop_amm::accounts::InitPool {
                payer: gov.pubkey(),
                authority: gov.pubkey(),
                market: pda::market(&mint).0,
                mint,
                quote_mint: quote,
                pool,
                amm_base_vault: Env::ata(&pool, &mint),
                quote_vault: get_associated_token_address_with_program_id(
                    &pool,
                    &quote,
                    &ids::TOKEN,
                ),
                payer_quote: gov_quote,
                base_token_program: ids::TOKEN_2022,
                quote_token_program: ids::TOKEN,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::solana_program::system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send_ok(&[ix], &[&gov]);
        Mkt {
            mint,
            quote,
            quote_authority,
            keeper,
            guardian,
        }
    }

    pub fn market(&self, mint: &Pubkey) -> Market {
        self.anchor_account(&pda::market(mint).0)
    }

    pub fn pool(&self, mint: &Pubkey) -> backstop_amm::state::Pool {
        self.zero_copy(&pda::pool(mint).0).expect("pool")
    }

    /// A wallet with SOL, an ATA for the engine mint and `usdc` quote tokens.
    pub fn trader(&mut self, m: &Mkt, usdc: u64) -> Keypair {
        let w = self.wallet(5);
        self.create_ata(&w.pubkey(), &m.mint);
        let qa = m.quote_authority.insecure_clone();
        self.mint_classic(&m.quote, &qa, &w.pubkey(), usdc);
        w
    }

    pub fn usdc_balance(&self, owner: &Pubkey, quote: &Pubkey) -> u64 {
        let ata = get_associated_token_address_with_program_id(owner, quote, &ids::TOKEN);
        if !self.exists(&ata) {
            return 0;
        }
        self.token_balance(&ata)
    }

    fn swap_accounts(&self, m: &Mkt, user: &Pubkey) -> backstop_amm::accounts::Swap {
        let pool = pda::pool(&m.mint).0;
        let market: Market = self.market(&m.mint);
        backstop_amm::accounts::Swap {
            user: *user,
            market: pda::market(&m.mint).0,
            pool,
            mint: m.mint,
            quote_mint: m.quote,
            base_vault: Env::ata(&pool, &m.mint),
            quote_vault: get_associated_token_address_with_program_id(&pool, &m.quote, &ids::TOKEN),
            fee_vault: market.fee_vault,
            user_base: Env::ata(user, &m.mint),
            user_quote: get_associated_token_address_with_program_id(user, &m.quote, &ids::TOKEN),
            base_token_program: ids::TOKEN_2022,
            quote_token_program: ids::TOKEN,
        }
    }

    pub fn buy_ix(&self, m: &Mkt, user: &Pubkey, quote_in: u64, min_out: u64) -> Instruction {
        let mut metas = self.swap_accounts(m, user).to_account_metas(None);
        metas.extend(hook_metas(&m.mint, &pda::pool(&m.mint).0, user));
        Instruction::new_with_bytes(
            ids::AMM,
            &backstop_amm::instruction::Buy {
                quote_in,
                min_base_out: min_out,
            }
            .data(),
            metas,
        )
    }

    pub fn sell_ix(&self, m: &Mkt, user: &Pubkey, base_in: u64, min_out: u64) -> Instruction {
        let mut metas = self.swap_accounts(m, user).to_account_metas(None);
        metas.extend(hook_metas(&m.mint, user, &pda::pool(&m.mint).0));
        Instruction::new_with_bytes(
            ids::AMM,
            &backstop_amm::instruction::Sell {
                base_in,
                min_quote_out: min_out,
            }
            .data(),
            metas,
        )
    }

    pub fn buy(&mut self, m: &Mkt, user: &Keypair, quote_in: u64) -> TxResult {
        self.crank_epochs_if_needed(&m.mint);
        let ix = self.buy_ix(m, &user.pubkey(), quote_in, 0);
        self.send(&[ix], &[user])
    }

    pub fn sell(&mut self, m: &Mkt, user: &Keypair, base_in: u64) -> TxResult {
        self.crank_epochs_if_needed(&m.mint);
        let ix = self.sell_ix(m, &user.pubkey(), base_in, 0);
        self.send(&[ix], &[user])
    }
}
