use anchor_lang::prelude::*;
use backstop_math::{MathError, MathResult};

#[error_code]
pub enum AmmError {
    #[msg("Caller is not authorised")]
    Unauthorized,
    #[msg("Output below the requested minimum")]
    Slippage,
    #[msg("Direct sells must be below the minimum offer size; create an offer")]
    UseOfferBook,
    #[msg("Global hourly cap on direct sells reached")]
    DirectSellHourlyCap,
    #[msg("Purchase exceeds the Return Ticket allowance")]
    TicketExceeded,
    #[msg("Account does not match the pool configuration")]
    AccountMismatch,
    #[msg("Pool liquidity insufficient")]
    InsufficientLiquidity,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("TWAP history unavailable for the requested window")]
    TwapUnavailable,
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
            match e {
                MathError::InsufficientLiquidity => error!(AmmError::InsufficientLiquidity),
                MathError::Unavailable => error!(AmmError::TwapUnavailable),
                _ => error!(AmmError::MathOverflow),
            }
        })
    }
}
