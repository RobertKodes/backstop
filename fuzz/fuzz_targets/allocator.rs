//! Offer allocator: exact totals, floor/ceil of pro-rata for every bidder,
//! no panic for any input. Input: 32-byte seed, 8-byte `available`, then
//! 8-byte capacities (small values are favoured by masking the top bits).
#![no_main]
use backstop_math::check::check_allocation;
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if data.len() < 41 {
        return;
    }
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&data[..32]);
    let mode = data[32];
    let word = |b: &[u8]| {
        let mut w = [0u8; 8];
        w[..b.len()].copy_from_slice(b);
        u64::from_le_bytes(w)
    };
    // mode selects the magnitude regime so both realistic and extreme inputs are covered
    let mask = match mode % 4 {
        0 => 0x3ff,
        1 => 0xf_ffff,
        2 => u64::MAX >> 2,
        _ => u64::MAX,
    };
    let available = word(&data[33..41]) & mask;
    let caps: Vec<u64> = data[41..].chunks(8).take(256).map(|c| word(c) & mask).collect();
    if let Err(e) = check_allocation(&caps, available, &seed) {
        panic!("{e}");
    }
});
