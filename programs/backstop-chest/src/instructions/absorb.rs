//! Absorbing offers with chest funds: manual chest bids, Auto-Absorb grants
//! executed by keepers, claims, and Shield-priority settlement.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use backstop_amm::state::Pool;
use backstop_common::{ids, seeds};
use backstop_core::state::{pause, Market};
use backstop_math::allocation::shield_lots;
use backstop_math::shield::ShieldPool;
use backstop_math::u256::mul_div_floor;
use backstop_math::BPS;
use backstop_offers::program::BackstopOffers;
use backstop_offers::state::{bid_kind, Bid, Offer};

use crate::errors::{ChestError, MathExt};
use crate::events::{AutoBid, GrantUpdated, ShieldAbsorbed};
use crate::instructions::chest::{chest_market_seeds, emit_chest, kind};
use crate::ledger::{balance, credit, debit};
use crate::state::{Chest, ChestMarket, Grant, Shield, ShieldPoolData};

// ------------------------------------------------------------------ grant

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct GrantArgs {
    pub enabled: bool,
    pub max_per_offer: u64,
    pub max_per_day: u64,
    pub min_discount_bps: u32,
    pub reserve_floor: u64,
    /// `Pubkey::default()` = any keeper.
    pub keeper: Pubkey,
}

#[derive(Accounts)]
pub struct SetGrant<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [seeds::CHEST_MARKET, chest_market.mint.as_ref()], bump = chest_market.bump)]
    pub chest_market: Box<Account<'info, ChestMarket>>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Grant::INIT_SPACE,
        seeds = [seeds::GRANT, chest_market.mint.as_ref(), owner.key().as_ref()],
        bump
    )]
    pub grant: Box<Account<'info, Grant>>,
    pub system_program: Program<'info, System>,
}

/// Create, update or revoke (`enabled = false`) the Auto-Absorb grant.
pub fn set_grant(ctx: Context<SetGrant>, args: GrantArgs) -> Result<()> {
    let g = &mut ctx.accounts.grant;
    g.bump = ctx.bumps.grant;
    g.mint = ctx.accounts.chest_market.mint;
    g.owner = ctx.accounts.owner.key();
    g.enabled = args.enabled;
    g.max_per_offer = args.max_per_offer;
    g.max_per_day = args.max_per_day;
    g.min_discount_bps = args.min_discount_bps;
    g.reserve_floor = args.reserve_floor;
    g.keeper = args.keeper;
    g.updated_at = Clock::get()?.unix_timestamp;
    emit!(GrantUpdated {
        mint: g.mint,
        owner: g.owner,
        enabled: g.enabled,
        max_per_offer: g.max_per_offer,
        max_per_day: g.max_per_day,
        min_discount_bps: g.min_discount_bps,
        reserve_floor: g.reserve_floor,
    });
    Ok(())
}

// -------------------------------------------------------------------- bid

#[derive(Accounts)]
pub struct ChestBid<'info> {
    /// Owner (manual bids) or keeper (Auto-Absorb). Pays the bid rent and
    /// receives it back on claim.
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: chest owner; must sign for manual bids (checked in handler).
    pub owner: UncheckedAccount<'info>,
    #[account(seeds = [seeds::MARKET, mint.key().as_ref()], bump = market.bump, seeds::program = ids::CORE, has_one = mint)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [seeds::CHEST_MARKET, mint.key().as_ref()], bump = chest_market.bump, has_one = vault)]
    pub chest_market: Box<Account<'info, ChestMarket>>,
    #[account(mut, seeds = [seeds::CHEST, mint.key().as_ref(), owner.key().as_ref()], bump = chest.bump)]
    pub chest: Box<Account<'info, Chest>>,
    #[account(seeds = [seeds::GRANT, mint.key().as_ref(), owner.key().as_ref()], bump = grant.bump)]
    pub grant: Option<Box<Account<'info, Grant>>>,
    #[account(mut, has_one = mint)]
    pub offer: Box<Account<'info, Offer>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = chest_market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: bid PDA, created by the offers program.
    #[account(mut)]
    pub bid: UncheckedAccount<'info>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: offer bid vault (validated by the offers program).
    #[account(mut)]
    pub bid_vault: UncheckedAccount<'info>,
    /// CHECK: seller holder (validated by the offers program).
    pub seller_holder: UncheckedAccount<'info>,
    /// CHECK: hook config (validated by the offers program).
    pub hook_config: UncheckedAccount<'info>,
    pub offers_program: Program<'info, BackstopOffers>,
    #[account(address = chest_market.quote_token_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

