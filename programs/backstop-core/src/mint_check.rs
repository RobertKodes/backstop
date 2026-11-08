//! On-chain verification that a mint is safe to run on the engine (D-014).
//! Applied to BACKSTOP and to every launchpad child before going live.

use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::extension::{
    transfer_hook::TransferHook, BaseStateWithExtensions, ExtensionType, StateWithExtensions,
};
use anchor_spl::token_2022::spl_token_2022::state::Mint as T22Mint;
use backstop_common::{defaults, ids};

use crate::errors::CoreError;

/// Extensions a market mint may carry. Everything else (PermanentDelegate,
/// TransferFee, ConfidentialTransfer, DefaultAccountState, NonTransferable,
/// Pausable, MintCloseAuthority, InterestBearing, ScaledUiAmount, …) is
/// rejected.
const ALLOWED: [ExtensionType; 3] = [ExtensionType::TransferHook, ExtensionType::MetadataPointer, ExtensionType::TokenMetadata];

pub struct VerifiedMint {
    pub supply: u64,
}

pub fn verify_engine_mint(ai: &AccountInfo) -> Result<VerifiedMint> {
    require_keys_eq!(*ai.owner, ids::TOKEN_2022, CoreError::UnsafeMint);
    let data = ai.try_borrow_data()?;
    let st = StateWithExtensions::<T22Mint>::unpack(&data).map_err(|_| error!(CoreError::UnsafeMint))?;
    require!(st.base.decimals == defaults::DECIMALS, CoreError::BadDecimals);
    require!(Option::<Pubkey>::from(st.base.mint_authority).is_none(), CoreError::MintAuthorityNotRevoked);
    require!(Option::<Pubkey>::from(st.base.freeze_authority).is_none(), CoreError::FreezeAuthorityPresent);
    require!(st.base.supply > 0, CoreError::UnsafeMint);
    let types = st.get_extension_types().map_err(|_| error!(CoreError::UnsafeMint))?;
    for t in &types {
        require!(ALLOWED.contains(t), CoreError::ForbiddenExtension);
    }
    let hook = st.get_extension::<TransferHook>().map_err(|_| error!(CoreError::BadTransferHook))?;
    require!(Option::<Pubkey>::from(hook.program_id) == Some(ids::HOOK), CoreError::BadTransferHook);
    require!(Option::<Pubkey>::from(hook.authority).is_none(), CoreError::BadTransferHook);
    Ok(VerifiedMint { supply: st.base.supply })
}
