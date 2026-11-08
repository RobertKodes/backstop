//! Tenure-weighted reward accumulator vs a brute-force O(n) model.
//! Each 10-byte record: tag, wallet, u64 value.
#![no_main]
use backstop_math::check::{check_rewards, RewardOp};
use libfuzzer_sys::fuzz_target;

const WALLETS: usize = 6;

fuzz_target!(|data: &[u8]| {
    let ops: Vec<RewardOp> = data
        .chunks_exact(10)
        .take(400)
        .map(|r| {
            let mut v = [0u8; 8];
            v.copy_from_slice(&r[2..10]);
            RewardOp::from_bytes(r[0], r[1], u64::from_le_bytes(v), WALLETS)
        })
        .collect();
    if ops.is_empty() {
        return;
    }
    if let Err(e) = check_rewards(WALLETS, &ops) {
        panic!("{e}");
    }
});