fn place_chest_bid(ctx: &mut Context<ChestBid>, amount: u64, k: u8) -> Result<u64> {
    let lot_cost = ctx.accounts.offer.lot_cost;
    let locked = (amount / lot_cost) * lot_cost;
    require!(locked > 0, ChestError::InvalidAmount);
    let now = Clock::get()?.unix_timestamp;
    {
        let cm = &mut ctx.accounts.chest_market;
        let c = &mut ctx.accounts.chest;
        let s = debit(cm, c, locked)?;
        c.bid_quote = c.bid_quote.saturating_add(locked);
        c.open_bids += 1;
        cm.total_bid = cm.total_bid.saturating_add(locked);
        emit_chest(cm, c, kind::BID, locked, -(s as i64), 0, now)?;
    }
    let a = &ctx.accounts;
    let seeds = chest_market_seeds(&a.chest_market);
    backstop_offers::cpi::place_bid(
        CpiContext::new_with_signer(
            ids::OFFERS,
            backstop_offers::cpi::accounts::PlaceBid {
                rent_payer: a.payer.to_account_info(),
                funder: a.chest_market.to_account_info(),
                bidder: a.owner.to_account_info(),
                market: a.market.to_account_info(),
                offer: a.offer.to_account_info(),
                mint: a.mint.to_account_info(),
                quote_mint: a.quote_mint.to_account_info(),
                bid: a.bid.to_account_info(),
                funder_quote: a.vault.to_account_info(),
                refund_to: a.vault.to_account_info(),
                bid_vault: a.bid_vault.to_account_info(),
                seller_holder: a.seller_holder.to_account_info(),
                hook_config: a.hook_config.to_account_info(),
                quote_token_program: a.quote_token_program.to_account_info(),
                system_program: a.system_program.to_account_info(),
            },
            &[&seeds],
        ),
        locked,
        k,
    )?;
    Ok(locked)
}

/// Manual bid funded from the owner's chest.
pub fn bid_from_chest(mut ctx: Context<ChestBid>, amount: u64) -> Result<()> {
    require!(ctx.accounts.owner.is_signer, ChestError::Unauthorized);
    place_chest_bid(&mut ctx, amount, bid_kind::CHEST)?;
    Ok(())
}

/// Keeper-executed Auto-Absorb bid within the owner's grant limits.
pub fn auto_bid(mut ctx: Context<ChestBid>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    {
        let a = &ctx.accounts;
        require!(
            !a.market.is_paused(pause::AUTO_ABSORB),
            ChestError::AutoAbsorbPaused
        );
        let g = a.grant.as_ref().ok_or(ChestError::GrantDisabled)?;
        require!(g.enabled, ChestError::GrantDisabled);
        require!(
            g.keeper == Pubkey::default() || g.keeper == a.payer.key(),
            ChestError::KeeperNotAllowed
        );
        require!(
            a.offer.discount_bps >= g.min_discount_bps,
            ChestError::DiscountTooLow
        );
        require!(amount <= g.max_per_offer, ChestError::GrantLimit);
        let bal = balance(&a.chest_market, &a.chest)?;
        require!(
            bal.saturating_sub(amount) >= g.reserve_floor,
            ChestError::ReserveFloor
        );
        let (max_day, c) = (g.max_per_day, &mut ctx.accounts.chest);
        if now.saturating_sub(c.day_start) >= 86_400 {
            c.day_start = now;
            c.day_spent = 0;
        }
        require!(
            c.day_spent.saturating_add(amount) <= max_day,
            ChestError::GrantLimit
        );
    }
    let locked = place_chest_bid(&mut ctx, amount, bid_kind::AUTO)?;
    let a = &mut ctx.accounts;
    a.chest.day_spent = a.chest.day_spent.saturating_add(locked);
    emit!(AutoBid {
        mint: a.mint.key(),
        owner: a.owner.key(),
        offer: a.offer.key(),
        keeper: a.payer.key(),
        amount: locked,
        ts: now
    });
    Ok(())
}

// ------------------------------------------------------------------ claim

