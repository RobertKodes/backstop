//! Idle-chest yield adapters (spec §3.4, Phase 6).
//!
//! The chest program never talks to a lending market directly; it goes
//! through [`YieldAdapter`]. Adapter-specific accounts are passed as
//! remaining accounts in a documented order. Implementations:
//! * [`MockAdapter`] — `mock-lending` (localnet / tests). Always built.
//! * `KaminoAdapter` — Kamino Lend reserve deposits (feature `kamino`).
//!   See DECISIONS D-040: its reserve-layout parsing is guarded by on-chain
//!   sanity checks and must be verified on a mainnet fork before enabling.
//! * Marginfi — documented fallback, not implemented (D-040).

use anchor_lang::prelude::*;

use crate::errors::ChestError;
use crate::state::{adapter_kind, ChestMarket};

pub struct AdapterCtx<'a, 'info> {
    pub market: &'a ChestMarket,
    /// Chest-market PDA (owner of the idle vault and of the position).
    pub authority: AccountInfo<'info>,
    pub vault: AccountInfo<'info>,
    pub quote_mint: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
    /// Adapter-specific accounts.
    pub accounts: &'a [AccountInfo<'info>],
    pub signer_seeds: &'a [&'a [&'a [u8]]],
}

pub trait YieldAdapter {
    /// Move `amount` quote tokens from the idle vault into the position.
    fn deposit(&self, cx: &AdapterCtx, amount: u64) -> Result<()>;
    /// Move `amount` quote tokens from the position back to the idle vault.
    fn withdraw(&self, cx: &AdapterCtx, amount: u64) -> Result<()>;
    /// Current value of the position in quote tokens.
    fn value(&self, cx: &AdapterCtx, now: i64) -> Result<u64>;
}

pub fn adapter_for(kind: u8) -> Result<&'static dyn YieldAdapter> {
    match kind {
        adapter_kind::MOCK => Ok(&MockAdapter),
        #[cfg(feature = "kamino")]
        adapter_kind::KAMINO => Ok(&kamino::KaminoAdapter),
        adapter_kind::NONE => err!(ChestError::NoAdapter),
        _ => err!(ChestError::AdapterUnsupported),
    }
}

fn acc<'a, 'info>(cx: &'a AdapterCtx<'_, 'info>, i: usize) -> Result<&'a AccountInfo<'info>> {
    cx.accounts
        .get(i)
        .ok_or(error!(ChestError::AccountMismatch))
}

// ------------------------------------------------------------------ mock ---

/// Remaining accounts: `[mock_lending program, lending pool, lending deposit, lending vault]`.
pub struct MockAdapter;

impl MockAdapter {
    fn check<'info>(cx: &AdapterCtx<'_, 'info>) -> Result<()> {
        require_keys_eq!(
            acc(cx, 0)?.key(),
            mock_lending::ID,
            ChestError::AccountMismatch
        );
        require_keys_eq!(
            acc(cx, 1)?.key(),
            cx.market.adapter_pool,
            ChestError::AccountMismatch
        );
        require_keys_eq!(
            acc(cx, 2)?.key(),
            cx.market.adapter_position,
            ChestError::AccountMismatch
        );
        Ok(())
    }

    fn mv(cx: &AdapterCtx, amount: u64, deposit: bool) -> Result<()> {
        Self::check(cx)?;
        let accounts = mock_lending::cpi::accounts::Move {
            owner: cx.authority.clone(),
            pool: acc(cx, 1)?.clone(),
            deposit: acc(cx, 2)?.clone(),
            mint: cx.quote_mint.clone(),
            vault: acc(cx, 3)?.clone(),
            owner_token: cx.vault.clone(),
            token_program: cx.token_program.clone(),
        };
        let ctx = CpiContext::new_with_signer(mock_lending::ID, accounts, cx.signer_seeds);
        if deposit {
            mock_lending::cpi::deposit(ctx, amount)
        } else {
            mock_lending::cpi::withdraw(ctx, amount)
        }
    }
}

