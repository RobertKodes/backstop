//! Property tests for the numerically critical parts of BACKSTOP.

use backstop_math::allocation::{capacity, make_lots, PRICE_SCALE};
use backstop_math::amm;
use backstop_math::check::{check_allocation, check_rewards, check_tenure, RewardOp};
use backstop_math::fees::{split, FeeSplitParams};
use backstop_math::shield::ShieldPool;
use backstop_math::tenure::{Tenure, SECONDS_PER_DAY};
use proptest::prelude::*;

fn op_strategy(n: usize) -> impl Strategy<Value = RewardOp> {
    prop_oneof![
        3 => (0..n, 1u64..1_000_000_000_000).prop_map(|(who, amount)| RewardOp::Buy { who, amount }),
        1 => (0..n, 1u64..1_000_000_000_000).prop_map(|(who, amount)| RewardOp::Sell { who, amount }),
        1 => (0..n, 0u64..10_000_000_000_000).prop_map(|(who, extra)| RewardOp::Credit { who, extra }),
        4 => (0u64..(40 * SECONDS_PER_DAY)).prop_map(|secs| RewardOp::Wait { secs }),
        3 => (1u64..10_000_000_000).prop_map(|amount| RewardOp::Deposit { amount }),
        1 => (0..n).prop_map(|who| RewardOp::Poke { who }),
    ]
}

