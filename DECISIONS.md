# BACKSTOP — Decision Log

Every non-obvious choice, the alternatives considered, and why they were
rejected. Newest entries are appended at the end of each section. IDs are
stable and referenced from code comments (`see D-012`).

---

## Toolchain & repository

### D-001 · Build environment: WSL2 Ubuntu 24.04 (Windows host)
* **Chosen:** Rust / Agave / Anchor run inside WSL2 Ubuntu 24.04. Sources live
  on the Windows filesystem (`C:\Users\…\solprojbackstop`), build artifacts go
  to a Linux-side target dir (`CARGO_TARGET_DIR=$HOME/.backstop-target`) for
  speed.
* **Rejected:** native Windows (Anchor/`solana-test-validator` are not
  supported); Docker dev container (bind-mounted cargo builds are slow on
  Windows; Docker remains used for Postgres/Redis).
* **Notes:** toolchain installed from verified sources only: `rustup` from the
  Ubuntu archive; Agave `v4.4.1` and Anchor CLI `v1.2.2` from their official
  GitHub release artifacts, each checked against the SHA-256 digest published
  by the GitHub releases API. No `curl | sh` installers.

### D-002 · Versions
| Component | Version | Reason |
|---|---|---|
| Rust (host) | 1.99.1 (pinned in `rust-toolchain.toml`) | latest stable; Anchor MSRV is 1.89 |
| Agave / Solana CLI | 4.4.1 | latest stable release |
| Anchor (`anchor-lang`, `anchor-spl`, CLI) | 1.2.2 | latest **stable** (2.0.0 is still `-rc`) |
| Solana crates | v3 line (Anchor default feature `solana-v3`) | all SPL interface crates below share it |
| `spl-transfer-hook-interface` | 2.1.0 | v3-compatible |
| `spl-tlv-account-resolution` | 0.11.4 | v3-compatible |
| `litesvm` | 0.15.x | matches Anchor 1.2.2 template / v3 types |

The Anchor repository moved to `github.com/otter-sec/anchor`; verified via the
crates.io `anchor-lang` metadata (repository + owners incl.
`solana-foundation-tech`).

### D-003 · Program keypairs are never in the repo
Program and deployer keypairs live in `~/.config/backstop/program-keys/`
(dev/localnet) or in the deployer's HSM / Squads flow (mainnet). `.gitignore`
blocks `*-keypair.json`, `keys/`, `id.json`. Program IDs are declared in code
and `Anchor.toml`; mainnet IDs are generated at mainnet deploy time (see
`docs/DEPLOYMENT.md`).

### D-004 · License: not chosen
No license is declared (`publish = false`). Choosing one is the owner's
decision; until then the code is "all rights reserved".

### D-005 · Infrastructure as code: Terraform
Terraform over Pulumi: more auditors/ops engineers can read HCL, mature
providers for every target (Cloud Run/ECS, managed Postgres/Redis), and plan
files are easy to review in PRs. Pulumi would have kept everything in
TypeScript but adds a runtime dependency to infra changes.

### D-006 · Program integration tests: LiteSVM (not bankrun)
`solana-bankrun` is deprecated; LiteSVM is its successor and the default test
template of Anchor 1.x. Program tests are Rust + LiteSVM (fast, in-process,
supports clock warping and Token-2022 hooks). The full TypeScript lifecycle
test (SDK-level) runs against `solana-test-validator`/Surfpool via
`anchor test`.