impl YieldAdapter for MockAdapter {
    fn deposit(&self, cx: &AdapterCtx, amount: u64) -> Result<()> {
        Self::mv(cx, amount, true)
    }
    fn withdraw(&self, cx: &AdapterCtx, amount: u64) -> Result<()> {
        Self::mv(cx, amount, false)
    }
    fn value(&self, cx: &AdapterCtx, now: i64) -> Result<u64> {
        Self::check(cx)?;
        let load = |i: usize| -> Result<Vec<u8>> {
            let ai = acc(cx, i)?;
            require_keys_eq!(*ai.owner, mock_lending::ID, ChestError::AccountMismatch);
            Ok(ai.try_borrow_data()?.to_vec())
        };
        let pool = mock_lending::LendingPool::try_deserialize(&mut load(1)?.as_slice())?;
        let dep = mock_lending::LendingDeposit::try_deserialize(&mut load(2)?.as_slice())?;
        require_keys_eq!(dep.owner, cx.authority.key(), ChestError::AccountMismatch);
        require_keys_eq!(dep.pool, acc(cx, 1)?.key(), ChestError::AccountMismatch);
        Ok(mock_lending::deposit_value(&pool, &dep, now))
    }
}

// ---------------------------------------------------------------- kamino ---

#[cfg(feature = "kamino")]
mod kamino {
    //! Kamino Lend (`KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD`).
    //!
    //! Remaining accounts (both deposit and withdraw):
    //! `[klend program, reserve, lending_market, lending_market_authority,
    //!   reserve_liquidity_supply, reserve_collateral_mint,
    //!   collateral ATA (chest_market's), collateral token program,
    //!   instructions sysvar]`.
    //! The keeper must prepend `refresh_reserve` in the same transaction.
    use super::*;
    use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
    use anchor_lang::solana_program::program::invoke_signed;
    use backstop_common::ids;

    pub struct KaminoAdapter;

    // Reserve layout offsets (Anchor account, incl. 8-byte discriminator).
    // VERIFY against the deployed klend IDL before enabling (D-040).
    const LIQ_MINT: usize = 128;
    const LIQ_AVAILABLE: usize = 224;
    const LIQ_BORROWED_SF: usize = 232;
    const LIQ_PROTOCOL_FEES_SF: usize = 344;
    const LIQ_REFERRER_FEES_SF: usize = 360;
    const LIQ_PENDING_REFERRER_SF: usize = 376;
    const COLL_MINT: usize = 2560;
    const COLL_SUPPLY: usize = 2592;
    const SF_SHIFT: u32 = 60;

    fn disc(name: &str) -> [u8; 8] {
        let h = solana_sha256_hasher::hashv(&[format!("global:{name}").as_bytes()]).to_bytes();
        h[..8].try_into().unwrap()
    }

    fn rd_u64(d: &[u8], o: usize) -> Result<u64> {
        Ok(u64::from_le_bytes(
            d.get(o..o + 8)
                .ok_or(error!(ChestError::AdapterUnsupported))?
                .try_into()
                .unwrap(),
        ))
    }
    fn rd_u128(d: &[u8], o: usize) -> Result<u128> {
        Ok(u128::from_le_bytes(
            d.get(o..o + 16)
                .ok_or(error!(ChestError::AdapterUnsupported))?
                .try_into()
                .unwrap(),
        ))
    }
    fn rd_key(d: &[u8], o: usize) -> Result<Pubkey> {
        Ok(Pubkey::new_from_array(
            d.get(o..o + 32)
                .ok_or(error!(ChestError::AdapterUnsupported))?
                .try_into()
                .unwrap(),
        ))
    }

    /// (total liquidity, collateral supply), with layout sanity checks.
    fn exchange(cx: &AdapterCtx) -> Result<(u128, u128)> {
        let reserve = acc(cx, 1)?;
        require_keys_eq!(
            *reserve.owner,
            ids::KAMINO_LEND,
            ChestError::AccountMismatch
        );
        require_keys_eq!(
            reserve.key(),
            cx.market.adapter_pool,
            ChestError::AccountMismatch
        );
        let d = reserve.try_borrow_data()?;
        require_keys_eq!(
            rd_key(&d, LIQ_MINT)?,
            cx.quote_mint.key(),
            ChestError::AdapterUnsupported
        );
        require_keys_eq!(
            rd_key(&d, COLL_MINT)?,
            acc(cx, 5)?.key(),
            ChestError::AdapterUnsupported
        );
        let total = (rd_u64(&d, LIQ_AVAILABLE)? as u128)
            .saturating_add(rd_u128(&d, LIQ_BORROWED_SF)? >> SF_SHIFT)
            .saturating_sub(rd_u128(&d, LIQ_PROTOCOL_FEES_SF)? >> SF_SHIFT)
            .saturating_sub(rd_u128(&d, LIQ_REFERRER_FEES_SF)? >> SF_SHIFT)
            .saturating_sub(rd_u128(&d, LIQ_PENDING_REFERRER_SF)? >> SF_SHIFT);
        let supply = rd_u64(&d, COLL_SUPPLY)? as u128;
        require!(total > 0 && supply > 0, ChestError::AdapterUnsupported);
        Ok((total, supply))
    }