/// `FUZZ_CASES=100000 cargo test -p backstop-math --test proptests --release`
/// for long runs; CI uses the default.
fn cases(default: u32) -> u32 {
    std::env::var("FUZZ_CASES")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

proptest! {
    #![proptest_config(ProptestConfig { cases: cases(256), .. ProptestConfig::default() })]

    /// The closed-form accumulator matches the brute-force O(n) computation,
    /// never over-pays, and W_k equals Σ w_i(k) exactly at every boundary.
    #[test]
    fn rewards_match_brute_force(ops in prop::collection::vec(op_strategy(5), 1..120)) {
        if let Err(e) = check_rewards(5, &ops) {
            prop_assert!(false, "{}", e);
        }
    }

    /// Tenure is split-invariant under any sequence of inbound amounts.
    #[test]
    fn tenure_split_invariant(amounts in prop::collection::vec(1u64..1_000_000_000, 1..20), t in 0i64..10_000_000) {
        let total: u64 = amounts.iter().sum();
        let mut one = Tenure::new(0);
        one.on_inbound(total, 0).unwrap();
        let sum: u128 = amounts.iter().map(|a| { let mut w = Tenure::new(0); w.on_inbound(*a, 0).unwrap(); w.tenure_at(t).unwrap() }).sum();
        prop_assert_eq!(sum, one.tenure_at(t).unwrap());
    }

    /// Tenure accumulator never decreases except on reset.
    #[test]
    fn tenure_monotone(steps in prop::collection::vec((0u8..3, 1u64..1_000_000, 0i64..100_000), 1..50)) {
        let mut t = Tenure::new(0);
        let mut now = 0;
        for (kind, amt, dt) in steps {
            now += dt;
            let before = t.tenure_at(now).unwrap();
            match kind {
                0 => { t.on_inbound(amt, now).unwrap(); prop_assert!(t.tenure_at(now).unwrap() >= before); }
                1 => { t.credit(amt as u128, now).unwrap(); prop_assert!(t.tenure_at(now).unwrap() >= before); }
                _ => { t.on_outbound_reset(amt, now).unwrap(); prop_assert_eq!(t.acc, 0); }
            }
        }
    }

    /// Allocation: exact totals, never above capacity, < 1 lot from pro-rata.
    #[test]
    fn allocation_invariants(caps in prop::collection::vec(0u64..10_000, 1..60), available in 1u64..200, seed in any::<[u8; 32]>()) {
        if let Err(e) = check_allocation(&caps, available, &seed) {
            prop_assert!(false, "{}", e);
        }
    }

    /// Allocation never panics or mis-allocates for extreme inputs.
    #[test]
    fn allocation_extremes(caps in prop::collection::vec(any::<u64>(), 1..8), available in any::<u64>(), seed in any::<[u8; 32]>()) {
        if let Err(e) = check_allocation(&caps, available, &seed) {
            prop_assert!(false, "{}", e);
        }
    }

    /// Tenure never panics and stays monotone for arbitrary inputs.
    #[test]
    fn tenure_total(steps in prop::collection::vec((any::<u8>(), any::<u64>(), any::<u32>()), 1..64)) {
        if let Err(e) = check_tenure(&steps) {
            prop_assert!(false, "{}", e);
        }
    }

    /// Paying `n × lot_cost` always meets the frozen fill price.
    #[test]
    fn lots_respect_fill_price(amount in 1_000u64..u64::MAX / 4, lots in 1u64..500, price in 1u128..(PRICE_SCALE * 1_000)) {
        prop_assume!(amount >= lots);
        if let Ok(l) = make_lots(amount, lots, price) {
            let paid = l.lot_cost as u128 * PRICE_SCALE;
            prop_assert!(paid >= l.lot_size as u128 * price);
            if let Some(bid) = l.lot_cost.checked_mul(3).and_then(|v| v.checked_add(1)) {
                prop_assert_eq!(capacity(bid, l.lot_cost).unwrap(), 3);
            }
        }
    }

    /// Fee split components always sum to the input.
    #[test]
    fn fee_split_exact(amount in any::<u64>(), chest in 0u32..=10_000, parent in 0u32..=10_000) {
        let shield = (10_000 - chest).min(1_000);
        let s = split(amount, &FeeSplitParams { chest_bps: chest, shield_bps: shield, parent_bps: parent }).unwrap();
        prop_assert_eq!(s.total(), amount);
    }

    /// AMM invariant k never decreases.
    #[test]
    fn amm_k_monotone(trades in prop::collection::vec((any::<bool>(), 1u64..10_000_000_000), 1..80)) {
        let (mut b, mut q) = (1_000_000_000_000_000_000u64, 10_000_000_000u64);
        for (is_buy, amt) in trades {
            let k0 = amm::k(b, q);
            let r = if is_buy { amm::buy(amt, b, q, 300) } else { amm::sell(amt, b, q, 300) };
            if let Ok(r) = r {
                if is_buy { q += r.reserve_in; b -= r.reserve_out; } else { b += r.reserve_in; q -= r.reserve_out; }
                prop_assert!(amm::k(b, q) >= k0);
            }
        }
    }

    /// Shield: Σ compounded ≤ tracked total; Σ token gains ≤ absorbed gains.
    #[test]
    fn shield_solvent(deposits in prop::collection::vec((1u64..1_000_000_000, 10_000u32..120_000), 1..8),
                      events in prop::collection::vec((0u64..=100, 0u64..1_000_000, 0u64..100_000), 1..40)) {
        let mut sp = ShieldPool::default();
        let mut positions = Vec::new();
        for (amt, m) in &deposits {
            positions.push(sp.deposit(*amt, *m).unwrap());
        }
        let mut gains = 0u64;
        let mut rewards = 0u64;
        for (pct, gain, reward) in events {
            let loss = (sp.total_deposits as u128 * pct as u128 / 100) as u64;
            if sp.total_deposits > 0 {
                sp.absorb(loss, gain).unwrap();
                gains += gain;
            }
            sp.distribute_rewards(reward).unwrap();
            rewards += reward;
        }
        let c: u64 = positions.iter().map(|p| sp.compounded(p).unwrap()).sum();
        let g: u64 = positions.iter().map(|p| sp.token_gain(p).unwrap()).sum();
        let r: u64 = positions.iter().map(|p| sp.reward_gain(p).unwrap()).sum();
        prop_assert!(c <= sp.total_deposits, "c {} > D {}", c, sp.total_deposits);
        prop_assert!(g <= gains);
        prop_assert!(r + sp.undistributed_rewards <= rewards);
    }
}