#[derive(Accounts)]
pub struct ChestClaim<'info> {
    pub cranker: Signer<'info>,
    #[account(mut, seeds = [seeds::CHEST_MARKET, mint.key().as_ref()], bump = chest_market.bump, has_one = vault)]
    pub chest_market: Box<Account<'info, ChestMarket>>,
    #[account(mut, seeds = [seeds::CHEST, mint.key().as_ref(), bid.bidder.as_ref()], bump = chest.bump)]
    pub chest: Box<Account<'info, Chest>>,
    /// CHECK: offer book (validated by the offers program).
    #[account(mut)]
    pub book: UncheckedAccount<'info>,
    #[account(mut, has_one = mint)]
    pub offer: Box<Account<'info, Offer>>,
    #[account(mut, has_one = offer, constraint = bid.refund_to == vault.key() @ ChestError::AccountMismatch)]
    pub bid: Box<Account<'info, Bid>>,
    /// CHECK: bid rent payer (validated by the offers program).
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = chest_market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: bidder's token account (validated by the offers program).
    #[account(mut)]
    pub bidder_token: UncheckedAccount<'info>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: validated by the offers program.
    #[account(mut)]
    pub escrow_vault: UncheckedAccount<'info>,
    /// CHECK: validated by the offers program.
    #[account(mut)]
    pub bid_vault: UncheckedAccount<'info>,
    /// CHECK: validated by the hook program.
    pub hook_config: UncheckedAccount<'info>,
    /// CHECK: validated by the offers program.
    #[account(mut)]
    pub bidder_holder: UncheckedAccount<'info>,
    /// CHECK: validated by the hook program.
    #[account(mut)]
    pub reward_state: UncheckedAccount<'info>,
    /// CHECK: hook program (validated by the offers program).
    pub hook_program: UncheckedAccount<'info>,
    pub offers_program: Program<'info, BackstopOffers>,
    /// CHECK: Token-2022 (validated by the offers program).
    pub base_token_program: UncheckedAccount<'info>,
    #[account(address = chest_market.quote_token_program)]
    pub quote_token_program: Interface<'info, TokenInterface>,
    // remaining accounts: hook accounts for escrow → bidder
}

/// Permissionless: claim a chest-funded bid; the refund returns to the
/// owner's chest (not a deposit event — no lock restart).
pub fn claim_bid<'info>(ctx: Context<'info, ChestClaim<'info>>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    let seeds = chest_market_seeds(&a.chest_market);
    let refund = backstop_offers::cpi::claim(
        CpiContext::new_with_signer(
            ids::OFFERS,
            backstop_offers::cpi::accounts::ClaimBid {
                claimer: a.cranker.to_account_info(),
                refund_authority: Some(a.chest_market.to_account_info()),
                book: a.book.to_account_info(),
                offer: a.offer.to_account_info(),
                bid: a.bid.to_account_info(),
                rent_payer: a.rent_payer.to_account_info(),
                mint: a.mint.to_account_info(),
                quote_mint: a.quote_mint.to_account_info(),
                bidder_token: a.bidder_token.to_account_info(),
                refund_to: a.vault.to_account_info(),
                escrow_vault: a.escrow_vault.to_account_info(),
                bid_vault: a.bid_vault.to_account_info(),
                hook_config: a.hook_config.to_account_info(),
                bidder_holder: a.bidder_holder.to_account_info(),
                reward_state: a.reward_state.to_account_info(),
                hook_program: a.hook_program.to_account_info(),
                base_token_program: a.base_token_program.to_account_info(),
                quote_token_program: a.quote_token_program.to_account_info(),
            },
            &[&seeds],
        )
        .with_remaining_accounts(ctx.remaining_accounts.to_vec()),
    )?
    .get();
    let cm = &mut ctx.accounts.chest_market;
    let c = &mut ctx.accounts.chest;
    c.open_bids = c.open_bids.saturating_sub(1);
    if refund > 0 {
        let s = credit(cm, c, refund)?;
        c.refunded_quote = c.refunded_quote.saturating_add(refund);
        cm.total_refunded = cm.total_refunded.saturating_add(refund);
        emit_chest(cm, c, kind::REFUND, refund, s as i64, 0, now)?;
    }
    Ok(())
}

// ----------------------------------------------------------------- settle

