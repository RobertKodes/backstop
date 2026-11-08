use anchor_lang::prelude::*;
use backstop_math::MathResult;

#[error_code]
pub enum ChestError {
    #[msg("Caller is not authorised")]
    Unauthorized,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Insufficient chest balance")]
    InsufficientBalance,
    #[msg("Insufficient idle liquidity; rebalance the yield adapter first")]
    InsufficientLiquidity,
    #[msg("Auto-Absorb is paused (emergency)")]
    AutoAbsorbPaused,
    #[msg("Auto-Absorb grant is disabled")]
    GrantDisabled,
    #[msg("Offer discount below the grant minimum")]
    DiscountTooLow,
    #[msg("Amount exceeds the per-offer or per-day Auto-Absorb limit")]
    GrantLimit,
    #[msg("Would spend below the reserve floor")]
    ReserveFloor,
    #[msg("Keeper not permitted by this grant")]
    KeeperNotAllowed,
    #[msg("Shield lock shorter than the minimum")]
    LockTooShort,
    #[msg("Shield position is still locked")]
    StillLocked,
    #[msg("Account does not match the market configuration")]
    AccountMismatch,
    #[msg("Yield adapter is not configured")]
    NoAdapter,
    #[msg("Yield adapter not supported in this build")]
    AdapterUnsupported,
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
            error!(ChestError::MathOverflow)
        })
    }
}
