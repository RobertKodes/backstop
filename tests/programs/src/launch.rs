//! Launchpad helpers: config, the 7-step child launch, wSOL plumbing.

use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_lang::solana_program::system_instruction;
use anchor_lang::{InstructionData, ToAccountMetas};
use anchor_spl::token::spl_token;
use backstop_common::{ids, pda};
use backstop_core::state::OracleConfig;

use crate::flows::{usdc_ata, ATA_PROGRAM, SYSTEM};
use crate::market::{Mkt, QUOTE_PER_SOL};
use crate::{Env, Keypair, Signer, TxResult};

pub struct ChildArgs {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub supply: u64,
    pub creator_bps: u16,
    pub liquidity_lamports: u64,
}

impl Default for ChildArgs {
    fn default() -> Self {
        Self {
            name: "Night Frog".into(),
            symbol: "FROG".into(),
            uri: "https://example.org/frog.json".into(),
            supply: 100_000_000 * 1_000_000_000,
            creator_bps: 500,
            liquidity_lamports: 6_000_000_000,
        }
    }
}

impl Env {
    /// Make sure the native mint exists (LiteSVM does not always create it).
    pub fn ensure_native_mint(&mut self) {
        if self.exists(&ids::WSOL) {
            return;
        }
        let mut data = vec![0u8; spl_token::state::Mint::LEN];
        let m = spl_token::state::Mint {
            mint_authority: None.into(),
            supply: 0,
            decimals: 9,
            is_initialized: true,
            freeze_authority: None.into(),
        };
        spl_token::state::Mint::pack(m, &mut data).unwrap();
        let acc = litesvm_account(
            data,
            ids::TOKEN,
            self.svm
                .minimum_balance_for_rent_exemption(spl_token::state::Mint::LEN),
        );
        self.svm.set_account(ids::WSOL, acc).unwrap();
    }

    /// Wrap `lamports` into the owner's wSOL ATA.
    pub fn wrap_sol(&mut self, owner: &Keypair, lamports: u64) -> Pubkey {
        self.ensure_native_mint();
        let ata = self.create_ata_with_program(&owner.pubkey(), &ids::WSOL, &ids::TOKEN);
        let ixs = vec![
            system_instruction::transfer(&owner.pubkey(), &ata, lamports),
            spl_token::instruction::sync_native(&ids::TOKEN, &ata).unwrap(),
        ];
        self.send_ok(&ixs, &[owner]);
        ata
    }

    pub fn init_launchpad(&mut self, parent: &Mkt) {
        let gov = self.governance.insecure_clone();
        let ix = Instruction::new_with_bytes(
            ids::LAUNCHPAD,
            &backstop_launchpad::instruction::InitLaunchpad {
                args: backstop_launchpad::instructions::LaunchpadArgs {
                    child_guardian: parent.guardian.pubkey(),
                    child_keeper: parent.keeper.pubkey(),
                    swap_program: ids::MOCK_SWAP,
                    oracle: OracleConfig {
                        kind: 0,
                        feed: Pubkey::default(),
                        manual_quote_per_sol: QUOTE_PER_SOL,
                        max_staleness_secs: 120,
                    },
                },
            }
            .data(),
            backstop_launchpad::accounts::InitLaunchpad {
                governance: gov.pubkey(),
                parent_market: pda::market(&parent.mint).0,
                config: pda::launchpad().0,
                system_program: SYSTEM,
            }
            .to_account_metas(None),
        );
        self.send_ok(&[ix], &[&gov]);
    }

    pub fn create_child_ix(
        &self,
        parent: &Mkt,
        creator: &Pubkey,
        mint: &Pubkey,
        a: &ChildArgs,
    ) -> Instruction {
        Instruction::new_with_bytes(
            ids::LAUNCHPAD,
            &backstop_launchpad::instruction::CreateChild {
                params: backstop_launchpad::instructions::ChildParams {
                    name: a.name.clone(),
                    symbol: a.symbol.clone(),
                    uri: a.uri.clone(),
                    supply: a.supply,
                    creator_bps: a.creator_bps,
                    liquidity_lamports: a.liquidity_lamports,
                },
            }
            .data(),
            backstop_launchpad::accounts::CreateChild {
                creator: *creator,
                mint: *mint,
                config: pda::launchpad().0,
                parent_market: pda::market(&parent.mint).0,
                mint_authority: pda::child_mint_authority(mint).0,
                child: pda::child(mint).0,
                token_program: ids::TOKEN_2022,
                system_program: SYSTEM,
            }
            .to_account_metas(None),
        )
    }

