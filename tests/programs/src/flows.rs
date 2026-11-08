//! Offer-book, chest, Shield, fee and yield helpers for lifecycle tests.

use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::{InstructionData, ToAccountMetas};
use anchor_spl::associated_token::get_associated_token_address_with_program_id as ata_with;
use backstop_common::{ids, pda};

use crate::market::Mkt;
use crate::{hook_metas, Env, Keypair, Signer, TxResult};

pub const SLOT_HASHES: Pubkey =
    Pubkey::from_str_const("SysvarS1otHashes111111111111111111111111111");
pub const SYSTEM: Pubkey = anchor_lang::solana_program::system_program::ID;
pub const ATA_PROGRAM: Pubkey = anchor_spl::associated_token::ID;

pub fn usdc_ata(owner: &Pubkey, quote: &Pubkey) -> Pubkey {
    ata_with(owner, quote, &ids::TOKEN)
}

impl Env {
    // ------------------------------------------------------------ genesis

    /// Market genesis plus offer book and chest market.
    pub fn full_genesis(&mut self, opts: crate::market::GenesisOpts) -> Mkt {
        let m = self.genesis(opts);
        let gov = self.governance.insecure_clone();
        let book = pda::book(&m.mint).0;
        let ix = Instruction::new_with_bytes(
            ids::OFFERS,
            &backstop_offers::instruction::InitBook {}.data(),
            backstop_offers::accounts::InitBook {
                payer: gov.pubkey(),
                authority: gov.pubkey(),
                market: pda::market(&m.mint).0,
                mint: m.mint,
                quote_mint: m.quote,
                book,
                escrow_vault: Env::ata(&book, &m.mint),
                base_token_program: ids::TOKEN_2022,
                associated_token_program: ATA_PROGRAM,
                system_program: SYSTEM,
            }
            .to_account_metas(None),
        );
        self.send_ok(&[ix], &[&gov]);
        let cm = pda::chest_market(&m.mint).0;
        let ra = pda::rewards_vault_authority(&m.mint).0;
        let shield = pda::shield(&m.mint).0;
        let ix = Instruction::new_with_bytes(
            ids::CHEST,
            &backstop_chest::instruction::InitChestMarket {}.data(),
            backstop_chest::accounts::InitChestMarket {
                payer: gov.pubkey(),
                authority: gov.pubkey(),
                market: pda::market(&m.mint).0,
                mint: m.mint,
                quote_mint: m.quote,
                chest_market: cm,
                vault: usdc_ata(&cm, &m.quote),
                rewards_auth: ra,
                holder_rewards_vault: usdc_ata(&ra, &m.quote),
                shield,
                shield_quote_vault: usdc_ata(&shield, &m.quote),
                shield_token_vault: Env::ata(&shield, &m.mint),
                shield_rewards_vault: pda::shield_rewards_vault(&m.mint).0,
                base_token_program: ids::TOKEN_2022,
                quote_token_program: ids::TOKEN,
                associated_token_program: ATA_PROGRAM,
                system_program: SYSTEM,
            }
            .to_account_metas(None),
        );
        self.send_ok(&[ix], &[&gov]);
        m
    }

    // ------------------------------------------------------------- offers

    pub fn book(&self, mint: &Pubkey) -> backstop_offers::state::OfferBook {
        self.anchor_account(&pda::book(mint).0)
    }

    pub fn offer(&self, mint: &Pubkey, id: u64) -> backstop_offers::state::Offer {
        self.anchor_account(&pda::offer(mint, id).0)
    }

    pub fn create_offer_ix(
        &self,
        m: &Mkt,
        seller: &Pubkey,
        amount: u64,
        message: &[u8],
    ) -> (Instruction, u64) {
        let id = self.book(&m.mint).next_offer_id;
        let offer = pda::offer(&m.mint, id).0;
        let book = pda::book(&m.mint).0;
        let mut metas = backstop_offers::accounts::CreateOffer {
            seller: *seller,
            market: pda::market(&m.mint).0,
            book,
            pool: pda::pool(&m.mint).0,
            mint: m.mint,
            quote_mint: m.quote,
            offer,
            bid_vault: usdc_ata(&offer, &m.quote),
            seller_token: Env::ata(seller, &m.mint),
            seller_quote: usdc_ata(seller, &m.quote),
            escrow_vault: Env::ata(&book, &m.mint),
            seller_holder: pda::holder(&m.mint, seller).0,
            base_token_program: ids::TOKEN_2022,
            quote_token_program: ids::TOKEN,
            associated_token_program: ATA_PROGRAM,
            system_program: SYSTEM,
        }
        .to_account_metas(None);
        metas.extend(hook_metas(&m.mint, seller, &book));
        let data = backstop_offers::instruction::CreateOffer {
            amount,
            message: message.to_vec(),
        }
        .data();
        (Instruction::new_with_bytes(ids::OFFERS, &data, metas), id)
    }

