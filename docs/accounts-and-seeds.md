# Program accounts & seeds

All PDAs use canonical bumps (stored in the account and re-verified with
`seeds = …, bump = account.bump`). Seeds are defined once in
`crates/backstop-common/src/lib.rs` (`seeds`, `pda`) and mirrored in
`sdk/src/pda.ts`; `crates/backstop-common/tests/parity_fixture.rs` +
`sdk/test/parity.test.ts` assert the two derivations match.

Notation: `mint` = the market's token mint (BACKSTOP or a child),
`le64(x)` = little-endian u64, `le32(x)` = little-endian u32.

## transfer-hook (`g86T56A9yM46y5cyVCVzB1K6MtV5cx89DsFiapy59eP`)

| Account | Seeds | Contents |
|---|---|---|
| `HookConfig` | `["hook_config", mint]` | governance, allowlisted programs and protocol owners, weight params (cap, extra bps, epoch, genesis), absorb tenure share, direct-sell cap/window, link (self-fill) params, `reward_ready` |
| ExtraAccountMetaList | `["extra-account-metas", mint]` | TLV list resolved by Token-2022 for every transfer (instructions sysvar, config, holder PDAs, reward state) |
| `Holder` (zero-copy, 624 B) | `["holder", mint, wallet]` | tenure accumulator, linear weight form (α, β, cap, cap_epoch), reward checkpoint + pending, direct-sell window, 8-entry inbound-sender ring |
| `RewardState` (zero-copy, 49 328 B) | `["reward_state", mint]` | global A/B/C weight sums, wrapping accumulators R/RT, 512-slot ring of cap deltas + snapshots, deposited/distributed/pending. Created at 10 KiB, grown with `grow_reward_state` ×4 |

## backstop-core (`AstnKdypNsaRAxX88cTCDCit11mCqeRRnQ2x6cfZJFzK`)

| Account | Seeds | Contents |
|---|---|---|
| `Market` | `["market", mint]` | `MarketParams` (28 governable params), roles (governance, pending governance, guardian, keeper), pauses, quote mint, parent, oracle config, swap program, vault addresses, fee totals, `shield_lamports_pending` |
| `Treasury` | `["treasury", mint]` | bump + market only — the treasury SOL is the PDA's own lamports (above rent); redemption totals and snapshots are emitted as events |
| `AgentAuthority` | `["agent", mint]` | agent key, cooldown, per-param `{enabled, min, max, last_update}` ×28, update count |
| `QueuedAction` | `["timelock", mint, le64(id)]` | `TimelockAction` (treasury withdraw / redemption pause), eta (now + 48 h) |
| parent vault (token) | `["parent_vault", mint]` | children only: reserved 30 % fee share in the child's quote (wSOL) |
| fee vault | ATA(`Market` PDA, quote) | collected trade fees |
| treasury quote vault | ATA(`Treasury` PDA, quote) | 20 % fee share awaiting conversion to SOL |

## backstop-amm (`8m9GWYsGaqmGECJnN6kipQXiaJfk8t2MhS8U5LugUw8b`)

| Account | Seeds | Contents |
|---|---|---|
| `Pool` (zero-copy) | `["pool", mint]` | reserves, 96-observation TWAP ring (60 s spacing), hourly direct-sell counter |
| base vault | ATA(`Pool`, mint) (Token-2022) | protocol-owned tokens (no withdraw path) |
| quote vault | ATA(`Pool`, quote) | protocol-owned quote |

## backstop-offers (`DW1bgui9AwKGmBxRryjGn6CtKYfo2aXuyeHXLxzewGj`)

| Account | Seeds | Contents |
|---|---|---|
| `OfferBook` | `["book", mint]` | next offer id, open offers, total escrowed (= escrow vault balance), lifetime absorption statistics |
| escrow vault | ATA(`OfferBook`, mint) | all escrowed offer tokens (D-013) |
| `Offer` | `["offer", mint, le64(id)]` | seller, amount, lots, lot size/cost, frozen TWAP + discount + fill price, seller lot tenure, windows, total capacity, `rand_slot`, settlement results (Shield lots, bidder lots, random offset, proceeds, remainder) |
| `Bid` | `["bid", offer, bidder, u8(kind)]` | kind (0 wallet, 1 chest, 2 auto), amount locked, capacity in lots, prefix `Q_i` |
| `Ticket` | `["ticket", mint, seller, le64(offer_id)]` | Return Ticket: fee-free re-buy allowance, expiry (7 days) |

## backstop-chest (`5Hwrxz9JJoGxcZNSzP7TTAju2C2KMPtNBHtdifnU3tB5`)

| Account | Seeds | Contents |
|---|---|---|
| `ChestMarket` | `["chest_market", mint]` | total shares, idle assets, deployed principal, cached adapter value (D-027, D-042), adapter config (kind, program, position, pool), lifetime totals. The buffer target is `MarketParams.yield_buffer_bps` |
| chest vault | ATA(`ChestMarket`, quote) | pooled chest USDC (idle part) |
| `Chest` | `["chest", mint, owner]` | shares, lock-until (rolling 60 days), last deposit, lifetime counters, auto-absorb day window (`day_start`, `day_spent`), open bids |
| `Grant` | `["grant", mint, owner]` | Auto-Absorb: enabled, max per offer, max per day, min discount, reserve floor |
| `Shield` | `["shield", mint]` | Liquity P/S/G accumulators per (epoch, scale), total deposits, undistributed rewards |
| Shield quote / token vaults | ATA(`Shield`, quote) / ATA(`Shield`, mint) | Shield USDC and absorbed tokens |
| `ShieldPosition` | `["shield_pos", mint, owner, le32(id)]` | principal, lock multiplier, lock end, snapshots, claimed |
| rewards authority | `["rewards_auth", mint]` | owns the holder-rewards vault ATA(rewards_auth, quote) |
| Shield rewards vault (token) | `["shield_rewards", mint]` | 10 % fee stream + penalties + redemption fees |

## backstop-launchpad (`ZzoHe1DMEHWDVnHQs7UnHJF8p6pdRVpk7629ygyLEXU`)

| Account | Seeds | Contents |
|---|---|---|
| `LaunchpadConfig` | `["launchpad"]` | governance, parent mint, child roles (governance/guardian/keeper), swap program, oracle, min liquidity, max creator bps, vesting secs, parent share, children count. Also the `authority` signer for child market/pool/book/chest initialisation |
| `ChildLaunch` | `["child", mint]` | status (0 created … 6 live), creator, metadata, supply, creator allocation, liquidity, vesting schedule and claimed amount |
| child mint authority | `["child_mint_auth", mint]` | signer-only; mint + metadata authority until revoked in `mint_child_supply` |
| vesting authority | `["vesting", mint]` | owns ATA(vesting, mint) holding the creator allocation (allowlisted hook owner) |

## Protocol owners allowlisted in the hook

Per market, `HookConfig` stores the PDAs that may *receive* tokens although
they are off-curve: `Pool`, `OfferBook` (escrow), `Shield`, `ChestMarket`,
vesting authority (children). Computed by `backstop_common::pda::protocol_owners`.