    /// Run every launch step; returns the child as a `Mkt` (quote = wSOL).
    pub fn launch_child(
        &mut self,
        parent: &Mkt,
        creator: &Keypair,
        a: ChildArgs,
    ) -> Result<Mkt, String> {
        let mint_kp = Keypair::new();
        let mint = mint_kp.pubkey();
        let c = creator.pubkey();
        let err = |e: crate::TxResult| e.map(|_| ()).map_err(|f| f.meta.logs.join("\n"));
        err(self.send(
            &[self.create_child_ix(parent, &c, &mint, &a)],
            &[creator, &mint_kp],
        ))?;
        // 2. hook (+ grow reward state)
        let ix = Instruction::new_with_bytes(
            ids::LAUNCHPAD,
            &backstop_launchpad::instruction::InitChildHook {}.data(),
            backstop_launchpad::accounts::InitChildHook {
                creator: c,
                config: pda::launchpad().0,
                child: pda::child(&mint).0,
                mint,
                mint_authority: pda::child_mint_authority(&mint).0,
                hook_config: pda::hook_config(&mint).0,
                extra_metas: pda::extra_account_metas(&mint).0,
                reward_state: pda::reward_state(&mint).0,
                hook_program: ids::HOOK,
                system_program: SYSTEM,
            }
            .to_account_metas(None),
        );
        err(self.send(&[ix], &[creator]))?;
        for _ in 0..8 {
            if self.hook_config(&mint).reward_ready {
                break;
            }
            let ix = Instruction::new_with_bytes(
                ids::HOOK,
                &backstop_hook::instruction::GrowRewardState {}.data(),
                backstop_hook::accounts::GrowRewardState {
                    payer: c,
                    config: pda::hook_config(&mint).0,
                    reward_state: pda::reward_state(&mint).0,
                    system_program: SYSTEM,
                }
                .to_account_metas(None),
            );
            err(self.send(&[ix], &[creator]))?;
        }
        // 3. mint supply
        let pool = pda::pool(&mint).0;
        let vesting = pda::vesting(&mint).0;
        let ix = Instruction::new_with_bytes(
            ids::LAUNCHPAD,
            &backstop_launchpad::instruction::MintChildSupply { vesting_secs: 0 }.data(),
            backstop_launchpad::accounts::MintChildSupply {
                creator: c,
                child: pda::child(&mint).0,
                mint,
                mint_authority: pda::child_mint_authority(&mint).0,
                hook_config: pda::hook_config(&mint).0,
                pool_authority: pool,
                pool_vault: Env::ata(&pool, &mint),
                vesting_authority: vesting,
                vesting_vault: Env::ata(&vesting, &mint),
                token_program: ids::TOKEN_2022,
                associated_token_program: ATA_PROGRAM,
                system_program: SYSTEM,
            }
            .to_account_metas(None),
        );
        err(self.send(&[ix], &[creator]))?;
        // 4. market
        self.ensure_native_mint();
        let market = pda::market(&mint).0;
        let treasury = pda::treasury(&mint).0;
        let ix = Instruction::new_with_bytes(
            ids::LAUNCHPAD,
            &backstop_launchpad::instruction::InitChildMarket {}.data(),
            backstop_launchpad::accounts::InitChildMarket {
                creator: c,
                config: pda::launchpad().0,
                child: pda::child(&mint).0,
                mint,
                hook_config: pda::hook_config(&mint).0,
                quote_mint: ids::WSOL,
                market,
                treasury,
                fee_vault: usdc_ata(&market, &ids::WSOL),
                treasury_quote_vault: usdc_ata(&treasury, &ids::WSOL),
                parent_vault: pda::parent_vault(&mint).0,
                quote_token_program: ids::TOKEN,
                associated_token_program: ATA_PROGRAM,
                system_program: SYSTEM,
                core_program: ids::CORE,
            }
            .to_account_metas(None),
        );
        err(self.send(&[ix], &[creator]))?;
        // 5. pool (creator funds wSOL liquidity)
        let wsol = self.wrap_sol(creator, a.liquidity_lamports);
        let ix = Instruction::new_with_bytes(
            ids::LAUNCHPAD,
            &backstop_launchpad::instruction::InitChildPool {}.data(),
            backstop_launchpad::accounts::InitChildPool {
                creator: c,
                config: pda::launchpad().0,
                child: pda::child(&mint).0,
                market,
                mint,
                quote_mint: ids::WSOL,
                pool,
                amm_base_vault: Env::ata(&pool, &mint),
                quote_vault: usdc_ata(&pool, &ids::WSOL),
                creator_wsol: wsol,
                base_token_program: ids::TOKEN_2022,
                quote_token_program: ids::TOKEN,
                associated_token_program: ATA_PROGRAM,
                system_program: SYSTEM,
                amm_program: ids::AMM,
            }
            .to_account_metas(None),
        );
        err(self.send(&[ix], &[creator]))?;
        // 6. book
        let book = pda::book(&mint).0;
        let ix = Instruction::new_with_bytes(
            ids::LAUNCHPAD,
            &backstop_launchpad::instruction::InitChildBook {}.data(),
            backstop_launchpad::accounts::InitChildBook {
                creator: c,
                config: pda::launchpad().0,
                child: pda::child(&mint).0,
                market,
                mint,
                quote_mint: ids::WSOL,
                book,
                escrow_vault: Env::ata(&book, &mint),
                base_token_program: ids::TOKEN_2022,
                associated_token_program: ATA_PROGRAM,
                system_program: SYSTEM,
                offers_program: ids::OFFERS,
            }
            .to_account_metas(None),
        );
        err(self.send(&[ix], &[creator]))?;
        // 7. chests → live
        let cm = pda::chest_market(&mint).0;
        let ra = pda::rewards_vault_authority(&mint).0;
        let shield = pda::shield(&mint).0;
        let ix = Instruction::new_with_bytes(
            ids::LAUNCHPAD,
            &backstop_launchpad::instruction::InitChildChests {}.data(),
            backstop_launchpad::accounts::InitChildChests {
                creator: c,
                config: pda::launchpad().0,
                child: pda::child(&mint).0,
                market,
                mint,
                quote_mint: ids::WSOL,
                chest_market: cm,
                vault: usdc_ata(&cm, &ids::WSOL),
                rewards_auth: ra,
                holder_rewards_vault: usdc_ata(&ra, &ids::WSOL),
                shield,
                shield_quote_vault: usdc_ata(&shield, &ids::WSOL),
                shield_token_vault: Env::ata(&shield, &mint),
                shield_rewards_vault: pda::shield_rewards_vault(&mint).0,
                base_token_program: ids::TOKEN_2022,
                quote_token_program: ids::TOKEN,
                associated_token_program: ATA_PROGRAM,
                system_program: SYSTEM,
                chest_program: ids::CHEST,
            }
            .to_account_metas(None),
        );
        err(self.send(&[ix], &[creator]))?;
        Ok(Mkt {
            mint,
            quote: ids::WSOL,
            quote_authority: Keypair::new(),
            keeper: parent.keeper.insecure_clone(),
            guardian: parent.guardian.insecure_clone(),
        })
    }

    pub fn child(&self, mint: &Pubkey) -> backstop_launchpad::state::ChildLaunch {
        self.anchor_account(&pda::child(mint).0)
    }

    pub fn claim_vested(&mut self, creator: &Keypair, mint: &Pubkey) -> TxResult {
        let vesting = pda::vesting(mint).0;
        let mut metas = backstop_launchpad::accounts::ClaimVested {
            creator: creator.pubkey(),
            child: pda::child(mint).0,
            mint: *mint,
            vesting_authority: vesting,
            vesting_vault: Env::ata(&vesting, mint),
            creator_token: Env::ata(&creator.pubkey(), mint),
            token_program: ids::TOKEN_2022,
        }
        .to_account_metas(None);
        metas.extend(crate::hook_metas(mint, &vesting, &creator.pubkey()));
        let ix = Instruction::new_with_bytes(
            ids::LAUNCHPAD,
            &backstop_launchpad::instruction::ClaimVested {}.data(),
            metas,
        );
        self.send(&[ix], &[creator])
    }
}

fn litesvm_account(data: Vec<u8>, owner: Pubkey, lamports: u64) -> solana_account::Account {
    solana_account::Account {
        lamports,
        data,
        owner,
        executable: false,
        rent_epoch: 0,
    }
}