    pub fn create_offer(&mut self, m: &Mkt, seller: &Keypair, amount: u64) -> Result<u64, String> {
        self.crank_epochs_if_needed(&m.mint);
        let (ix, id) = self.create_offer_ix(m, &seller.pubkey(), amount, b"gm");
        self.send(&[ix], &[seller])
            .map(|_| id)
            .map_err(|e| e.meta.logs.join("\n"))
    }

    pub fn wallet_bid_ix(&self, m: &Mkt, id: u64, bidder: &Pubkey, amount: u64) -> Instruction {
        let offer = pda::offer(&m.mint, id).0;
        let o = self.offer(&m.mint, id);
        Instruction::new_with_bytes(
            ids::OFFERS,
            &backstop_offers::instruction::PlaceBid { amount, kind: 0 }.data(),
            backstop_offers::accounts::PlaceBid {
                rent_payer: *bidder,
                funder: *bidder,
                bidder: *bidder,
                market: pda::market(&m.mint).0,
                offer,
                mint: m.mint,
                quote_mint: m.quote,
                bid: pda::bid(&offer, bidder, 0).0,
                funder_quote: usdc_ata(bidder, &m.quote),
                refund_to: usdc_ata(bidder, &m.quote),
                bid_vault: usdc_ata(&offer, &m.quote),
                seller_holder: pda::holder(&m.mint, &o.seller).0,
                hook_config: pda::hook_config(&m.mint).0,
                quote_token_program: ids::TOKEN,
                system_program: SYSTEM,
            }
            .to_account_metas(None),
        )
    }

    pub fn wallet_bid(&mut self, m: &Mkt, id: u64, bidder: &Keypair, amount: u64) -> TxResult {
        let ix = self.wallet_bid_ix(m, id, &bidder.pubkey(), amount);
        self.send(&[ix], &[bidder])
    }

