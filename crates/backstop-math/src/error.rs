use core::fmt;

/// Errors produced by checked protocol math.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MathError {
    /// An intermediate or final value exceeded its integer type.
    Overflow,
    /// Subtraction would go below zero where that is a logic error.
    Underflow,
    /// Division by zero.
    DivisionByZero,
    /// A parameter is outside its documented domain.
    InvalidParameter,
    /// A scheduled event falls outside the ring-buffer horizon.
    RingHorizonExceeded,
    /// Epoch processing needs more steps than allowed in one call.
    EpochCatchUpRequired,
    /// Requested data (e.g. TWAP history) is not available.
    Unavailable,
    /// Pool or vault has insufficient liquidity for the request.
    InsufficientLiquidity,
}

impl fmt::Display for MathError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            MathError::Overflow => "math overflow",
            MathError::Underflow => "math underflow",
            MathError::DivisionByZero => "division by zero",
            MathError::InvalidParameter => "invalid parameter",
            MathError::RingHorizonExceeded => "ring buffer horizon exceeded",
            MathError::EpochCatchUpRequired => "epoch catch-up required",
            MathError::Unavailable => "data unavailable",
            MathError::InsufficientLiquidity => "insufficient liquidity",
        };
        f.write_str(s)
    }
}

impl std::error::Error for MathError {}

pub type MathResult<T> = Result<T, MathError>;

/// Convenience: turn an `Option` from a `checked_*` op into an overflow error.
pub trait OrOverflow<T> {
    fn or_overflow(self) -> MathResult<T>;
}

impl<T> OrOverflow<T> for Option<T> {
    #[inline]
    fn or_overflow(self) -> MathResult<T> {
        self.ok_or(MathError::Overflow)
    }
}
