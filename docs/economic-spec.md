# Economic specification

Every parameter below is a governable value in `MarketParams` (or `HookConfig`
for tenure/epochs). Defaults are in `crates/backstop-common/src/lib.rs`
(`defaults`). All formulas are implemented in `crates/backstop-math` with
checked arithmetic, u128/u256 intermediates and protocol-favouring rounding
(D-032).

> This is a token with an unusual exit mechanic — not a security, not an
> investment product. Nothing below promises any return. Yield from the
> lending adapter is **variable**, chest withdrawals are **time-locked**, and
> offer fills are not guaranteed.

## 1. Parameters

| Parameter | Field | Default | Hard range (on-chain validation) |
|---|---|---|---|
| Total supply | — | 1,000,000,000 (9 decimals), fixed | — |
| Team allocation | — | 0 % | — |
| Trade fee (AMM buy & sell, offer fills charged to the seller) | `trade_fee_bps` | 300 (3 %) | ≤ 1 000 |
| Fee split → holder chests | `split_chest_bps` | 7 000 | chest + shield ≤ 10 000 |
| Fee split → Shield rewards | `split_shield_bps` | 1 000 | |
| Fee split → SOL treasury | remainder | 2 000 | |
| Base discount | `base_discount_bps` | 500 | min ≤ base ≤ max |
| Discount slope up / down | `k_up_bps` / `k_down_bps` | 2 500 / 1 500 (0.25 / 0.15) | |
| Discount clamp | `min_discount_bps` / `max_discount_bps` | 200 / 1 200 | max < 5 000 |
| Offer window | `offer_window_secs` | 600 | 60 – 86 400 |
| Bid epoch (early-close granularity) | `bid_epoch_secs` | 60 | ≤ window |
| Minimum offer size | `min_offer_size` | 0.01 % of supply | > 0 |
| Lots per offer | `lots_per_offer` | 100 | 1 – 1 000 |
| Return Ticket validity | `ticket_validity_secs` | 7 days | ≤ 90 days |
| Chest withdrawal lock (rolling) | `chest_lock_secs` | 60 days | ≤ 365 days |
| Early-withdraw penalty (→ Shield rewards) | `chest_penalty_bps` | 2 500 | ≤ 5 000 |
| Redemption fee (→ Shield rewards) | `redemption_fee_bps` | 100 | ≤ 1 000 |
| Idle buffer kept out of the lending adapter | `yield_buffer_bps` | 2 000 | ≤ 10 000 |
| Shield per-offer cap | `shield_per_offer_cap` | 10 000 USDC | |
| Shield max share of an offer | `shield_max_share_bps` | 5 000 | ≤ 10 000 |
| Shield minimum lock | `shield_min_lock_secs` | 30 days | ≥ 1 day |
| Shield max lock multiplier | `shield_max_multiplier_bps` | 120 000 (12×) | ≥ 10 000 |
| Shield pump filter | `shield_max_premium_bps` | 2 000 | |
| Offer pricing TWAP window | `price_twap_window_secs` | 300 | ≥ 60 |
| Momentum lookback | `momentum_lookback_secs` | 3 600 | ≥ TWAP window |
| Global direct-sell cap | `direct_sell_hourly_cap` | 0.1 % of supply / hour | |
| Keeper swap slippage vs oracle | `max_swap_slippage_bps` | 50 (0.5 %) | ≤ 500 |
| Keeper swap chunk | `max_swap_chunk` | 50 000 quote units | > 0 |
| Tenure cap | `HookConfig.tenure_cap_secs` | 90 days | cap/epoch + 3 < 512 |
| Tenure multiplier extra | `HookConfig.tenure_extra_bps` | 20 000 (1.0 → 3.0) | |
| Absorber tenure share | `HookConfig.absorb_tenure_bps` | 4 000 (40 %) | |
| Reward epoch | `HookConfig.epoch_secs` | 6 h | |
| Launchpad parent share | `parent_share_bps` (children) | 3 000 | ≤ 5 000 via launchpad |
| Child min liquidity / max creator / vesting | `LaunchpadConfig` | 5 SOL / 5 % / 90 days | |

## 2. Tenure (§3.1)

For a wallet with lots `(aᵢ, tᵢ)` (amount, acquisition time):

```
tenure(now)  = Σ aᵢ · (now − tᵢ)           (token·seconds)
avg_age(now) = tenure(now) / balance
multiplier   = 1 + 2 · min(avg_age / 90 d, 1)        ∈ [1.0, 3.0]
weight       = balance · multiplier
```

Stored as `acc + balance·(now − last)` (O(1) per transfer). Properties
(property-tested and fuzzed):

