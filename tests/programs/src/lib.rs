//! LiteSVM test harness shared by all program integration tests.
//!
//! Programs are loaded from `$CARGO_TARGET_DIR/deploy/*.so`, so run
//! `anchor build` before `cargo test -p backstop-tests`.

#![allow(clippy::result_large_err)] // LiteSVM failure metadata is large; test-only code.

use std::path::PathBuf;

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::system_instruction;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use anchor_spl::associated_token::{
    get_associated_token_address_with_program_id, spl_associated_token_account,
};
use anchor_spl::token_2022::spl_token_2022 as t22;
use backstop_common::{cpi::hook_account_keys, defaults, ids, pda};
use litesvm::types::{FailedTransactionMetadata, TransactionMetadata};
pub use litesvm::LiteSVM;
pub use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
pub use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;
use t22::extension::{ExtensionType, StateWithExtensionsOwned};

pub mod flows;
pub mod launch;
pub mod market;

pub const START_TS: i64 = 1_800_000_000;
pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

pub type TxResult = std::result::Result<TransactionMetadata, FailedTransactionMetadata>;

/// Path of a built program.
fn so_path(name: &str) -> PathBuf {
    let target = std::env::var("CARGO_TARGET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target"));
    target.join("deploy").join(format!("{name}.so"))
}

pub struct Env {
    pub svm: LiteSVM,
    pub payer: Keypair,
    pub governance: Keypair,
}

impl Default for Env {
    fn default() -> Self {
        Self::new()
    }
}