    fn invoke(cx: &AdapterCtx, name: &str, amount: u64, deposit: bool) -> Result<()> {
        require_keys_eq!(
            acc(cx, 0)?.key(),
            ids::KAMINO_LEND,
            ChestError::AccountMismatch
        );
        let mut data = disc(name).to_vec();
        data.extend_from_slice(&amount.to_le_bytes());
        let (reserve, market, market_auth, supply, coll_mint, coll_ata, coll_prog, ix_sysvar) = (
            acc(cx, 1)?,
            acc(cx, 2)?,
            acc(cx, 3)?,
            acc(cx, 4)?,
            acc(cx, 5)?,
            acc(cx, 6)?,
            acc(cx, 7)?,
            acc(cx, 8)?,
        );
        require_keys_eq!(
            coll_ata.key(),
            cx.market.adapter_position,
            ChestError::AccountMismatch
        );
        let metas = if deposit {
            vec![
                AccountMeta::new_readonly(cx.authority.key(), true),
                AccountMeta::new(reserve.key(), false),
                AccountMeta::new_readonly(market.key(), false),
                AccountMeta::new_readonly(market_auth.key(), false),
                AccountMeta::new_readonly(cx.quote_mint.key(), false),
                AccountMeta::new(supply.key(), false),
                AccountMeta::new(coll_mint.key(), false),
                AccountMeta::new(cx.vault.key(), false),
                AccountMeta::new(coll_ata.key(), false),
                AccountMeta::new_readonly(coll_prog.key(), false),
                AccountMeta::new_readonly(cx.token_program.key(), false),
                AccountMeta::new_readonly(ix_sysvar.key(), false),
            ]
        } else {
            vec![
                AccountMeta::new_readonly(cx.authority.key(), true),
                AccountMeta::new_readonly(market.key(), false),
                AccountMeta::new(reserve.key(), false),
                AccountMeta::new_readonly(market_auth.key(), false),
                AccountMeta::new_readonly(cx.quote_mint.key(), false),
                AccountMeta::new(coll_mint.key(), false),
                AccountMeta::new(supply.key(), false),
                AccountMeta::new(coll_ata.key(), false),
                AccountMeta::new(cx.vault.key(), false),
                AccountMeta::new_readonly(coll_prog.key(), false),
                AccountMeta::new_readonly(cx.token_program.key(), false),
                AccountMeta::new_readonly(ix_sysvar.key(), false),
            ]
        };
        let mut infos = vec![
            cx.authority.clone(),
            cx.quote_mint.clone(),
            cx.vault.clone(),
            cx.token_program.clone(),
        ];
        infos.extend(cx.accounts.iter().cloned());
        invoke_signed(
            &Instruction {
                program_id: ids::KAMINO_LEND,
                accounts: metas,
                data,
            },
            &infos,
            cx.signer_seeds,
        )?;
        Ok(())
    }

    impl YieldAdapter for KaminoAdapter {
        fn deposit(&self, cx: &AdapterCtx, amount: u64) -> Result<()> {
            invoke(cx, "deposit_reserve_liquidity", amount, true)
        }
        fn withdraw(&self, cx: &AdapterCtx, amount: u64) -> Result<()> {
            let (total, supply) = exchange(cx)?;
            let collateral = ((amount as u128) * supply).div_ceil(total) as u64;
            invoke(cx, "redeem_reserve_collateral", collateral, false)
        }
        fn value(&self, cx: &AdapterCtx, _now: i64) -> Result<u64> {
            let (total, supply) = exchange(cx)?;
            let coll = acc(cx, 6)?;
            let d = coll.try_borrow_data()?;
            let held = rd_u64(&d, 64)? as u128;
            Ok((held * total / supply) as u64)
        }
    }
}
