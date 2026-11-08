//! The transfer hook proper. Invoked by Token-2022 on every transfer of a
//! BACKSTOP-engine mint. See D-012 for the allowlist rationale.

use anchor_lang::prelude::*;
use backstop_common::{ids, seeds};

use crate::engine::{catch_up, is_initialized_holder, load_holder_mut, update_holder};
use crate::errors::HookError;
use crate::events::{TenureReset, TransferTracked};
use crate::state::{HookConfig, RewardState};
use crate::token::{is_on_curve, read_token_account, top_level_program};

#[derive(Accounts)]
pub struct Execute<'info> {
    /// CHECK: Token-2022 source account; validated in the handler.
    pub source: UncheckedAccount<'info>,
    /// CHECK: the mint; bound to `config` via `has_one`.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: Token-2022 destination account; validated in the handler.
    pub destination: UncheckedAccount<'info>,
    /// CHECK: transfer authority (owner or delegate); not used.
    pub authority: UncheckedAccount<'info>,
    /// CHECK: extra-account-meta TLV list (resolved by Token-2022).
    pub extra_metas: UncheckedAccount<'info>,
    #[account(seeds = [seeds::HOOK_CONFIG, mint.key().as_ref()], bump = config.bump, has_one = mint)]
    pub config: Box<Account<'info, HookConfig>>,
    /// CHECK: address-checked instructions sysvar.
    #[account(address = solana_instructions_sysvar::ID)]
    pub instructions: UncheckedAccount<'info>,
    /// CHECK: source wallet's holder PDA; may be uninitialised.
    #[account(mut)]
    pub src_holder: UncheckedAccount<'info>,
    /// CHECK: destination wallet's holder PDA; may be uninitialised.
    #[account(mut)]
    pub dst_holder: UncheckedAccount<'info>,
    #[account(mut, seeds = [seeds::REWARD_STATE, mint.key().as_ref()], bump = config.reward_bump)]
    pub reward_state: AccountLoader<'info, RewardState>,
}

pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
    let cfg = &ctx.accounts.config;
    require!(cfg.reward_ready, HookError::RewardStateNotReady);
    let mint = ctx.accounts.mint.key();

    // 1. Must be a genuine Token-2022 transfer of this mint.
    let src = read_token_account(&ctx.accounts.source.to_account_info())?;
    let dst = read_token_account(&ctx.accounts.destination.to_account_info())?;
    require!(
        src.transferring && dst.transferring,
        HookError::NotTransferring
    );
    require_keys_eq!(src.mint, mint, HookError::MintMismatch);
    require_keys_eq!(dst.mint, mint, HookError::MintMismatch);

    // 2. Destination must not be re-assignable to another owner later.
    require!(dst.immutable_owner, HookError::MissingImmutableOwner);

    // 3. Who initiated the movement?
    let top = top_level_program(&ctx.accounts.instructions.to_account_info())?;
    let direct = top == ids::TOKEN_2022;
    if !direct {
        require!(cfg.is_allowed_program(&top), HookError::UnauthorizedProgram);
    }

    // 4. Where may the tokens go?
    let src_wallet = is_on_curve(&src.owner);
    let dst_wallet = is_on_curve(&dst.owner);
    if !dst_wallet {
        require!(!direct, HookError::DirectTransferToProtocolAccount);
        require!(
            cfg.is_allowed_owner(&dst.owner),
            HookError::UnauthorizedDestination
        );
    }

    // Moving tokens between a wallet's own accounts changes nothing.
    if src.owner == dst.owner {
        return Ok(());
    }

    let now = Clock::get()?.unix_timestamp;
    let is_direct_sell = src_wallet && dst.owner == cfg.amm_authority;
    let mut rs = ctx.accounts.reward_state.load_mut()?;
    catch_up(&mut rs, cfg, now)?;

    // 5. Outbound side: every exit from a wallet resets its tenure.
    let mut src_tracked = false;
    if src_wallet {
        let ai = ctx.accounts.src_holder.to_account_info();
        if is_initialized_holder(&ai) {
            let mut h = load_holder_mut(&ai)?;
            require!(
                h.mint == mint && h.wallet == src.owner,
                HookError::HolderMismatch
            );
            if is_direct_sell {
                if now.saturating_sub(h.ds_window_start) >= cfg.direct_sell_window_secs as i64 {
                    h.ds_window_start = now;
                    h.ds_amount = 0;
                }
                let next = h
                    .ds_amount
                    .checked_add(amount)
                    .ok_or(HookError::MathOverflow)?;
                require!(
                    next <= cfg.direct_sell_cap,
                    HookError::DirectSellCapExceeded
                );
                h.ds_amount = next;
            }
            update_holder(&mut rs, &mut h, cfg, now, |t| {
                t.on_outbound_reset(amount, now)
            })?;
            emit!(TenureReset {
                mint,
                wallet: src.owner,
                balance: h.balance,
                ts: now
            });
            src_tracked = true;
        } else {
            require!(!is_direct_sell, HookError::DirectSellRequiresHolder);
        }
    }

    // 6. Inbound side: received tokens start at tenure zero.
    let mut dst_tracked = false;
    if dst_wallet {
        let ai = ctx.accounts.dst_holder.to_account_info();
        if is_initialized_holder(&ai) {
            let mut h = load_holder_mut(&ai)?;
            require!(
                h.mint == mint && h.wallet == dst.owner,
                HookError::HolderMismatch
            );
            update_holder(&mut rs, &mut h, cfg, now, |t| t.on_inbound(amount, now))?;
            if direct && src_wallet && amount >= cfg.link_min_amount {
                h.push_sender(src.owner, now);
            }
            dst_tracked = true;
        }
    }

    emit!(TransferTracked {
        mint,
        src_wallet: src.owner,
        dst_wallet: dst.owner,
        amount,
        kind: u8::from(!direct),
        src_tracked,
        dst_tracked,
        ts: now,
    });
    Ok(())
}