    pub fn close_bidding(&mut self, m: &Mkt, id: u64) -> TxResult {
        let ix = Instruction::new_with_bytes(
            ids::OFFERS,
            &backstop_offers::instruction::CloseBidding {}.data(),
            backstop_offers::accounts::CloseBidding {
                offer: pda::offer(&m.mint, id).0,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &[])
    }

    /// Provide the SlotHashes entry for the offer's committed slot and move
    /// past it (LiteSVM does not populate SlotHashes on its own).
    pub fn reveal_randomness(&mut self, m: &Mkt, id: u64, entropy: u8) {
        let o = self.offer(&m.mint, id);
        let mut c = self.svm.get_sysvar::<anchor_lang::prelude::Clock>();
        let target = o.rand_slot + 1;
        if c.slot < target {
            let ts = c.unix_timestamp;
            self.svm.warp_to_slot(target);
            c = self.svm.get_sysvar::<anchor_lang::prelude::Clock>();
            c.unix_timestamp = ts;
            self.svm.set_sysvar(&c);
        }
        // raw SlotHashes: len u64 + (slot u64, hash [32]) descending
        let mut data = Vec::with_capacity(8 + 3 * 40);
        data.extend_from_slice(&3u64.to_le_bytes());
        for (i, s) in [o.rand_slot + 1, o.rand_slot, o.rand_slot.saturating_sub(1)]
            .iter()
            .enumerate()
        {
            data.extend_from_slice(&s.to_le_bytes());
            data.extend_from_slice(&[entropy.wrapping_add(i as u8); 32]);
        }
        let mut acc = self.svm.get_account(&SLOT_HASHES).unwrap_or_default();
        acc.data = data;
        acc.lamports = acc.lamports.max(1_000_000_000);
        acc.owner = Pubkey::from_str_const("Sysvar1111111111111111111111111111111111111");
        self.svm.set_account(SLOT_HASHES, acc).unwrap();
    }

    pub fn settle_ix(&self, m: &Mkt, id: u64) -> Instruction {
        let o = self.offer(&m.mint, id);
        let offer = pda::offer(&m.mint, id).0;
        let book = pda::book(&m.mint).0;
        let shield = pda::shield(&m.mint).0;
        let market = self.market(&m.mint);
        let mut metas = backstop_chest::accounts::SettleOffer {
            payer: self.payer.pubkey(),
            market: pda::market(&m.mint).0,
            shield,
            pool: pda::pool(&m.mint).0,
            book,
            offer,
            mint: m.mint,
            quote_mint: m.quote,
            escrow_vault: Env::ata(&book, &m.mint),
            bid_vault: usdc_ata(&offer, &m.quote),
            seller_quote: o.seller_quote,
            fee_vault: market.fee_vault,
            shield_quote_vault: usdc_ata(&shield, &m.quote),
            shield_token_vault: Env::ata(&shield, &m.mint),
            ticket: pda::ticket(&m.mint, &o.seller, id).0,
            slot_hashes: SLOT_HASHES,
            offers_program: ids::OFFERS,
            base_token_program: ids::TOKEN_2022,
            quote_token_program: ids::TOKEN,
            system_program: SYSTEM,
        }
        .to_account_metas(None);
        metas.extend(hook_metas(&m.mint, &book, &shield));
        Instruction::new_with_bytes(
            ids::CHEST,
            &backstop_chest::instruction::SettleOffer {}.data(),
            metas,
        )
    }

    pub fn sell_remainder_ix(&self, m: &Mkt, id: u64) -> Instruction {
        let o = self.offer(&m.mint, id);
        let book = pda::book(&m.mint).0;
        let pool = pda::pool(&m.mint).0;
        let mut metas = backstop_offers::accounts::SellRemainder {
            cranker: self.payer.pubkey(),
            seller: o.seller,
            market: pda::market(&m.mint).0,
            book,
            offer: pda::offer(&m.mint, id).0,
            pool,
            mint: m.mint,
            quote_mint: m.quote,
            base_vault: Env::ata(&pool, &m.mint),
            quote_vault: usdc_ata(&pool, &m.quote),
            fee_vault: self.market(&m.mint).fee_vault,
            escrow_vault: Env::ata(&book, &m.mint),
            seller_quote: o.seller_quote,
            amm_program: ids::AMM,
            base_token_program: ids::TOKEN_2022,
            quote_token_program: ids::TOKEN,
        }
        .to_account_metas(None);
        metas.extend(hook_metas(&m.mint, &book, &pool));
        Instruction::new_with_bytes(
            ids::OFFERS,
            &backstop_offers::instruction::SellRemainder {}.data(),
            metas,
        )
    }

    /// close → reveal → settle (via chest) → sell remainder if any.
    pub fn finish_offer(&mut self, m: &Mkt, id: u64) {
        let o = self.offer(&m.mint, id);
        if self.now() < o.expires_at {
            let d = o.expires_at - self.now();
            self.warp(d);
        }
        self.close_bidding(m, id).expect("close");
        self.reveal_randomness(m, id, (id as u8).wrapping_mul(31).wrapping_add(7));
        let ix = self.settle_ix(m, id);
        self.send_ok(&[ix], &[]);
        if !self.offer(&m.mint, id).remainder_sold {
            let ix = self.sell_remainder_ix(m, id);
            self.send_ok(&[ix], &[]);
        }
    }

    pub fn claim_wallet_bid_ix(&self, m: &Mkt, id: u64, bidder: &Pubkey) -> Instruction {
        let offer = pda::offer(&m.mint, id).0;
        let book = pda::book(&m.mint).0;
        let bid = pda::bid(&offer, bidder, 0).0;
        let mut metas = backstop_offers::accounts::ClaimBid {
            claimer: self.payer.pubkey(),
            refund_authority: None,
            book,
            offer,
            bid,
            rent_payer: *bidder,
            mint: m.mint,
            quote_mint: m.quote,
            bidder_token: Env::ata(bidder, &m.mint),
            refund_to: usdc_ata(bidder, &m.quote),
            escrow_vault: Env::ata(&book, &m.mint),
            bid_vault: usdc_ata(&offer, &m.quote),
            hook_config: pda::hook_config(&m.mint).0,
            bidder_holder: pda::holder(&m.mint, bidder).0,
            reward_state: pda::reward_state(&m.mint).0,
            hook_program: ids::HOOK,
            base_token_program: ids::TOKEN_2022,
            quote_token_program: ids::TOKEN,
        }
        .to_account_metas(None);
        metas.extend(hook_metas(&m.mint, &book, bidder));
        Instruction::new_with_bytes(
            ids::OFFERS,
            &backstop_offers::instruction::Claim {}.data(),
            metas,
        )
    }

    pub fn claim_wallet_bid(&mut self, m: &Mkt, id: u64, bidder: &Pubkey) -> TxResult {
        let ix = self.claim_wallet_bid_ix(m, id, bidder);
        self.send(&[ix], &[])
    }

    pub fn ticket(&self, m: &Mkt, seller: &Pubkey, id: u64) -> backstop_offers::state::Ticket {
        self.anchor_account(&pda::ticket(&m.mint, seller, id).0)
    }

    pub fn ticket_buy_ix(&self, m: &Mkt, seller: &Pubkey, id: u64, quote_in: u64) -> Instruction {
        let pool = pda::pool(&m.mint).0;
        let mut metas = backstop_offers::accounts::UseTicket {
            buyer: *seller,
            ticket: pda::ticket(&m.mint, seller, id).0,
            book: pda::book(&m.mint).0,
            market: pda::market(&m.mint).0,
            pool,
            mint: m.mint,
            quote_mint: m.quote,
            base_vault: Env::ata(&pool, &m.mint),
            quote_vault: usdc_ata(&pool, &m.quote),
            fee_vault: self.market(&m.mint).fee_vault,
            buyer_quote: usdc_ata(seller, &m.quote),
            buyer_base: Env::ata(seller, &m.mint),
            amm_program: ids::AMM,
            base_token_program: ids::TOKEN_2022,
            quote_token_program: ids::TOKEN,
        }
        .to_account_metas(None);
        metas.extend(hook_metas(&m.mint, &pool, seller));
        Instruction::new_with_bytes(
            ids::OFFERS,
            &backstop_offers::instruction::BuyWithTicket {
                quote_in,
                min_base_out: 0,
            }
            .data(),
            metas,
        )
    }

    // -------------------------------------------------------------- chest

    pub fn chest_market(&self, mint: &Pubkey) -> backstop_chest::state::ChestMarket {
        self.anchor_account(&pda::chest_market(mint).0)
    }

    pub fn chest(&self, mint: &Pubkey, owner: &Pubkey) -> backstop_chest::state::Chest {
        self.anchor_account(&pda::chest(mint, owner).0)
    }

    pub fn shield_state(&self, mint: &Pubkey) -> backstop_chest::state::Shield {
        self.anchor_account(&pda::shield(mint).0)
    }

    /// Asset value of a chest (shares × price).
    pub fn chest_balance(&self, mint: &Pubkey, owner: &Pubkey) -> u64 {
        let cm = self.chest_market(mint);
        let c = self.chest(mint, owner);
        backstop_math::shares::assets_for_shares(c.shares, cm.total_assets(), cm.total_shares)
            .unwrap()
    }

    pub fn open_chest(&mut self, m: &Mkt, owner: &Pubkey) {
        let ix = Instruction::new_with_bytes(
            ids::CHEST,
            &backstop_chest::instruction::OpenChest {}.data(),
            backstop_chest::accounts::OpenChest {
                payer: self.payer.pubkey(),
                owner: *owner,
                chest_market: pda::chest_market(&m.mint).0,
                chest: pda::chest(&m.mint, owner).0,
                system_program: SYSTEM,
            }
            .to_account_metas(None),
        );
        self.send_ok(&[ix], &[]);
    }

    fn chest_transfer_metas(&self, m: &Mkt, owner: &Pubkey) -> Vec<AccountMeta> {
        let cm = pda::chest_market(&m.mint).0;
        backstop_chest::accounts::ChestTransfer {
            owner: *owner,
            market: pda::market(&m.mint).0,
            chest_market: cm,
            chest: pda::chest(&m.mint, owner).0,
            quote_mint: m.quote,
            vault: usdc_ata(&cm, &m.quote),
            owner_quote: usdc_ata(owner, &m.quote),
            shield_rewards_vault: pda::shield_rewards_vault(&m.mint).0,
            quote_token_program: ids::TOKEN,
        }
        .to_account_metas(None)
    }

    pub fn chest_deposit(&mut self, m: &Mkt, owner: &Keypair, amount: u64) -> TxResult {
        let ix = Instruction::new_with_bytes(
            ids::CHEST,
            &backstop_chest::instruction::Deposit { amount }.data(),
            self.chest_transfer_metas(m, &owner.pubkey()),
        );
        self.send(&[ix], &[owner])
    }

    pub fn chest_withdraw(&mut self, m: &Mkt, owner: &Keypair, amount: u64) -> TxResult {
        let ix = Instruction::new_with_bytes(
            ids::CHEST,
            &backstop_chest::instruction::Withdraw { amount }.data(),
            self.chest_transfer_metas(m, &owner.pubkey()),
        );
        self.send(&[ix], &[owner])
    }

    pub fn harvest_ix(&self, m: &Mkt, owner: &Pubkey) -> Instruction {
        let cm = pda::chest_market(&m.mint).0;
        let ra = pda::rewards_vault_authority(&m.mint).0;
        Instruction::new_with_bytes(
            ids::CHEST,
            &backstop_chest::instruction::Harvest {}.data(),
            backstop_chest::accounts::Harvest {
                owner: *owner,
                market: pda::market(&m.mint).0,
                chest_market: cm,
                chest: pda::chest(&m.mint, owner).0,
                quote_mint: m.quote,
                vault: usdc_ata(&cm, &m.quote),
                holder_rewards_vault: usdc_ata(&ra, &m.quote),
                rewards_auth: ra,
                hook_config: pda::hook_config(&m.mint).0,
                holder: pda::holder(&m.mint, owner).0,
                reward_state: pda::reward_state(&m.mint).0,
                hook_program: ids::HOOK,
                quote_token_program: ids::TOKEN,
            }
            .to_account_metas(None),
        )
    }

    pub fn set_grant(
        &mut self,
        m: &Mkt,
        owner: &Keypair,
        args: backstop_chest::instructions::GrantArgs,
    ) {
        let ix = Instruction::new_with_bytes(
            ids::CHEST,
            &backstop_chest::instruction::SetGrant { args }.data(),
            backstop_chest::accounts::SetGrant {
                owner: owner.pubkey(),
                chest_market: pda::chest_market(&m.mint).0,
                grant: pda::grant(&m.mint, &owner.pubkey()).0,
                system_program: SYSTEM,
            }
            .to_account_metas(None),
        );
        self.send_ok(&[ix], &[owner]);
    }

    /// `auto = true` → keeper Auto-Absorb (payer signs); else owner manual bid.
    pub fn chest_bid_ix(
        &self,
        m: &Mkt,
        id: u64,
        owner: &Pubkey,
        payer: &Pubkey,
        amount: u64,
        auto: bool,
    ) -> Instruction {
        let offer = pda::offer(&m.mint, id).0;
        let o = self.offer(&m.mint, id);
        let cm = pda::chest_market(&m.mint).0;
        let kind = if auto { 2 } else { 1 };
        let grant = pda::grant(&m.mint, owner).0;
        let metas = backstop_chest::accounts::ChestBid {
            payer: *payer,
            owner: *owner,
            market: pda::market(&m.mint).0,
            chest_market: cm,
            chest: pda::chest(&m.mint, owner).0,
            grant: if self.exists(&grant) {
                Some(grant)
            } else {
                None
            },
            offer,
            mint: m.mint,
            quote_mint: m.quote,
            bid: pda::bid(&offer, owner, kind).0,
            vault: usdc_ata(&cm, &m.quote),
            bid_vault: usdc_ata(&offer, &m.quote),
            seller_holder: pda::holder(&m.mint, &o.seller).0,
            hook_config: pda::hook_config(&m.mint).0,
            offers_program: ids::OFFERS,
            quote_token_program: ids::TOKEN,
            system_program: SYSTEM,
        }
        .to_account_metas(None);
        let mut metas = metas;
        if !auto {
            // the owner must sign manual chest bids
            for meta in metas.iter_mut() {
                if meta.pubkey == *owner {
                    meta.is_signer = true;
                }
            }
        }
        let data = if auto {
            backstop_chest::instruction::AutoBid { amount }.data()
        } else {
            backstop_chest::instruction::BidFromChest { amount }.data()
        };
        Instruction::new_with_bytes(ids::CHEST, &data, metas)
    }

    pub fn chest_claim_ix(
        &self,
        m: &Mkt,
        id: u64,
        owner: &Pubkey,
        kind: u8,
        rent_payer: &Pubkey,
    ) -> Instruction {
        let offer = pda::offer(&m.mint, id).0;
        let book = pda::book(&m.mint).0;
        let cm = pda::chest_market(&m.mint).0;
        let mut metas = backstop_chest::accounts::ChestClaim {
            cranker: self.payer.pubkey(),
            chest_market: cm,
            chest: pda::chest(&m.mint, owner).0,
            book,
            offer,
            bid: pda::bid(&offer, owner, kind).0,
            rent_payer: *rent_payer,
            mint: m.mint,
            quote_mint: m.quote,
            bidder_token: Env::ata(owner, &m.mint),
            vault: usdc_ata(&cm, &m.quote),
            escrow_vault: Env::ata(&book, &m.mint),
            bid_vault: usdc_ata(&offer, &m.quote),
            hook_config: pda::hook_config(&m.mint).0,
            bidder_holder: pda::holder(&m.mint, owner).0,
            reward_state: pda::reward_state(&m.mint).0,
            hook_program: ids::HOOK,
            offers_program: ids::OFFERS,
            base_token_program: ids::TOKEN_2022,
            quote_token_program: ids::TOKEN,
        }
        .to_account_metas(None);
        metas.extend(hook_metas(&m.mint, &book, owner));
        Instruction::new_with_bytes(
            ids::CHEST,
            &backstop_chest::instruction::ClaimBid {}.data(),
            metas,
        )
    }

    // ------------------------------------------------------------- shield

    pub fn shield_deposit_ix(
        &self,
        m: &Mkt,
        owner: &Pubkey,
        amount: u64,
        lock_secs: u32,
        pid: u32,
    ) -> Instruction {
        let cm = pda::chest_market(&m.mint).0;
        let shield = pda::shield(&m.mint).0;
        Instruction::new_with_bytes(
            ids::CHEST,
            &backstop_chest::instruction::ShieldDeposit {
                amount,
                lock_secs,
                id: pid,
            }
            .data(),
            backstop_chest::accounts::ShieldDeposit {
                owner: *owner,
                market: pda::market(&m.mint).0,
                chest_market: cm,
                chest: pda::chest(&m.mint, owner).0,
                shield,
                position: pda::shield_position(&m.mint, owner, pid).0,
                quote_mint: m.quote,
                vault: usdc_ata(&cm, &m.quote),
                quote_vault: usdc_ata(&shield, &m.quote),
                rewards_vault: pda::shield_rewards_vault(&m.mint).0,
                quote_token_program: ids::TOKEN,
                system_program: SYSTEM,
            }
            .to_account_metas(None),
        )
    }

    pub fn shield_claim_ix(
        &self,
        m: &Mkt,
        owner: &Pubkey,
        pid: u32,
        withdraw: bool,
    ) -> Instruction {
        let cm = pda::chest_market(&m.mint).0;
        let shield = pda::shield(&m.mint).0;
        let mut metas = backstop_chest::accounts::ShieldClaim {
            owner: *owner,
            market: pda::market(&m.mint).0,
            chest_market: cm,
            chest: pda::chest(&m.mint, owner).0,
            shield,
            position: pda::shield_position(&m.mint, owner, pid).0,
            mint: m.mint,
            quote_mint: m.quote,
            vault: usdc_ata(&cm, &m.quote),
            quote_vault: usdc_ata(&shield, &m.quote),
            token_vault: Env::ata(&shield, &m.mint),
            rewards_vault: pda::shield_rewards_vault(&m.mint).0,
            owner_token: Env::ata(owner, &m.mint),
            base_token_program: ids::TOKEN_2022,
            quote_token_program: ids::TOKEN,
        }
        .to_account_metas(None);
        metas.extend(hook_metas(&m.mint, &shield, owner));
        let data = if withdraw {
            backstop_chest::instruction::ShieldWithdraw {}.data()
        } else {
            backstop_chest::instruction::ShieldClaim {}.data()
        };
        Instruction::new_with_bytes(ids::CHEST, &data, metas)
    }

    // --------------------------------------------------------------- fees

    pub fn distribute_fees_ix(&self, m: &Mkt) -> Instruction {
        let market = self.market(&m.mint);
        Instruction::new_with_bytes(
            ids::CORE,
            &backstop_core::instruction::DistributeFees {}.data(),
            backstop_core::accounts::DistributeFees {
                market: pda::market(&m.mint).0,
                quote_mint: m.quote,
                fee_vault: market.fee_vault,
                holder_rewards_vault: market.holder_rewards_vault,
                shield_rewards_vault: market.shield_rewards_vault,
                treasury_quote_vault: market.treasury_quote_vault,
                parent_vault: market.parent_vault,
                hook_config: pda::hook_config(&m.mint).0,
                reward_state: pda::reward_state(&m.mint).0,
                hook_program: ids::HOOK,
                quote_token_program: ids::TOKEN,
            }
            .to_account_metas(None),
        )
    }
}
