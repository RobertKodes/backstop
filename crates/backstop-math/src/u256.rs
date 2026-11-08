//! 256-bit helpers for `a * b / c` style computations whose intermediate
//! product may exceed `u128`.

use crate::error::{MathError, MathResult};

#[allow(
    clippy::manual_div_ceil,
    clippy::assign_op_pattern,
    clippy::ptr_offset_with_cast
)]
mod inner {
    uint::construct_uint! {
        /// Unsigned 256-bit integer.
        pub struct U256(4);
    }
}
pub use inner::U256;

#[inline]
pub fn to_u128(v: U256) -> MathResult<u128> {
    if v.bits() > 128 {
        return Err(MathError::Overflow);
    }
    Ok(v.as_u128())
}

/// `floor(a * b / d)`.
#[inline]
pub fn mul_div_floor(a: u128, b: u128, d: u128) -> MathResult<u128> {
    if d == 0 {
        return Err(MathError::DivisionByZero);
    }
    to_u128(U256::from(a) * U256::from(b) / U256::from(d))
}

/// `ceil(a * b / d)`.
#[inline]
pub fn mul_div_ceil(a: u128, b: u128, d: u128) -> MathResult<u128> {
    if d == 0 {
        return Err(MathError::DivisionByZero);
    }
    let p = U256::from(a) * U256::from(b);
    let d = U256::from(d);
    let q = p / d;
    let r = p % d;
    to_u128(if r.is_zero() { q } else { q + U256::one() })
}

/// `floor(a * b / d)` for signed `a` (floor toward negative infinity).
#[inline]
pub fn mul_div_floor_signed(a: i128, b: u128, d: u128) -> MathResult<i128> {
    if d == 0 {
        return Err(MathError::DivisionByZero);
    }
    let mag = U256::from(a.unsigned_abs()) * U256::from(b);
    let d = U256::from(d);
    if a >= 0 {
        let q = to_u128(mag / d)?;
        i128::try_from(q).map_err(|_| MathError::Overflow)
    } else {
        // floor(-x) = -ceil(x)
        let q = mag / d;
        let r = mag % d;
        let c = to_u128(if r.is_zero() { q } else { q + U256::one() })?;
        let c = i128::try_from(c).map_err(|_| MathError::Overflow)?;
        Ok(-c)
    }
}

/// Integer ceiling division for `u128`.
#[inline]
pub fn ceil_div(a: u128, b: u128) -> MathResult<u128> {
    if b == 0 {
        return Err(MathError::DivisionByZero);
    }
    Ok(a / b + u128::from(!a.is_multiple_of(b)))
}

/// Ceiling of `a / b` for signed numerator and positive denominator.
#[inline]
pub fn ceil_div_signed(a: i128, b: i128) -> MathResult<i128> {
    if b <= 0 {
        return Err(MathError::DivisionByZero);
    }
    let q = a / b; // truncates toward zero
    let r = a % b;
    Ok(if r > 0 { q + 1 } else { q })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mul_div_basic() {
        assert_eq!(mul_div_floor(10, 10, 3).unwrap(), 33);
        assert_eq!(mul_div_ceil(10, 10, 3).unwrap(), 34);
        assert_eq!(mul_div_ceil(9, 1, 3).unwrap(), 3);
        assert_eq!(mul_div_floor(u128::MAX, 2, 2).unwrap(), u128::MAX);
        assert!(mul_div_floor(u128::MAX, 3, 2).is_err());
        assert!(mul_div_floor(1, 1, 0).is_err());
    }

    #[test]
    fn signed_floor() {
        assert_eq!(mul_div_floor_signed(-10, 1, 3).unwrap(), -4);
        assert_eq!(mul_div_floor_signed(10, 1, 3).unwrap(), 3);
        assert_eq!(mul_div_floor_signed(-9, 1, 3).unwrap(), -3);
        assert_eq!(mul_div_floor_signed(0, 5, 3).unwrap(), 0);
    }

    #[test]
    fn ceil_div_signed_works() {
        assert_eq!(ceil_div_signed(7, 2).unwrap(), 4);
        assert_eq!(ceil_div_signed(-7, 2).unwrap(), -3);
        assert_eq!(ceil_div_signed(-8, 2).unwrap(), -4);
        assert_eq!(ceil_div_signed(0, 2).unwrap(), 0);
    }
}