#[derive(Accounts)]
pub struct SettleOffer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [seeds::MARKET, mint.key().as_ref()], bump = market.bump, seeds::program = ids::CORE, has_one = mint)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [seeds::SHIELD, mint.key().as_ref()], bump = shield.bump)]
    pub shield: Box<Account<'info, Shield>>,
    #[account(seeds = [seeds::POOL, mint.key().as_ref()], bump = pool.load()?.bump, seeds::program = ids::AMM)]
    pub pool: AccountLoader<'info, Pool>,
    /// CHECK: validated by the offers program.
    #[account(mut)]
    pub book: UncheckedAccount<'info>,
    #[account(mut, has_one = mint)]
    pub offer: Box<Account<'info, Offer>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: validated by the offers program.
    pub quote_mint: UncheckedAccount<'info>,
    /// CHECK: validated by the offers program.
    #[account(mut)]
    pub escrow_vault: UncheckedAccount<'info>,
    /// CHECK: validated by the offers program.
    #[account(mut)]
    pub bid_vault: UncheckedAccount<'info>,
    /// CHECK: validated by the offers program.
    #[account(mut)]
    pub seller_quote: UncheckedAccount<'info>,
    /// CHECK: validated by the offers program.
    #[account(mut)]
    pub fee_vault: UncheckedAccount<'info>,
    #[account(mut, address = shield.quote_vault)]
    pub shield_quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, address = shield.token_vault)]
    pub shield_token_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: Return Ticket PDA, created by the offers program.
    #[account(mut)]
    pub ticket: UncheckedAccount<'info>,
    /// CHECK: SlotHashes sysvar (validated by the offers program).
    pub slot_hashes: UncheckedAccount<'info>,
    pub offers_program: Program<'info, BackstopOffers>,
    /// CHECK: validated by the offers program.
    pub base_token_program: UncheckedAccount<'info>,
    /// CHECK: validated by the offers program.
    pub quote_token_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    // remaining accounts: hook accounts for escrow → shield token vault
}

/// Permissionless: settle an offer with the Shield's priority slice booked
/// atomically (D-025). The Shield skips offers whose short TWAP is more than
/// `shield_max_premium_bps` above the hourly TWAP (pump protection).
pub fn settle_offer<'info>(ctx: Context<'info, SettleOffer<'info>>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    let p = a.market.params;
    let o = &a.offer;
    let mut sp = ShieldPool::from(&a.shield.pool);
    let pump = {
        let pool = a.pool.load()?;
        let or = pool.oracle();
        match (
            or.twap_or_available(now, p.price_twap_window_secs),
            or.twap(now, 3_600, 0),
        ) {
            (Ok(short), Ok(hour)) if hour > 0 => {
                let limit = mul_div_floor(
                    hour,
                    BPS as u128 + p.shield_max_premium_bps as u128,
                    BPS as u128,
                )
                .mx()?;
                short > limit
            }
            _ => false,
        }
    };
    let lots = if pump || sp.total_deposits == 0 {
        0
    } else {
        shield_lots(
            sp.total_deposits,
            p.shield_per_offer_cap,
            o.lot_cost,
            o.lots,
            p.shield_max_share_bps as u64,
        )
        .mx()?
    };
    let (lot_cost, lot_size, offer_key) = (o.lot_cost, o.lot_size, o.key());
    let sbump = [a.shield.bump];
    let mint_key = a.mint.key();
    let sseeds: [&[u8]; 3] = [seeds::SHIELD, mint_key.as_ref(), &sbump];
    backstop_offers::cpi::settle(
        CpiContext::new_with_signer(
            ids::OFFERS,
            backstop_offers::cpi::accounts::Settle {
                shield_authority: a.shield.to_account_info(),
                payer: a.payer.to_account_info(),
                market: a.market.to_account_info(),
                book: a.book.to_account_info(),
                offer: a.offer.to_account_info(),
                mint: a.mint.to_account_info(),
                quote_mint: a.quote_mint.to_account_info(),
                escrow_vault: a.escrow_vault.to_account_info(),
                bid_vault: a.bid_vault.to_account_info(),
                seller_quote: a.seller_quote.to_account_info(),
                fee_vault: a.fee_vault.to_account_info(),
                shield_quote_vault: a.shield_quote_vault.to_account_info(),
                shield_token_vault: a.shield_token_vault.to_account_info(),
                ticket: a.ticket.to_account_info(),
                slot_hashes: a.slot_hashes.to_account_info(),
                base_token_program: a.base_token_program.to_account_info(),
                quote_token_program: a.quote_token_program.to_account_info(),
                system_program: a.system_program.to_account_info(),
            },
            &[&sseeds],
        )
        .with_remaining_accounts(ctx.remaining_accounts.to_vec()),
        lots,
    )?;
    if lots > 0 {
        let spent = lots * lot_cost;
        let gained = lots * lot_size;
        sp.absorb(spent, gained).mx()?;
        let s = &mut ctx.accounts.shield;
        s.pool = ShieldPoolData::from(&sp);
        s.tokens_accounted = s.tokens_accounted.saturating_add(gained);
        s.absorbed_quote = s.absorbed_quote.saturating_add(spent);
        s.absorbed_tokens = s.absorbed_tokens.saturating_add(gained);
        s.offers_absorbed += 1;
        emit!(ShieldAbsorbed {
            mint: mint_key,
            offer: offer_key,
            lots,
            quote_spent: spent,
            tokens_gained: gained,
            total_deposits_after: sp.total_deposits,
            ts: now,
        });
    }
    Ok(())
}