impl Env {
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();
        let programs = [
            ("backstop_hook", ids::HOOK),
            ("backstop_core", ids::CORE),
            ("backstop_amm", ids::AMM),
            ("backstop_offers", ids::OFFERS),
            ("backstop_chest", ids::CHEST),
            ("backstop_launchpad", ids::LAUNCHPAD),
            ("mock_swap", ids::MOCK_SWAP),
            ("mock_lending", ids::MOCK_LENDING),
        ];
        for (name, id) in programs {
            let p = so_path(name);
            if p.exists() {
                let bytes = std::fs::read(&p).unwrap();
                svm.add_program(id, &bytes)
                    .unwrap_or_else(|e| panic!("load {name}: {e:?}"));
            }
        }
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 1_000 * LAMPORTS_PER_SOL)
            .unwrap();
        let governance = Keypair::new();
        svm.airdrop(&governance.pubkey(), 10 * LAMPORTS_PER_SOL)
            .unwrap();
        let mut env = Self {
            svm,
            payer,
            governance,
        };
        env.set_time(START_TS);
        env
    }

    // ---------- time ----------

    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    pub fn set_time(&mut self, ts: i64) {
        let mut c = self.svm.get_sysvar::<Clock>();
        c.unix_timestamp = ts;
        self.svm.set_sysvar::<Clock>(&c);
    }

    /// Advance wall-clock time and the slot (≈ 400 ms per slot).
    pub fn warp(&mut self, secs: i64) {
        let mut c = self.svm.get_sysvar::<Clock>();
        c.unix_timestamp += secs;
        let slots = (secs.max(1) as u64 * 5) / 2;
        c.slot += slots;
        self.svm.set_sysvar::<Clock>(&c);
        self.svm.warp_to_slot(c.slot);
        // warp_to_slot resets the clock's timestamp; restore it.
        let mut c2 = self.svm.get_sysvar::<Clock>();
        c2.unix_timestamp = c.unix_timestamp;
        self.svm.set_sysvar::<Clock>(&c2);
    }

    // ---------- transactions ----------

    pub fn send(&mut self, ixs: &[Instruction], signers: &[&Keypair]) -> TxResult {
        self.svm.expire_blockhash();
        let bh = self.svm.latest_blockhash();
        let msg = Message::new_with_blockhash(ixs, Some(&self.payer.pubkey()), &bh);
        let mut all: Vec<&Keypair> = vec![&self.payer];
        for s in signers {
            if s.pubkey() != self.payer.pubkey() && !all.iter().any(|k| k.pubkey() == s.pubkey()) {
                all.push(s);
            }
        }
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &all).expect("sign");
        self.svm.send_transaction(tx)
    }

    pub fn send_ok(&mut self, ixs: &[Instruction], signers: &[&Keypair]) -> TransactionMetadata {
        match self.send(ixs, signers) {
            Ok(m) => m,
            Err(e) => panic!(
                "transaction failed: {:?}\nlogs:\n{}",
                e.err,
                e.meta.logs.join("\n")
            ),
        }
    }

    pub fn wallet(&mut self, sol: u64) -> Keypair {
        let k = Keypair::new();
        self.svm
            .airdrop(&k.pubkey(), sol * LAMPORTS_PER_SOL)
            .unwrap();
        k
    }

    // ---------- accounts ----------

    pub fn account_data(&self, key: &Pubkey) -> Option<Vec<u8>> {
        self.svm.get_account(key).map(|a| a.data)
    }

    pub fn exists(&self, key: &Pubkey) -> bool {
        self.svm
            .get_account(key)
            .map(|a| a.lamports > 0)
            .unwrap_or(false)
    }

    pub fn anchor_account<T: AccountDeserialize>(&self, key: &Pubkey) -> T {
        let data = self.account_data(key).expect("account missing");
        T::try_deserialize(&mut data.as_slice()).expect("deserialize")
    }

    pub fn zero_copy<T: bytemuck::Pod>(&self, key: &Pubkey) -> Option<T> {
        let data = self.account_data(key)?;
        let size = std::mem::size_of::<T>();
        if data.len() < 8 + size {
            return None;
        }
        Some(bytemuck::pod_read_unaligned::<T>(&data[8..8 + size]))
    }

    pub fn token_balance(&self, ata: &Pubkey) -> u64 {
        let data = self.account_data(ata).expect("token account missing");
        StateWithExtensionsOwned::<t22::state::Account>::unpack(data)
            .map(|s| s.base.amount)
            .unwrap_or_else(|_| {
                // classic SPL token account
                u64::from_le_bytes(data_slice(&self.account_data(ata).unwrap(), 64))
            })
    }

    pub fn lamports(&self, key: &Pubkey) -> u64 {
        self.svm.get_account(key).map(|a| a.lamports).unwrap_or(0)
    }

    // ---------- Token-2022 engine mint ----------

    /// Create a Token-2022 mint whose transfer hook is the BACKSTOP hook
    /// (no hook authority, no freeze authority).
    pub fn create_engine_mint(&mut self, mint_authority: &Pubkey) -> Keypair {
        let mint = Keypair::new();
        let space = ExtensionType::try_calculate_account_len::<t22::state::Mint>(&[
            ExtensionType::TransferHook,
        ])
        .unwrap();
        let rent = self.svm.minimum_balance_for_rent_exemption(space);
        let ixs = vec![
            system_instruction::create_account(
                &self.payer.pubkey(),
                &mint.pubkey(),
                rent,
                space as u64,
                &ids::TOKEN_2022,
            ),
            t22::extension::transfer_hook::instruction::initialize(
                &ids::TOKEN_2022,
                &mint.pubkey(),
                None,
                Some(ids::HOOK),
            )
            .unwrap(),
            t22::instruction::initialize_mint2(
                &ids::TOKEN_2022,
                &mint.pubkey(),
                mint_authority,
                None,
                defaults::DECIMALS,
            )
            .unwrap(),
        ];
        self.send_ok(&ixs, &[&mint]);
        mint
    }

    pub fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
        get_associated_token_address_with_program_id(owner, mint, &ids::TOKEN_2022)
    }

    pub fn ata_classic(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
        get_associated_token_address_with_program_id(owner, mint, &ids::TOKEN)
    }

    pub fn create_ata(&mut self, owner: &Pubkey, mint: &Pubkey) -> Pubkey {
        self.create_ata_with_program(owner, mint, &ids::TOKEN_2022)
    }

    pub fn create_ata_with_program(
        &mut self,
        owner: &Pubkey,
        mint: &Pubkey,
        token_program: &Pubkey,
    ) -> Pubkey {
        let ix =
            spl_associated_token_account::instruction::create_associated_token_account_idempotent(
                &self.payer.pubkey(),
                owner,
                mint,
                token_program,
            );
        self.send_ok(&[ix], &[]);
        get_associated_token_address_with_program_id(owner, mint, token_program)
    }

    /// Plain (non-ATA) Token-2022 account *without* ImmutableOwner.
    pub fn create_mutable_owner_account(&mut self, owner: &Pubkey, mint: &Pubkey) -> Pubkey {
        let acct = Keypair::new();
        let space = ExtensionType::try_calculate_account_len::<t22::state::Account>(&[
            ExtensionType::TransferHookAccount,
        ])
        .unwrap();
        let rent = self.svm.minimum_balance_for_rent_exemption(space);
        let ixs = vec![
            system_instruction::create_account(
                &self.payer.pubkey(),
                &acct.pubkey(),
                rent,
                space as u64,
                &ids::TOKEN_2022,
            ),
            t22::instruction::initialize_account3(&ids::TOKEN_2022, &acct.pubkey(), mint, owner)
                .unwrap(),
        ];
        self.send_ok(&ixs, &[&acct]);
        acct.pubkey()
    }

    pub fn mint_to(&mut self, mint: &Pubkey, authority: &Keypair, dest: &Pubkey, amount: u64) {
        let ix = t22::instruction::mint_to(
            &ids::TOKEN_2022,
            mint,
            dest,
            &authority.pubkey(),
            &[],
            amount,
        )
        .unwrap();
        self.send_ok(&[ix], &[authority]);
    }

    /// TransferChecked including the hook's extra accounts.
    pub fn transfer_ix(
        mint: &Pubkey,
        src: &Pubkey,
        src_owner: &Pubkey,
        dst: &Pubkey,
        dst_owner: &Pubkey,
        amount: u64,
    ) -> Instruction {
        let mut ix = t22::instruction::transfer_checked(
            &ids::TOKEN_2022,
            src,
            mint,
            dst,
            src_owner,
            &[],
            amount,
            defaults::DECIMALS,
        )
        .unwrap();
        ix.accounts.extend(hook_metas(mint, src_owner, dst_owner));
        ix
    }

    pub fn transfer(
        &mut self,
        mint: &Pubkey,
        from: &Keypair,
        to_owner: &Pubkey,
        amount: u64,
    ) -> TxResult {
        let src = Self::ata(&from.pubkey(), mint);
        let dst = Self::ata(to_owner, mint);
        self.crank_epochs_if_needed(mint);
        let ix = Self::transfer_ix(mint, &src, &from.pubkey(), &dst, to_owner, amount);
        self.send(&[ix], &[from])
    }

    /// Mirror of the SDK behaviour: if the reward state is more than the
    /// hook's inline catch-up bound behind, run the permissionless crank.
    pub fn crank_epochs_if_needed(&mut self, mint: &Pubkey) {
        let key = pda::reward_state(mint).0;
        if !self.exists(&key) {
            return;
        }
        let cfg = self.hook_config(mint);
        if !cfg.reward_ready {
            return;
        }
        let target = cfg.weight_params().epoch_at(self.now());
        loop {
            let rs = self.reward_state(mint);
            if target.saturating_sub(rs.last_epoch) <= backstop_hook::engine::INLINE_CATCH_UP {
                break;
            }
            let ix = Instruction::new_with_bytes(
                ids::HOOK,
                &backstop_hook::instruction::AdvanceEpochs { max_steps: 300 }.data(),
                backstop_hook::accounts::AdvanceEpochs {
                    config: pda::hook_config(mint).0,
                    reward_state: key,
                }
                .to_account_metas(None),
            );
            self.send_ok(&[ix], &[]);
        }
    }

    // ---------- hook ----------

    pub fn default_hook_args(&self) -> backstop_hook::instructions::InitializeArgs {
        backstop_hook::instructions::InitializeArgs {
            governance: self.governance.pubkey(),
            genesis_ts: self.now(),
            epoch_secs: defaults::EPOCH_SECS,
            tenure_cap_secs: defaults::TENURE_CAP_SECS,
            tenure_extra_bps: defaults::TENURE_EXTRA_BPS,
            absorb_tenure_bps: defaults::ABSORB_TENURE_BPS,
            direct_sell_cap: defaults::min_offer_size(defaults::TOTAL_SUPPLY),
            link_min_amount: 1_000_000_000,
            link_window_secs: defaults::LINK_WINDOW_SECS,
            direct_sell_window_secs: defaults::DIRECT_SELL_WINDOW_SECS,
        }
    }

    pub fn init_hook(
        &mut self,
        mint: &Pubkey,
        mint_authority: &Keypair,
        args: backstop_hook::instructions::InitializeArgs,
    ) {
        let ix = Instruction::new_with_bytes(
            ids::HOOK,
            &backstop_hook::instruction::Initialize { args }.data(),
            backstop_hook::accounts::Initialize {
                payer: self.payer.pubkey(),
                mint_authority: mint_authority.pubkey(),
                mint: *mint,
                config: pda::hook_config(mint).0,
                extra_metas: pda::extra_account_metas(mint).0,
                reward_state: pda::reward_state(mint).0,
                system_program: anchor_lang::solana_program::system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send_ok(&[ix], &[mint_authority]);
        for _ in 0..8 {
            let cfg: backstop_hook::state::HookConfig =
                self.anchor_account(&pda::hook_config(mint).0);
            if cfg.reward_ready {
                break;
            }
            let ix = Instruction::new_with_bytes(
                ids::HOOK,
                &backstop_hook::instruction::GrowRewardState {}.data(),
                backstop_hook::accounts::GrowRewardState {
                    payer: self.payer.pubkey(),
                    config: pda::hook_config(mint).0,
                    reward_state: pda::reward_state(mint).0,
                    system_program: anchor_lang::solana_program::system_program::ID,
                }
                .to_account_metas(None),
            );
            self.send_ok(&[ix], &[]);
        }
    }

    /// Fresh engine mint with an initialised hook; returns (mint, authority).
    pub fn setup_hook_mint(&mut self) -> (Pubkey, Keypair) {
        let auth = self.wallet(1);
        let mint = self.create_engine_mint(&auth.pubkey()).pubkey();
        let args = self.default_hook_args();
        self.init_hook(&mint, &auth, args);
        (mint, auth)
    }

    pub fn register_ix(
        &self,
        wallet: &Pubkey,
        mint: &Pubkey,
        token_accounts: &[Pubkey],
    ) -> Instruction {
        let mut metas = backstop_hook::accounts::RegisterHolder {
            payer: self.payer.pubkey(),
            wallet: *wallet,
            mint: *mint,
            config: pda::hook_config(mint).0,
            holder: pda::holder(mint, wallet).0,
            reward_state: pda::reward_state(mint).0,
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None);
        metas.extend(
            token_accounts
                .iter()
                .map(|k| AccountMeta::new_readonly(*k, false)),
        );
        Instruction::new_with_bytes(
            ids::HOOK,
            &backstop_hook::instruction::RegisterHolder {}.data(),
            metas,
        )
    }

    pub fn register(&mut self, wallet: &Keypair, mint: &Pubkey) -> TxResult {
        self.crank_epochs_if_needed(mint);
        let ata = Self::ata(&wallet.pubkey(), mint);
        let accts = if self.exists(&ata) { vec![ata] } else { vec![] };
        let ix = self.register_ix(&wallet.pubkey(), mint, &accts);
        self.send(&[ix], &[wallet])
    }

    pub fn holder(&self, mint: &Pubkey, wallet: &Pubkey) -> Option<backstop_hook::state::Holder> {
        let key = pda::holder(mint, wallet).0;
        if !self.exists(&key) {
            return None;
        }
        self.zero_copy(&key)
    }

    pub fn reward_state(&self, mint: &Pubkey) -> backstop_hook::state::RewardState {
        self.zero_copy(&pda::reward_state(mint).0)
            .expect("reward state")
    }

    pub fn hook_config(&self, mint: &Pubkey) -> backstop_hook::state::HookConfig {
        self.anchor_account(&pda::hook_config(mint).0)
    }
}

/// Extra hook account metas for a transfer from `src_owner` to `dst_owner`.
pub fn hook_metas(mint: &Pubkey, src_owner: &Pubkey, dst_owner: &Pubkey) -> Vec<AccountMeta> {
    hook_account_keys(mint, src_owner, dst_owner)
        .into_iter()
        .map(|(k, w)| {
            if w {
                AccountMeta::new(k, false)
            } else {
                AccountMeta::new_readonly(k, false)
            }
        })
        .collect()
}

fn data_slice(data: &[u8], off: usize) -> [u8; 8] {
    let mut b = [0u8; 8];
    b.copy_from_slice(&data[off..off + 8]);
    b
}

/// Assert a transaction failed with an Anchor error whose name appears in
/// the logs (e.g. "UnauthorizedProgram").
pub fn assert_fails_with(res: TxResult, needle: &str) {
    match res {
        Ok(_) => panic!("expected failure containing {needle:?}, but transaction succeeded"),
        Err(e) => {
            let logs = e.meta.logs.join("\n");
            assert!(
                logs.contains(needle) || format!("{:?}", e.err).contains(needle),
                "expected {needle:?} in error.\nerr: {:?}\nlogs:\n{logs}",
                e.err
            );
        }
    }
}
