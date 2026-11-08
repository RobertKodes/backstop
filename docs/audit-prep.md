# Audit preparation

## 1. Scope

| Component | Path | Non-blank, non-comment Rust lines |
|---|---|---|
| transfer-hook | `programs/transfer-hook` | 1 411 |
| backstop-core | `programs/backstop-core` | 1 957 |
| backstop-amm | `programs/backstop-amm` | 810 |
| backstop-offers | `programs/backstop-offers` | 1 372 |
| backstop-chest (incl. Shield, yield adapters) | `programs/backstop-chest` | 1 958 |
| backstop-launchpad | `programs/backstop-launchpad` | 899 |
| backstop-math (all numeric logic) | `crates/backstop-math` | 2 333 |
| backstop-common (ids, seeds, PDAs, CPI helpers) | `crates/backstop-common` | 316 |

Out of scope: `programs/mock-swap`, `programs/mock-lending` (test doubles),
off-chain services (separate review recommended for the keeper's swap path and
the agent's policy gate).

Toolchain: Rust 1.99.1, Agave 4.4.1, Anchor 1.2.2, Solana v3 crates
(see DECISIONS D-002). Commit hash and verifiable build hashes are recorded in
`audits/SIGNOFF` at sign-off.

## 2. How to build and test

```bash
bash scripts/build-programs.sh          # SBF + IDLs (BACKSTOP_NO_RUSTUP=1 on rustup < 1.28)
cargo test --workspace                  # unit, property, LiteSVM integration (119+ tests)
FUZZ_CASES=1000000 cargo test -p backstop-math --test proptests --release
cargo +nightly fuzz run allocator|rewards|tenure   # from fuzz/
bash scripts/rehearse-localnet.sh       # validator with all programs, then:
pnpm --filter ./scripts/ts genesis --cluster localnet
pnpm --filter ./scripts/ts seed --cluster localnet --fast --crank --child
```

## 3. Invariants → tests

| Invariant (spec §4) | Where enforced | Tests |
|---|---|---|
| Σ chest balances + buffer + deployed principal = vault + adapter position (± rounding) | chest share accounting (D-027) | `tests/programs/tests/chest.rs::assert_chest_invariants` (called after every chest scenario) |
| Total fees collected = chests + Shield + treasury (+ parent) | `backstop_math::fees::split`, `Market` fee totals | `fee_split_exact` (proptest), `amm.rs::buy_routes_fee_and_keeps_k`, `chest.rs::fees_reach_chests_by_tenure_weight` |
| No offer settles below its frozen fill price | `make_lots` rounds lot cost up | `lots_respect_fill_price` (proptest), `offers.rs` lifecycles |
| Escrowed tokens = remaining unfilled amount | `OfferBook.total_escrowed` vs escrow vault | `offers.rs::oversubscribed_offer_full_lifecycle`, `undersubscribed_offer_routes_remainder_to_amm` |
| Tenure never decreases except on reset | `Tenure` (math) | `tenure_monotone`, `tenure_total` (proptest + fuzz), `hook.rs::direct_transfer_resets_sender_and_tracks_receiver` |
| Treasury SOL decreases only via redemption or timelocked action | `redeem`, `execute_action` | `core.rs::redemption_pays_pro_rata_floor_and_burns`, `redemption_pause_and_treasury_withdraw_need_48h_timelock` |
| Hook rejects non-allowlisted program-owned destinations | `execute` checks (D-012) | `hook.rs::rejects_direct_transfer_to_program_owned_account`, `rejects_destination_without_immutable_owner`, `rejects_movement_initiated_by_foreign_program`, `rejects_direct_invocation_of_execute` |
| Reward totals: W(k) = Σ wᵢ(k); payouts never exceed deposits | `RewardGlobal` (D-020) | `rewards_match_brute_force` (1 M cases), fuzz `rewards`, `hook.rs::reward_totals_equal_sum_of_holder_weights` |
| Allocation: floor/ceil of pro-rata, exact totals | `allocate` (D-022) | `allocation_invariants`, `allocation_extremes`, fuzz `allocator` |
| AMM k never decreases | `amm::buy/sell` | `amm_k_monotone`, `round_trip_costs_fees_and_k_monotone` |
| Shield solvency | `ShieldPool` (D-026) | `shield_solvent`, `chest.rs::shield_takes_priority_slice_and_shares_gains` |
| Agent bounded + rate-limited | `agent_set_param` | `core.rs::agent_is_bounded_and_rate_limited` |
| Guardian can pause, not unpause / not exits | `set_pauses` | `core.rs::guardian_can_pause_but_not_unpause` |
| Child mint safety, ≤ 5 % vested creator allocation, ≥ 5 SOL liquidity | launchpad (D-051) | `launchpad.rs::child_launch_end_to_end`, `launch_rules_are_enforced`, `creator_allocation_vests_linearly` |
| Market creation rejects unsafe mints and squatters | `mint_check` | `core.rs::init_market_enforces_mint_safety`, `init_market_rejects_squatters` |

## 4. Areas we would like reviewers to focus on

1. **Transfer-hook allowlist** (`programs/transfer-hook/src/instructions/execute.rs`):
   instructions-sysvar top-level check, on-curve destination check,
   ImmutableOwner requirement, extra-account-meta resolution; CU cost
   (~58 k steady state).
2. **Reward accumulator** (`crates/backstop-math/src/rewards.rs`, `weight.rs`):
   closed-form payout, 512-slot ring, inline catch-up limit (32) and the
   `advance_epochs` crank; wrapping accumulators.
3. **Settlement** (`programs/backstop-offers/src/instructions/settle.rs`,
   `programs/backstop-chest/src/instructions/absorb.rs` (`settle_offer`)): Shield
   priority slice, SlotHashes randomness, lazy per-bid claims, tenure credit.
4. **Keeper swap path** (`backstop-core` `convert_*`): oracle bound, balance
   delta measurement, planted delegate / close authority checks on vaults,
   Jupiter route accounts passed as remaining accounts.
5. **Chest share accounting + yield adapter** (`programs/backstop-chest/src/ledger.rs`,
   `yield_adapter.rs`): virtual offset, adapter value caching, `unwind`.
6. **Launchpad CPIs** (`programs/backstop-launchpad/src/instructions.rs`):
   mint construction, authority revocations, PDA signer seeds.

## 5. Known limitations and open items

| Item | Status | Reference |
|---|---|---|
| Kamino adapter verified only against the mock lending program; needs a mainnet-fork run | open | D-040 |
| Marginfi adapter documented, not implemented | open | D-040 |
| Parent-share Jupiter route source rewrite unverified on mainnet fork | open | D-052 |
| Randomness: leader of `rand_slot` can bias ≤ 1 lot per bidder; VRF adapter not implemented | accepted | D-023 |
| Self-fill ring sees only token transfers; SOL/USDC-funded sybils possible | accepted (economically negative) | D-031, T1 |
| PDA-vault smart wallets cannot receive the token without allowlisting | accepted | D-012 |
| Sybil splitting of direct sells across wallets | mitigated by per-wallet + global caps | D-029 |
| Hook CU ~58 k per tracked transfer (wallets must set CU limits) | optimisation candidate | D-033 |

## 6. Trusted roles and external dependencies

Roles and their powers: see THREAT_MODEL.md §1. External programs: Token-2022,
Associated Token Account, Jupiter v6 (keeper swaps only), Pyth (oracle bound),
Kamino Lend (feature `kamino`), Squads v4 (governance/upgrade authority).