* split-invariant (10 wallets × 10 tokens ≡ 1 wallet × 100 tokens);
* inbound transfer: new tokens start at age 0 (tenure unchanged);
* any outbound transfer or sell resets tenure to 0;
* absorbing an offer credits the absorber `40 % × lot_tenure` pro-rata to the
  absorbed lots (`credit_tenure`, seller's tenure frozen at offer creation);
* never decreases except on reset.

## 3. Chest fee distribution (exact, loop-free — D-020)

Each epoch boundary `k` (6 h) distributes the chest fee inflow `F_k` by
weight `w_i(k)`. Because weights grow continuously, each wallet stores a
piecewise-linear form `w_i(k) = α_i + β_i·k` until its cap epoch, after which
it is constant. The global keeps `A, B, C` and a 512-slot ring of scheduled
slope changes, so `W(k) = Σ w_i(k)` is exact. Payout to wallet *i* between
checkpoints uses accumulators `R = Σ F_k / W(k)` and `RT = Σ k·F_k / W(k)`:

```
earned_i = α_i · ΔR + β_i · ΔRT   (+ constant part after the cap epoch)
```

Verified against a brute-force O(n) model: never over-pays, under-pays by at
most 1 base unit per settlement, conserves `deposited = distributed + pending`
(`crates/backstop-math/src/check.rs`, 1 M+ randomised scenarios).

## 4. Counter-cyclical discount (§3.2)

```
m        = TWAP_now / TWAP_(now − 60 min) − 1
discount = clamp(base + k_up · max(m, 0) − k_down · max(−m, 0), min, max)
```

Defaults: +20 % hour → 5 % + 0.25·20 % = 10 %; −20 % hour → 5 % − 0.15·20 % =
2 %. Frozen at offer creation together with the TWAP.

## 5. Offers (§3.3)

* `fill_price = twap_at_creation × (1 − discount)`; the offer is split into
  `L` lots; `lot_cost = ceil(lot_size × fill_price)` so every fill meets the
  frozen price (property-tested: no settlement below the fill price).
* Seller cannot cancel. Tokens are escrowed at creation.
* Bids lock whole lots (`capacity = floor(bid / lot_cost)`, D-045). Self-fill
  blocked (D-031).
* Settlement: Shield priority slice `s = min(⌊L·max_share⌋, ⌊cap / lot_cost⌋,
  Shield funds)` (0 if the pump filter trips), then systematic sampling of the
  remaining `L' = L − s` lots over bidder capacities with random offset
  `U = H(slot_hash ‖ offer ‖ lots) mod C`:
  `nᵢ = ⌈(Qᵢ + cᵢ)·L'/C − U/C⌉ − ⌈Qᵢ·L'/C − U/C⌉` — each bidder gets the floor
  or ceil of its pro-rata share, totals are exact (fuzzed).
* Remainder lots → AMM (`sell_remainder`, permissionless).
* Seller receives fill proceeds − 3 % fee + remainder proceeds (AMM fee
  applies) and a Return Ticket for the absorbed amount (fee-free re-buy for 7
  days).
* Absorbers pay no buy fee on fills (D-024).

## 6. Chests (§3.4)

Share accounting over (idle vault + adapter value) with a virtual offset
(D-027). Deposits and reward harvests restart the 60-day rolling lock (D-028);
early withdrawal pays 25 % to Shield rewards. Auto-Absorb grants bound the
keeper per offer, per day, by minimum discount and reserve floor. Idle assets
above `yield_buffer_bps` of total chest assets are deployed to the
`YieldAdapter`; variable yield accrues pro-rata through the share price.

## 7. Shield (§3.5)

Liquity Stability Pool accounting (D-026): deposits deplete by a running
product `P` when the Shield absorbs; absorbed tokens accrue via `S`; the 10 %
fee stream + penalties + redemption fees accrue via `G`, weighted by
`principal × lock multiplier` (`lock / 30 d`, ≤ 12×). Positions lock ≥ 30
days; gains are claimable any time.

## 8. Treasury floor (§3.6)

```
floor_price = treasury_SOL / circulating,   circulating = supply − AMM base reserve   (D-030)
redeem(N)   → burn N, receive N·floor_price·(1 − 1 %) SOL; 1 % → Shield rewards (as SOL, converted by the keeper)
```

Redemption cannot be paused by the guardian; only a 48 h timelocked
governance action can, for emergencies. Treasury SOL decreases only through
redemption or a timelocked action (invariant-tested).

## 9. Launchpad (§3.7)

Child = same engine, quote wSOL (D-016). Fees split 70/10/20 inside the child
after reserving 30 % for the parent, which is swapped to USDC (oracle-bounded)
and deposited into BACKSTOP's holder reward accumulator (credited by tenure
weight). Creator: name/symbol/supply/liquidity (≥ 5 SOL, locked forever),
optional allocation ≤ 5 % vested linearly over 90 days on-chain.

## 10. Worked example (defaults)

A seller offers 1 000 000 tokens; TWAP 0.0100 USDC; hour momentum −8 % →
discount 5 % − 0.15·8 % = 3.8 % → fill price 0.00962. 100 lots of 10 000
tokens, lot cost 96.2 USDC. The Shield takes min(50 lots, 10 000/96.2 = 103) =
50 lots; bidders hold 80 lots of capacity for the remaining 50, each receiving
⌊62.5 %⌋ or ⌈62.5 %⌉ of its capacity. Proceeds 100 × 96.2 = 9 620 USDC; fee
288.6 USDC (202.0 → chests, 28.9 → Shield, 57.7 → treasury SOL); seller nets
9 331.4 USDC and a Return Ticket for 1 000 000 tokens.
