//! # backstop-math
//!
//! Pure, allocation-free, deterministic math used by every BACKSTOP program.
//! Nothing in this crate touches Solana types, so it compiles natively for fast
//! unit/property/fuzz testing and identically to SBF for on-chain use.
//!
//! Conventions:
//! * All functions are checked: they return [`MathError`] instead of panicking
//!   or wrapping, **except** the explicitly documented wrapping accumulators
//!   (TWAP cumulative price, reward accumulators) whose consumers only ever use
//!   wrapping *differences* (the Uniswap-v2 technique).
//! * Rounding always favours the protocol / the pool / the remaining
//!   participants, never the caller. Each function documents its direction.
//! * `bps` = basis points, 10_000 = 100 %.

pub mod allocation;
pub mod amm;
#[cfg(feature = "check")]
pub mod check;
pub mod discount;
pub mod error;
pub mod fees;
pub mod rewards;
pub mod shares;
pub mod shield;
pub mod tenure;
pub mod twap;
pub mod u256;
pub mod weight;

pub use error::{MathError, MathResult};

/// 100 % in basis points.
pub const BPS: u64 = 10_000;