### D-007 · Build script and the rustup ≥ 1.28 requirement
`cargo-build-sbf` (Agave 4.x) links the platform tools as a rustup custom
toolchain named like `1.95.0-sbpf-solana-v1.57`, which rustup < 1.28 (e.g.
Ubuntu's packaged rustup 1.26) rejects. `scripts/build-programs.sh` builds
each program (`anchor build --no-idl -p …`) then its IDL
(`anchor idl build -p …`). With `BACKSTOP_NO_RUSTUP=1` it passes
`--no-rustup-override` and points `$RUSTC` at the platform-tools compiler.
CI uses an up-to-date rustup and needs no workaround.

### D-008 · `Cargo.lock` seeded from the Anchor 1.2.2 template
LiteSVM 0.15 only compiles against a specific Agave 4.1.x crate graph; a
fresh resolve pulls Agave 4.4.x crates with breaking API changes. The lockfile
was seeded from `anchor init`'s template lock (which pins that graph) and is
committed. Do not `cargo update` agave/litesvm crates without re-running the
full test suite.

---

## Program architecture

### D-010 · Tenure & reward-weight state lives in the transfer-hook program
The spec places tenure in `backstop-core` and the allowlist + reset in
`transfer-hook`. Solana limits the instruction stack to 5 levels. The deepest
path — offer settlement selling the remainder — is already
`offers → amm → Token-2022 → hook` (4). A further hook → core CPI would sit
exactly at the limit and make the whole design brittle. Therefore the hook
program **owns** `Holder` (tenure + weight + reward checkpoint) and
`RewardState`; `backstop-core` keeps config, fees, treasury and governance.
The tenure *math* is shared via the pure `backstop-math` crate.

### D-011 · Dependency DAG (no circular crates)
`backstop-math` ← `backstop-common` ← `transfer-hook` ← `backstop-core` ←
`backstop-amm` ← `backstop-offers` ← `backstop-chest` ← `backstop-launchpad`.
"Upward" interactions (e.g. offers needing the Shield signer, core reading the
AMM reserve) use program-ID constants and PDA/owner checks from
`backstop-common`, never crate dependencies.

### D-012 · Transfer-hook allowlist mechanism
Requirements: tokens may only move through (a) the protocol AMM, (b) the offer
book, (c) direct wallet-to-wallet transfers. The hook enforces three checks:
1. **Top-level program check** via the Instructions sysvar: the top-level
   instruction that caused the transfer must be either Token-2022 itself (a
   user-signed direct transfer) or an allowlisted BACKSTOP program. Any other
   program (DEX, aggregator, lending market, arbitrary CPI) is rejected.
2. **Destination owner check:** the destination token account's owner must be
   on the ed25519 curve (a real wallet; checked with the curve25519 syscall)
   or one of the market's protocol authority PDAs stored in `HookConfig`
   (AMM pool, offer escrow, chest/shield, launchpad vesting). Direct
   (Token-2022 top-level) transfers may only target on-curve owners.
3. **ImmutableOwner required on the destination.** Without it, Token-2022
   allows `SetAuthority(AccountOwner)` to re-assign a token account that
   already holds tokens to a DEX PDA *without* triggering the hook — a full
   bypass. ATAs always carry ImmutableOwner, so normal wallets are
   unaffected.
* **Rejected:** passing the destination owner *account* via the newer
  `PubkeyData` extra-meta type (to check the owner account's program) — not
  reliably resolved by wallets yet, which would break plain wallet transfers.
* **Consequence (documented in UI/README):** smart-contract wallets whose
  vault is a PDA (e.g. Squads) cannot receive the token unless governance
  allowlists that specific owner.

### D-013 · One escrow authority per market (not per offer)
Escrowed offer tokens are held by a single per-market escrow authority PDA so
the hook's owner allowlist is a small static set. Per-offer escrow amounts are
tracked in offer state; invariant `Σ offer.escrowed == escrow vault balance`
is asserted in tests.

### D-014 · Transfer-hook authority is revoked; no permanent delegate, no freeze
The mint is created with the TransferHook extension pointing at the hook
program and **no hook authority** (the hook program address can never be
swapped; upgrades go through the program's 3-of-5 + 48 h timelocked upgrade
authority). No PermanentDelegate, no freeze authority, no TransferFee,
mint authority revoked after the fixed supply is minted. `backstop-core`
verifies all of this on-chain before a market (including launchpad children)
can go live.

### D-015 · Protocol-owned, non-withdrawable AMM liquidity
The AMM has no LP token and no remove-liquidity instruction. Initial liquidity
(and every child's ≥ 5 SOL) is locked forever. Removes the LP-pull rug vector
entirely.

### D-016 · Quote asset per market
The engine is parametrised by a quote mint. BACKSTOP's pool is
**BACKSTOP/USDC** so offer fills, chests and the TWAP are all in USDC and no
external price oracle is needed to price offers. Launchpad children are
**CHILD/SOL** (wSOL), matching the "≥ 5 SOL initial liquidity" rule; their
chests/shield are denominated in wSOL.
* **Rejected:** BACKSTOP/SOL pool (needs a SOL/USD oracle to price USDC fills
  — extra trust and manipulation surface).

---

## Economics & math

### D-020 · Weighted distribution without loops (exact)
`weight = balance × (1 + 2·min(avg_age/90d, 1))` grows continuously for every
holder, so a reward-per-share accumulator cannot be used. Implemented a
**piecewise-linear weight with scheduled caps** (veCRV-style slope schedule)
evaluated at 6 h epoch boundaries: each wallet stores `(α, β, c, cap_epoch)`,
the global stores `A, B, C` plus a 512-slot ring of cap deltas and
accumulator snapshots. `W(k) = Σ w_i(k)` holds exactly; payouts use a closed
form proven equal to the brute-force sum (property-tested against an O(n)
model with 4 000+ random scenarios).
* **Rejected:** stale stored multipliers refreshed by keeper "pokes" — simple,
  but unfair to un-poked wallets and requires O(holders) transactions per
  epoch.
* **Bounds:** `tenure_cap_secs / epoch_secs + 3 < 512` (≤ ~120 days at 6 h
  epochs). Changing `tenure_cap` or the multiplier applies to each wallet at
  its next checkpoint (global sums stay consistent because they are sums of
  stored per-wallet forms).
* **Idle wallets:** a wallet idle > ~128 days *after* reaching the cap falls
  back to a conservative payout (never over-pays). The keeper checkpoints any
  wallet approaching that horizon.

### D-033 · Inline epoch catch-up is bounded (32 boundaries)
Every hook-touching instruction first processes pending epoch boundaries
(~340 CU each). Processing up to the 512-slot ring inline exhausted the
compute budget (measured: 174k CU), so inline catch-up is capped at 32
boundaries (8 days at 6 h epochs, ≤ ~11k CU). A larger backlog — only
possible after 8 days with zero token movements — requires the permissionless
`advance_epochs` crank, which the keeper runs every epoch and the SDK prepends
automatically. Measured cost of a tracked transfer: ~58k CU steady state,
~71k CU with 28 inline boundaries.

### D-021 · Accumulators use wrapping arithmetic
Reward accumulators (`R`, `RT`) and the TWAP cumulative wrap like
Uniswap-v2's price accumulator; consumers only use wrapping differences. This
removes any possibility of an overflow error inside the transfer hook (which
would freeze transfers).

### D-022 · Randomised pro-rata = lot-based systematic sampling
Offers are split into `L` lots (default 100). Oversubscribed lots are
allocated by systematic sampling over bidders' lot capacities with a random
offset. Each bidder receives `floor` or `ceil` of its exact pro-rata share
(**bias < 1 lot**, unbiased in expectation), never more than it can pay for,
and the allocation is computable per bid in O(1) → lazy claims, no loops.
* **Rejected:** pure base-unit pro-rata (randomness irrelevant → no lottery
  for small bidders, dust everywhere); weighted random selection of whole
  bids (high variance, needs iteration over bids).

### D-023 · Randomness: pre-committed future slot hash
At bid close the offer records `rand_slot = current_slot + 4`; settlement
reads that slot's hash from `SlotHashes` (must occur within its 512-slot
retention) and seeds the allocation with `sha256(slot_hash ‖ offer ‖ lots)`.
The cranker cannot pick the slot. Bias bounds: a malicious leader of
`rand_slot` can grind a few bank hashes and a censoring cranker can force at
most one re-roll per 512 slots; either moves at most **1 lot per bidder**
(zero-sum between bidders). A VRF adapter (Switchboard) is left as a
feature-flagged upgrade path.

### D-024 · Absorbers pay no buy fee on offer fills
The 3 % trade fee is charged once per trade: the seller pays it on fill
proceeds; the absorber receives the discount. AMM buys and sells each pay 3 %.
* **Rejected:** charging both sides on fills (6 % round trip would make the
  5 % default discount uneconomic for absorbers).

### D-025 · Shield priority is decided at settlement, atomically
The Shield's priority slice (≤ 50 % of lots, ≤ per-offer cap) is computed and
paid **inside the settlement instruction**, so its USDC loss and token gain are
booked atomically. This keeps Liquity-style product/sum accounting exact
(depositors joining between a bid and its settlement cannot capture gains they
did not fund). Settlement is therefore always routed through the chest
program (which signs as the Shield).

### D-026 · Shield accounting = Liquity Stability Pool algorithm
Deposits deplete by a common product `P` as the Shield absorbs; token gains
(`S`) and lock-weighted fee rewards (`G`) accrue per (epoch, scale). Lock
multiplier = `lock / 30 d`, capped at 12×. Positions are immutable after
creation; principal is withdrawable after the lock; gains anytime.
Accumulators are pre-multiplied by `P` without Liquity's extra 1e18 factor
(token gains have 9 decimals vs USDC's 6, which overflowed `u128`).

### D-027 · Chests use share accounting with internal asset tracking
Chest balances are shares of a pooled vault (+ yield adapter position).
`total_assets` is tracked internally (donations ignored) and conversions use
a virtual offset — neutralising first-depositor inflation attacks.

### D-028 · Chest lock: deposits *and* reward harvests are deposit events
The 60-day rolling lock restarts on every deposit event, and harvesting fee
rewards into the chest is a deposit event. Chests are war chests for
absorbing; holders who exit (sell) stop earning, and their chest unlocks 60
days after their last harvest. Early withdrawal pays the 25 % penalty to
Shield rewards. Returning Shield principal and offer refunds are **not**
deposit events.

### D-029 · Direct AMM sells below the minimum offer size are rate-limited
Sells under 0.01 % of supply go straight to the AMM (taxed). To stop large
sells being split into many small ones, the hook enforces a rolling 24 h
per-wallet cap equal to the minimum offer size, and the AMM enforces a global
hourly cap on direct sells. Sybil splitting across wallets remains possible
at a per-wallet rent cost; see THREAT_MODEL.md.

### D-030 · Circulating supply for the treasury floor
`circulating = mint supply − AMM base reserve` (tokens held by the protocol
pool are not claims on the treasury). Escrowed offer tokens still count as
circulating (they belong to the seller until filled).

### D-031 · Self-fill protection limits
On-chain ring buffer (8 entries) of recent direct inbound senders per wallet,
recorded for transfers ≥ `link_min_amount`. A bidder listed in the seller's
buffer within 24 h cannot bid. Limits (documented in UI and threat model):
does not see SOL/USDC funding, only transfers made after the seller's holder
account was registered, and a determined attacker can flush 8 entries with
non-dust transfers.

### D-032 · Rounding policy
All rounding favours the protocol/pool/remaining participants: fees and lot
costs round up, payouts round down, tracked totals stay ≥ the sum of claims.

---

## Offer book, chests, Shield and yield (Phases 3–6)

### D-040 · Yield adapters: mock always, Kamino feature-gated, Marginfi documented only
`YieldAdapter` is a trait inside the chest program. `MockAdapter`
(`mock-lending`) is always built and fully tested. The Kamino Lend adapter is
behind the `kamino` cargo feature: its reserve-layout offsets were written
from the klend account definitions and **must be verified on a mainnet fork
before enabling**; as a guard it checks the liquidity and collateral mints at
the parsed offsets and refuses to operate if they do not match. The Marginfi
fallback named in the spec is **not implemented** (interface ready, adapter
id reserved) — tracked as a known gap.

### D-041 · Offer remainder sale is a separate permissionless instruction
Selling the unfilled remainder inside `settle` would run
`chest → offers → amm → Token-2022 → hook` (stack depth 5, the hard limit).
`settle` therefore only allocates, pays the seller and delivers the Shield
slice; `sell_remainder` (depth 4) is cranked right after by the keeper — or by
anyone.

### D-042 · Adapter value is cached and refreshed by `rebalance`
Chest share prices use the adapter value from the last `rebalance`/`unwind`
(keeper runs it every epoch) instead of reading the lending market in every
chest instruction. A deposit just before a refresh could capture a sliver of
accrued yield, but deposits are locked 60 days with a 25 % early-exit penalty,
so there is nothing to sandwich.

### D-043 · Shield skips offers created during a pump
`settle_offer` gives the Shield zero lots when the short TWAP exceeds the
hourly TWAP by more than `shield_max_premium_bps` (default 20 %), so the
pooled Shield is not the counterparty of pump-then-offer manipulation.

### D-044 · Sellers must hold a registered holder account
Offer creation reads the seller's tenure (carried 40 % to absorbers) and the
self-fill ring; both live in the holder account, so it is required (the SDK
registers wallets automatically). The self-fill window comes from the hook
config (`link_window_secs`).

### D-045 · Bids lock whole lots only
A bid of `b` quote units locks `floor(b / lot_cost) × lot_cost`; the rest
never leaves the wallet/chest. Bids below one lot are rejected.

### D-046 · Shield principal ↔ chest moves are not withdrawals
Locking chest USDC into the Shield and getting principal back after the lock
neither pays the chest penalty nor restarts the chest lock; Shield fee rewards
credited to the chest *are* deposit events (consistent with D-028).

## Launchpad (Phase 9)

### D-050 · Child launch is a seven-step on-chain state machine
Creating a child needs the mint, hook config + 48 KiB reward ledger, fixed
supply, core market, AMM pool, offer book and chests. One transaction cannot
hold all of it (account count, 10 KiB CPI allocation cap, CU), so
`ChildLaunch.status` advances `created → hooked → minted → market → pool →
book → live`, each step requiring the previous one. A failed step can be
resumed (`LaunchpadClient.resumeSteps`) and nothing is tradable before `live`.
*Rejected:* a single "mega-instruction" with address lookup tables (still
exceeds CU and the reward-ledger allocation cap); off-chain sequencing without
a status field (a half-launched child could be traded or re-initialised).

### D-051 · Child mints are made safe by construction, not by review
The launchpad itself creates the mint: TransferHook pointed at the BACKSTOP
hook (authority none), metadata pointer to the mint itself, mint authority a
PDA that is revoked after minting the fixed supply, no freeze authority, no
permanent delegate, metadata update authority removed. `backstop-core`
re-verifies the mint at market creation. Liquidity (≥ 5 SOL) goes into the AMM
which has no withdraw path. Creator allocation (≤ 5 %) sits in a program
vault and vests linearly (`config.vesting_secs`, 90 days).
*Rejected:* accepting creator-made mints and checking extensions (larger attack
surface; mint-close / re-init edge cases).

### D-052 · Child quote is wSOL; parent share is swapped to the parent quote
Children trade against wSOL so a launch needs only SOL. 30 % of child fees is
reserved in a market-owned `parent_vault` and converted by the keeper
(`convert_parent_share`) to the parent's quote with the same oracle bound as
treasury swaps (≤ 0.5 %), then credited to BACKSTOP holders through the hook's
tenure-weighted reward accumulator. Jupiter routes spend from the owner's ATA,
so the keeper rewrites the route source to the PDA vault
(`rewriteRouteSource`); this needs mainnet-fork verification before mainnet
(tracked with the Kamino check in D-040).

## AI treasury agent (Phase 10)

### D-060 · One structured-output call per cycle; orchestration is plain code
Each cycle sends a numeric 24 h snapshot plus the parameter/bounds table to
Claude (`claude-opus-5-5`, effort `high`) and gets back a JSON object
(assessment, proposals, post, feed) validated with zod. Policy, execution,
posting and storage are deterministic code; the model holds no keys and calls
no tools. *Rejected:* an open-ended tool-use agent loop (more attack surface
and cost for a task that needs one judgement per cycle).

### D-061 · Three independent limits on agent actions
1. On-chain `AgentAuthority`: per-parameter enable flag, [min, max] and a 1 h
   cooldown — the hard guarantee.
2. Off-chain policy gate (`agent/src/policy.ts`): the same bounds plus a step
   limit (default 25 % of the window per update), cross-parameter invariants
   (mirror of `MarketParams::validate`), at most 2 updates per cycle, and no
   actions at all when the window is thin (< 5 trades + offers).
3. `DRY_RUN=true` by default.
Anything not agent-tunable or out of bounds becomes a row in
`agent_proposals` (and an optional webhook) for governance — never an action.

### D-062 · Prompt-injection hygiene
Only numeric aggregates reach the model. Free text written on-chain by users
(offer messages, child names/URIs) is excluded; child symbols are reduced to
`[A-Z0-9]{≤10}`. Even a fully compromised model output is bounded by D-061.

### D-063 · Narration is copy-linted and outcome lines are appended by code
The model writes before the policy runs, so it is told to phrase changes as
proposals; the system appends factual "Applied on-chain / Deferred / Filed for
governance" lines. Text that violates the copy guidelines (guaranteed,
risk-free, yield/APY without "variable", investment framing, chest withdrawals
not described as time-locked) is replaced by a deterministic template.

### D-064 · Every post is stored with the exact snapshot it was based on
`agent_posts.snapshot` holds the snapshot JSON sent to the model plus the
assessment and feed; `agent_runs` records model requested/served (fallbacks),
request id, prompt version, token usage and errors. Refusals, truncation and
API errors produce a failed run and no post.

### D-065 · Model refusals fall back server-side
Requests opt into `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`)
so a declined request is retried on Anthropic's recommended model for that
refusal category; the serving model is recorded per run.

### D-066 · X posting is feature-flagged and uses an OAuth 2.0 user token
`X_ENABLED=false` by default. When on, `POST /2/tweets` with a user-context
bearer token (`tweet.write`) obtained out of band; failures keep the post
in-app only. *Rejected:* OAuth 1.0a request signing in-service (more secret
material to hold, no benefit for a single posting account).

## Hardening (Phase 11)

### D-070 · Fuzzing = executable specs shared by proptest and libFuzzer
The allocator, reward accumulator and tenure checks live in
`backstop-math::check` (feature `check`, never compiled on-chain) and are
driven both by proptest on stable (CI default 256 cases, `FUZZ_CASES` for long
campaigns) and by coverage-guided libFuzzer targets in `fuzz/` (nightly).
*Rejected:* fuzz-only harnesses (would not run in stable CI) and duplicating
the brute-force model in two places.

### D-071 · Tenure leaderboard is snapshotted from chain by the keeper
The indexer cannot reconstruct tenure exactly inside its declarative,
replay-safe mutations (inbound accrual, resets and absorb credits interleave
within transactions). The keeper's hourly `snapshot` job reads every
`Holder` with `getProgramAccounts` sliced to 184 bytes (wallet .. acc),
evaluates tenure and multiplier with the SDK's parity-tested math and writes a
`tenure_snapshots` batch (48 h retained). The slice offsets are pinned by a
Rust `offset_of!` test. *Rejected:* event-sourced tenure in SQL (fragile),
per-request RPC reads from the API (slow, RPC-cost heavy).

### D-072 · Load test drives the real ingest path with IDL-encoded events
`tests/load` Borsh-encodes events with the programs' own IDLs, wraps them in
runtime log lines and feeds them through `ingestTx` sequentially (as the
poller does); the API is exercised in-process with the production query layer,
with and without the response cache. The production rate limit is lifted for
the measurement. CI runs a smoke scale; `pnpm test:load` runs 50k holders and
1 000 offers (500/h for 2 h).

### D-073 · Hosting: AWS ECS Fargate behind one ALB
Fargate ARM64 tasks (singletons for indexer/keeper/agent, scaled api/web),
RDS Postgres 16, ElastiCache Redis 7 (TLS), Secrets Manager with values set
out of band, one ALB routing `/` → web, `/v1/*`+`/docs` → API (WebSocket via a
3 600 s idle timeout), `/helius` → indexer. *Rejected:* Kubernetes (operational
weight for five services), Cloud Run (WebSocket and singleton-worker
semantics less direct).
