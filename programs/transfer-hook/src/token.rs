//! Low-level helpers: Token-2022 account parsing, curve check and top-level
//! instruction introspection.

use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::extension::{
    transfer_hook::{TransferHook, TransferHookAccount},
    BaseStateWithExtensions, ExtensionType, StateWithExtensions,
};
use anchor_spl::token_2022::spl_token_2022::state::{Account as T22Account, Mint as T22Mint};
use backstop_common::ids;
use solana_instructions_sysvar::get_instruction_relative;

use crate::errors::HookError;

#[derive(Debug, Clone, Copy)]
pub struct TokenInfo {
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub transferring: bool,
    pub immutable_owner: bool,
}

/// Parse a Token-2022 token account.
pub fn read_token_account(ai: &AccountInfo) -> Result<TokenInfo> {
    require_keys_eq!(*ai.owner, ids::TOKEN_2022, HookError::InvalidTokenAccount);
    let data = ai.try_borrow_data()?;
    let st = StateWithExtensions::<T22Account>::unpack(&data)
        .map_err(|_| error!(HookError::InvalidTokenAccount))?;
    let transferring = st
        .get_extension::<TransferHookAccount>()
        .map(|e| bool::from(e.transferring))
        .unwrap_or(false);
    let immutable_owner = st
        .get_extension_types()
        .map(|types| types.contains(&ExtensionType::ImmutableOwner))
        .unwrap_or(false);
    Ok(TokenInfo {
        mint: st.base.mint,
        owner: st.base.owner,
        amount: st.base.amount,
        transferring,
        immutable_owner,
    })
}

/// Mint facts needed at initialisation.
pub struct MintInfo {
    pub mint_authority: Option<Pubkey>,
    pub hook_program: Option<Pubkey>,
    pub supply: u64,
    pub decimals: u8,
}

pub fn read_mint(ai: &AccountInfo) -> Result<MintInfo> {
    require_keys_eq!(*ai.owner, ids::TOKEN_2022, HookError::InvalidTokenAccount);
    let data = ai.try_borrow_data()?;
    let st = StateWithExtensions::<T22Mint>::unpack(&data)
        .map_err(|_| error!(HookError::InvalidTokenAccount))?;
    let hook_program = st
        .get_extension::<TransferHook>()
        .ok()
        .and_then(|h| Option::<Pubkey>::from(h.program_id));
    Ok(MintInfo {
        mint_authority: Option::<Pubkey>::from(st.base.mint_authority),
        hook_program,
        supply: st.base.supply,
        decimals: st.base.decimals,
    })
}

/// Whether `key` is a point on the ed25519 curve, i.e. an address that has a
/// private key (a wallet) rather than a program-derived address. Uses the
/// `sol_curve_validate_point` syscall on-chain.
#[allow(deprecated)] // solana-curve25519 3.x flags its API as "unstable"; the syscall is stable on mainnet.
pub fn is_on_curve(key: &Pubkey) -> bool {
    solana_curve25519::edwards::validate_edwards(&solana_curve25519::edwards::PodEdwardsPoint(
        key.to_bytes(),
    ))
}

/// Program id of the *top-level* instruction currently executing.
pub fn top_level_program(ix_sysvar: &AccountInfo) -> Result<Pubkey> {
    let ix = get_instruction_relative(0, ix_sysvar)?;
    Ok(ix.program_id)
}
