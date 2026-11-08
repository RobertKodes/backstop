use anchor_lang::prelude::*;
use backstop_math::MathResult;

#[error_code]
pub enum CoreError {
    #[msg("Invalid parameter value")]
    InvalidParameter,
    #[msg("Caller is not authorised")]
    Unauthorized,
    #[msg("Mint does not satisfy the BACKSTOP engine safety requirements")]
    UnsafeMint,
    #[msg("Mint authority must be revoked (fixed supply) before the market goes live")]
    MintAuthorityNotRevoked,
    #[msg("Mint must not have a freeze authority")]
    FreezeAuthorityPresent,
    #[msg("Mint uses a forbidden Token-2022 extension")]
    ForbiddenExtension,
    #[msg("Transfer hook must point at the BACKSTOP hook with no hook authority")]
    BadTransferHook,
    #[msg("Decimals must be 9")]
    BadDecimals,
    #[msg("Account does not match the market configuration")]
    AccountMismatch,
    #[msg("Redemption is paused (timelocked emergency action)")]
    RedemptionPaused,
    #[msg("Nothing to redeem / circulating supply is zero")]
    NothingToRedeem,
    #[msg("Redemption output below the requested minimum")]
    RedemptionSlippage,
    #[msg("Swap output below the oracle-bounded minimum")]
    SwapSlippage,
    #[msg("Swap amount exceeds the per-chunk maximum")]
    SwapTooLarge,
    #[msg("Swap program is not the configured one")]
    BadSwapProgram,
    #[msg("Oracle price is stale or invalid")]
    OracleUnavailable,
    #[msg("Agent update outside governance bounds")]
    OutOfBounds,
    #[msg("Parameter is not agent-tunable")]
    NotAgentTunable,
    #[msg("Agent cooldown has not elapsed")]
    Cooldown,
    #[msg("Timelock has not expired")]
    TimelockNotExpired,
    #[msg("Guardian may only set pause flags")]
    GuardianCannotUnpause,
    #[msg("Treasury balance insufficient")]
    InsufficientTreasury,
    #[msg("Arithmetic error")]
    MathOverflow,
}

pub trait MathExt<T> {
    fn mx(self) -> Result<T>;
}

impl<T> MathExt<T> for MathResult<T> {
    #[inline]
    fn mx(self) -> Result<T> {
        self.map_err(|e| {
            msg!("math error: {}", e);
            error!(CoreError::MathOverflow)
        })
    }
}
