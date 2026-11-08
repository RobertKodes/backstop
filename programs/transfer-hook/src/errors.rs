use anchor_lang::prelude::*;
use backstop_math::{MathError, MathResult};

#[error_code]
pub enum HookError {
    #[msg("Token movement initiated by a program that is not on the protocol allowlist")]
    UnauthorizedProgram,
    #[msg("Destination owner is a program account that is not on the protocol allowlist")]
    UnauthorizedDestination,
    #[msg("Direct transfers may only target wallet (on-curve) owners")]
    DirectTransferToProtocolAccount,
    #[msg("Destination token account must have the ImmutableOwner extension")]
    MissingImmutableOwner,
    #[msg("Hook invoked outside of a Token-2022 transfer")]
    NotTransferring,
    #[msg("Token account does not belong to this mint")]
    MintMismatch,
    #[msg("Account is not a Token-2022 account")]
    InvalidTokenAccount,
    #[msg("Mint does not use this program as its transfer hook")]
    WrongHookProgram,
    #[msg("Signer is not the current mint authority")]
    NotMintAuthority,
    #[msg("Caller is not authorised for this instruction")]
    Unauthorized,
    #[msg("Direct AMM sells exceed the rolling per-wallet cap; create an offer instead")]
    DirectSellCapExceeded,
    #[msg("Direct AMM sells require a registered holder account")]
    DirectSellRequiresHolder,
    #[msg("Reward state is not fully initialised (call grow_reward_state)")]
    RewardStateNotReady,
    #[msg("Reward epochs are too far behind; call advance_epochs first")]
    EpochCatchUpRequired,
    #[msg("Holder account does not match the wallet or mint")]
    HolderMismatch,
    #[msg("Holder still has a balance or unharvested rewards")]
    HolderNotEmpty,
    #[msg("Invalid parameter")]
    InvalidParameter,
    #[msg("Too many allowlist entries")]
    AllowlistFull,
    #[msg("Duplicate token account in sync list")]
    DuplicateAccount,
    #[msg("Arithmetic error")]
    MathOverflow,
    #[msg("Requested data is unavailable")]
    Unavailable,
}

/// Map pure-math errors into program errors (with a log line for context).
pub trait MathExt<T> {
    fn mx(self) -> Result<T>;
}

impl<T> MathExt<T> for MathResult<T> {
    #[inline]
    fn mx(self) -> Result<T> {
        self.map_err(|e| {
            msg!("math error: {}", e);
            match e {
                MathError::EpochCatchUpRequired => error!(HookError::EpochCatchUpRequired),
                MathError::InvalidParameter => error!(HookError::InvalidParameter),
                MathError::Unavailable => error!(HookError::Unavailable),
                _ => error!(HookError::MathOverflow),
            }
        })
    }
}
