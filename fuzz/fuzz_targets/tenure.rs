//! Tenure accumulator with unbounded inputs: never panics, monotone on
//! inbound/credit, zero after an outbound reset. Each 13-byte record:
//! kind, u64 amount, u32 seconds elapsed.
#![no_main]
use backstop_math::check::check_tenure;
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let steps: Vec<(u8, u64, u32)> = data
        .chunks_exact(13)
        .take(256)
        .map(|r| {
            let mut a = [0u8; 8];
            a.copy_from_slice(&r[1..9]);
            let mut t = [0u8; 4];
            t.copy_from_slice(&r[9..13]);
            (r[0], u64::from_le_bytes(a), u32::from_le_bytes(t))
        })
        .collect();
    if let Err(e) = check_tenure(&steps) {
        panic!("{e}");
    }
});
