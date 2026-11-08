//! Share-accounting helpers (D-027). All chest balance changes go through
//! these functions so `Σ chest.shares == market.total_shares` and
//! `idle_assets` stay consistent.

use anchor_lang::prelude::*;
use backstop_math::shares::{assets_for_shares, shares_for_deposit, shares_for_withdraw};

use crate::errors::{ChestError, MathExt};
use crate::state::{Chest, ChestMarket};

/// Credit `assets` (already transferred into the idle vault) to `chest`.
pub fn credit(cm: &mut ChestMarket, chest: &mut Chest, assets: u64) -> Result<u64> {
    let shares = shares_for_deposit(assets, cm.total_assets(), cm.total_shares).mx()?;
    cm.idle_assets = cm
        .idle_assets
        .checked_add(assets)
        .ok_or(ChestError::MathOverflow)?;
    cm.total_shares = cm
        .total_shares
        .checked_add(shares)
        .ok_or(ChestError::MathOverflow)?;
    chest.shares = chest
        .shares
        .checked_add(shares)
        .ok_or(ChestError::MathOverflow)?;
    Ok(shares)
}

/// Debit `assets` from `chest` (to be transferred out of the idle vault).
pub fn debit(cm: &mut ChestMarket, chest: &mut Chest, assets: u64) -> Result<u64> {
    require!(assets <= cm.idle_assets, ChestError::InsufficientLiquidity);
    let shares = shares_for_withdraw(assets, cm.total_assets(), cm.total_shares).mx()?;
    require!(shares <= chest.shares, ChestError::InsufficientBalance);
    cm.idle_assets -= assets;
    cm.total_shares -= shares;
    chest.shares -= shares;
    Ok(shares)
}

pub fn balance(cm: &ChestMarket, chest: &Chest) -> Result<u64> {
    assets_for_shares(chest.shares, cm.total_assets(), cm.total_shares).mx()
}

/// Restart the rolling withdrawal lock (deposit event, D-028).
pub fn deposit_event(chest: &mut Chest, now: i64, lock_secs: u32) {
    chest.last_deposit_at = now;
    chest.lock_until = now + lock_secs as i64;
}
