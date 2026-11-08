use anchor_lang::prelude::*;

#[error_code]
pub enum LaunchpadError {
    #[msg("Caller is not authorised")]
    Unauthorized,
    #[msg("The launchpad is paused (emergency)")]
    Paused,
    #[msg("Name must be 1–32 bytes, symbol 1–10 bytes, URI ≤ 200 bytes")]
    BadMetadata,
    #[msg("Supply must be positive")]
    BadSupply,
    #[msg("Creator allocation exceeds the maximum (5 %)")]
    CreatorAllocationTooHigh,
    #[msg("Initial liquidity below the minimum (5 SOL)")]
    LiquidityTooLow,
    #[msg("Launch step called out of order")]
    WrongStep,
    #[msg("Hook reward state is not ready")]
    HookNotReady,
    #[msg("Nothing vested to claim")]
    NothingToClaim,
    #[msg("Arithmetic error")]
    MathOverflow,
}
