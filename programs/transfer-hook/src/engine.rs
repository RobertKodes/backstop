//! Glue between account state and `backstop-math`.

use std::cell::RefMut;

use anchor_lang::prelude::*;
use anchor_lang::Discriminator;
use backstop_math::rewards::{settle, UserRewards};
use backstop_math::tenure::Tenure;
use backstop_math::weight::linear_weight;
use backstop_math::MathResult;

use crate::errors::{HookError, MathExt};
use crate::state::{Holder, HookConfig, RewardState};

/// Epoch boundaries processed inline by any hook-touching instruction
/// (~340 CU each, so ≤ ~11k CU). Larger backlogs — only possible after 8 days
/// without a single token movement — need the permissionless
/// `advance_epochs` crank (the keeper runs it every epoch; the SDK prepends
/// it automatically when the reward state is behind).
pub const INLINE_CATCH_UP: u64 = 32;

/// Process all epoch boundaries up to `now`. Fails (reverting the whole
/// transaction) if more than [`INLINE_CATCH_UP`] boundaries are pending.
pub fn catch_up(rs: &mut RewardState, cfg: &HookConfig, now: i64) -> Result<()> {
    let target = cfg.weight_params().epoch_at(now);
    if rs.last_epoch >= target {
        return Ok(());
    }
    let mut g = rs.global();
    let done = g.advance_to(rs, target, INLINE_CATCH_UP).mx()?;
    rs.set_global(&g);
    require!(done, HookError::EpochCatchUpRequired);
    Ok(())
}

/// Settle a holder's rewards, then replace its weight contribution after
/// applying `f` to its tenure. The caller must have caught up first.
pub fn update_holder(
    rs: &mut RewardState,
    h: &mut Holder,
    cfg: &HookConfig,
    now: i64,
    f: impl FnOnce(&mut Tenure) -> MathResult<()>,
) -> Result<u64> {
    let mut g = rs.global();
    let mut ur = h.rewards();
    let old = h.weight();
    let earned = settle(&mut ur, &old, &g, &*rs).mx()?;
    g.remove_weight(rs, &old).mx()?;
    let mut t = h.tenure();
    f(&mut t).mx()?;
    let new = linear_weight(&t, now, g.last_epoch, &cfg.weight_params()).mx()?;
    g.add_weight(rs, &new).mx()?;
    h.set_tenure(&t);
    h.set_weight(&new);
    h.set_rewards(&ur);
    h.lifetime_rewards = h.lifetime_rewards.saturating_add(earned);
    rs.set_global(&g);
    Ok(earned)
}

/// Settle rewards only (weight unchanged).
pub fn settle_only(rs: &RewardState, h: &mut Holder) -> Result<u64> {
    let g = rs.global();
    let mut ur = h.rewards();
    let earned = settle(&mut ur, &h.weight(), &g, rs).mx()?;
    h.set_rewards(&ur);
    h.lifetime_rewards = h.lifetime_rewards.saturating_add(earned);
    Ok(earned)
}

/// Initialise the reward checkpoint of a freshly created holder.
pub fn init_holder_rewards(rs: &RewardState, h: &mut Holder) {
    let ur = UserRewards::new_at(&rs.global());
    h.set_rewards(&ur);
}

/// Mutably load a `Holder` from an arbitrary account info (owner and
/// discriminator checked) — used for optional holder accounts.
pub fn load_holder_mut<'a>(ai: &'a AccountInfo<'_>) -> Result<RefMut<'a, Holder>> {
    require_keys_eq!(*ai.owner, crate::ID, HookError::HolderMismatch);
    let data = ai.try_borrow_mut_data()?;
    require!(
        data.len() >= Holder::SIZE && data[..8] == *Holder::DISCRIMINATOR,
        HookError::HolderMismatch
    );
    Ok(RefMut::map(data, |d| {
        bytemuck::from_bytes_mut(&mut d[8..Holder::SIZE])
    }))
}

/// Whether an account is an initialised `Holder` owned by this program.
pub fn is_initialized_holder(ai: &AccountInfo) -> bool {
    ai.owner == &crate::ID && ai.data_len() >= Holder::SIZE
}
