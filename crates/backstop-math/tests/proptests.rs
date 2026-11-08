//! Property tests for the numerically critical parts of BACKSTOP.

use backstop_math::allocation::{allocate, capacity, make_lots, random_offset, PRICE_SCALE};
use backstop_math::amm;
use backstop_math::fees::{split, FeeSplitParams};
use backstop_math::rewards::{settle, RewardGlobal, UserRewards, VecRing, REWARD_SCALE};
use backstop_math::shield::ShieldPool;
use backstop_math::tenure::{Tenure, SECONDS_PER_DAY};
use backstop_math::weight::{linear_weight, LinearWeight, WeightParams};
use proptest::prelude::*;

#[derive(Debug, Clone)]
enum Op {
    Buy { who: usize, amount: u64 },
    Sell { who: usize, amount: u64 },
    Credit { who: usize, extra: u64 },
    Wait { secs: u64 },
    Deposit { amount: u64 },
    Poke { who: usize },
}

fn op_strategy(n: usize) -> impl Strategy<Value = Op> {
    prop_oneof![
        3 => (0..n, 1u64..1_000_000_000_000).prop_map(|(who, amount)| Op::Buy { who, amount }),
        1 => (0..n, 1u64..1_000_000_000_000).prop_map(|(who, amount)| Op::Sell { who, amount }),
        1 => (0..n, 0u64..10_000_000_000_000).prop_map(|(who, extra)| Op::Credit { who, extra }),
        4 => (0u64..(40 * SECONDS_PER_DAY)).prop_map(|secs| Op::Wait { secs }),
        3 => (1u64..10_000_000_000).prop_map(|amount| Op::Deposit { amount }),
        1 => (0..n).prop_map(|who| Op::Poke { who }),
    ]
}

struct Wallet {
    tenure: Tenure,
    lw: LinearWeight,
    rewards: UserRewards,
    /// Brute-force earnings in exact scaled units, accumulated per boundary.
    brute_scaled: u128,
    /// Number of settlements (each may floor away < 1 unit).
    settlements: u64,
}

struct Sim {
    p: WeightParams,
    g: RewardGlobal,
    ring: VecRing,
    wallets: Vec<Wallet>,
    now: i64,
}

impl Sim {
    fn new(n: usize) -> Self {
        let p = WeightParams {
            cap_secs: 90 * SECONDS_PER_DAY,
            extra_bps: 20_000,
            epoch_secs: 6 * 3600,
            genesis_ts: 1_700_000_000,
        };
        let now = p.genesis_ts + 17;
        let g = RewardGlobal::default();
        let wallets = (0..n)
            .map(|_| Wallet {
                tenure: Tenure::new(now),
                lw: LinearWeight::ZERO,
                rewards: UserRewards::new_at(&g),
                brute_scaled: 0,
                settlements: 0,
            })
            .collect();
        Self {
            p,
            g,
            ring: VecRing::default(),
            wallets,
            now,
        }
    }

    /// Process boundaries one at a time, checking W_k against brute force and
    /// accumulating the brute-force reward of each wallet.
    fn catch_up(&mut self) {
        let target = self.p.epoch_at(self.now);
        while self.g.last_epoch < target {
            let k = self.g.last_epoch + 1;
            let brute_w: u128 = self
                .wallets
                .iter()
                .map(|w| w.lw.weight_at(k).unwrap())
                .sum();
            let r_before = self.g.r;
            self.g.advance_to(&mut self.ring, k, 1).unwrap();
            assert_eq!(
                self.g.totals.total_at(k).unwrap(),
                brute_w,
                "W_k mismatch at k={k}"
            );
            let rk = self.g.r.wrapping_sub(r_before);
            for w in self.wallets.iter_mut() {
                w.brute_scaled += rk * w.lw.weight_at(k).unwrap();
            }
        }
    }

    fn touch(&mut self, who: usize, f: impl FnOnce(&mut Tenure, i64)) {
        self.catch_up();
        let w = &mut self.wallets[who];
        settle(&mut w.rewards, &w.lw, &self.g, &self.ring).unwrap();
        w.settlements += 1;
        self.g.remove_weight(&mut self.ring, &w.lw).unwrap();
        f(&mut w.tenure, self.now);
        w.lw = linear_weight(&w.tenure, self.now, self.g.last_epoch, &self.p).unwrap();
        self.g.add_weight(&mut self.ring, &w.lw).unwrap();
    }

    fn apply(&mut self, op: &Op) {
        match *op {
            Op::Buy { who, amount } => self.touch(who, |t, now| t.on_inbound(amount, now).unwrap()),
            Op::Sell { who, amount } => {
                self.touch(who, |t, now| t.on_outbound_reset(amount, now).unwrap())
            }
            Op::Credit { who, extra } => {
                self.touch(who, |t, now| t.credit(extra as u128, now).unwrap())
            }
            Op::Poke { who } => self.touch(who, |t, now| t.materialize(now).unwrap()),
            Op::Wait { secs } => {
                self.now += secs as i64;
                // Mimic the keeper: checkpoint wallets idle for > 300 epochs so
                // their last linear boundary never leaves the 512-entry ring.
                let k = self.p.epoch_at(self.now);
                for who in 0..self.wallets.len() {
                    if k.saturating_sub(self.wallets[who].rewards.last_epoch) > 300 {
                        self.touch(who, |t, now| t.materialize(now).unwrap());
                    }
                }
            }
            Op::Deposit { amount } => {
                self.catch_up();
                self.g.deposit(amount).unwrap();
            }
        }
    }

    fn finish(&mut self) {
        self.now += 2 * self.p.epoch_secs as i64;
        self.catch_up();
        for w in self.wallets.iter_mut() {
            settle(&mut w.rewards, &w.lw, &self.g, &self.ring).unwrap();
            w.settlements += 1;
        }
    }
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 256, .. ProptestConfig::default() })]

    /// The closed-form accumulator matches the brute-force O(n) computation,
    /// never over-pays, and W_k equals Σ w_i(k) exactly at every boundary.
    #[test]
    fn rewards_match_brute_force(ops in prop::collection::vec(op_strategy(5), 1..120)) {
        let mut sim = Sim::new(5);
        for op in &ops {
            sim.apply(op);
        }
        sim.finish();
        let mut paid: u128 = 0;
        for w in &sim.wallets {
            let brute = w.brute_scaled / REWARD_SCALE;
            let got = w.rewards.pending as u128;
            prop_assert!(got <= brute, "over-paid: got {} brute {}", got, brute);
            prop_assert!(brute - got <= w.settlements as u128, "under-paid beyond rounding: got {} brute {}", got, brute);
            paid += got;
        }
        prop_assert!(paid <= sim.g.total_distributed as u128);
        prop_assert_eq!(sim.g.total_deposited, sim.g.total_distributed + sim.g.pending);
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
        let total: u64 = caps.iter().sum();
        prop_assume!(total > 0);
        let u = random_offset(&seed, total).unwrap();
        let mut q = 0;
        let mut sum = 0;
        for &c in &caps {
            let n = allocate(q, c, total, available, u).unwrap();
            prop_assert!(n <= c);
            let exact = c as f64 * (available.min(total)) as f64 / total as f64;
            if total > available {
                prop_assert!((n as f64 - exact).abs() < 1.0);
            } else {
                prop_assert_eq!(n, c);
            }
            sum += n;
            q += c;
        }
        prop_assert_eq!(sum, total.min(available));
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
