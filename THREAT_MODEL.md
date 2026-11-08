# BACKSTOP — Threat Model

Scope: the six on-chain programs (`transfer-hook`, `backstop-core`,
`backstop-amm`, `backstop-offers`, `backstop-chest`, `backstop-launchpad`), the
keeper, the indexer/API, the AI treasury agent and the web app. Decision IDs
(`D-0xx`) refer to [DECISIONS.md](DECISIONS.md).

## 1. Assets and trust boundaries

| Asset | Where it lives | Who can move it |
|---|---|---|
| Holder tokens | user ATAs (Token-2022, ImmutableOwner) | the owner, only through the AMM, the offer book or a direct wallet transfer (hook-enforced, D-012) |
| Offer escrow | per-market escrow PDA (D-013) | `backstop-offers` at settlement / claim |
| Chest USDC | chest-market vault + yield adapter position | the chest owner (time-locked, penalty before lock end), offer settlement (bids), auto-absorb (bounded grant) |
| Shield USDC + absorbed tokens | Shield PDA vaults | settlement (priority slice), position owners after lock |
| Treasury SOL | treasury PDA | redemption (pro-rata, always on), 48 h timelocked governance action |
| AMM reserves | pool PDA vaults | swaps only — no withdraw instruction (D-015) |
| Fee vaults | market PDA ATAs | `distribute_fees` (permissionless), oracle-bounded keeper swaps |
| Child creator allocation | vesting PDA vault | linear vesting claim by the creator only |

| Role | Key | Powers | Cannot |
|---|---|---|---|
| Governance | 3-of-5 Squads multisig | params (validated ranges), roles, allowlist, agent bounds, queue timelocked actions | bypass the 48 h timelock for treasury withdrawals / redemption pause; change the hook program of a mint |
| Guardian | hot multisig/key | set pause flags for new offers, auto-absorb, launchpad | pause redemption, chest withdrawals, claims or settlement |
| Keeper | hot key | crank settlement/remainder/epochs/rebalance, oracle-bounded fee swaps, auto-absorb within user grants | move user funds outside grants; swap beyond the oracle bound; pick randomness |
| Agent | hot key | `agent_set_param` within on-chain bounds, 1 h cooldown per parameter | anything else |
| Upgrade authority | Squads + 48 h timelock | upgrade programs | act instantly |

## 2. Threats and mitigations

### T1 — Wash-sell farming
*Attack:* sell to yourself through the offer book to farm discounts, tenure
transfer or Return Tickets.
*Mitigations:* the seller pays the 3 % fee on fill proceeds and the absorber
buys at a discount, so a self-fill loses ≈ fee − discount + the 40 % tenure
haircut. Self-fills are blocked for the same wallet and any wallet that sent
the seller ≥ `link_min_amount` tokens within 24 h (on-chain 8-entry ring,
D-031). Tenure resets to 0 on every sell/outbound transfer, so recycled tokens
restart at multiplier 1.0. Return Tickets only refund the fee on re-buys up to
the absorbed amount for 7 days.
*Residual:* SOL/USDC-funded sybils and ring flushing (D-031); economically
negative for the attacker at default parameters. Monitored via the indexer
(`fills` joined with funding graph) — alerts on clusters.

### T2 — Oracle manipulation of the TWAP
*Attack:* move the AMM price to inflate the fill price of one's own offer or to
widen the discount for absorbing.
*Mitigations:* offers are priced from the on-chain TWAP (96 observations,
`price_twap_window_secs` = 5 min) frozen at creation, not the spot price; the
momentum signal uses a 60 min lookback. Moving a TWAP for minutes costs the
3 % fee on both legs plus arbitrage losses against locked protocol liquidity.
The discount is clamped to [2 %, 12 %]. The Shield skips offers whose short
TWAP is more than `shield_max_premium_bps` above the hourly TWAP (D-043).
Keeper fee swaps use an external oracle bound (Pyth on mainnet) with ≤ 0.5 %
slippage, never the AMM price.
*Residual:* sustained multi-block manipulation by a well-funded actor; cost
scales with liquidity and window length.

### T3 — Shield griefing
*Attack:* make the Shield absorb toxic flow (pump then offer), or join the
Shield just before a profitable settlement and leave after.
*Mitigations:* priority slice ≤ 50 % of lots and ≤ `shield_per_offer_cap`;
pump filter (D-043); positions lock ≥ 30 days and are immutable; Shield
accounting is Liquity product/sum with gains booked atomically at settlement
(D-025/D-026), so late joiners cannot capture gains they did not fund.

### T4 — Keeper censorship / liveness
*Attack:* the keeper (or its RPC) stops settling, swapping or rolling epochs.
*Mitigations:* every crank is permissionless (`close_bidding`, `settle`,
`sell_remainder`, `claim`, `advance_epochs`, `distribute_fees`); the SDK
prepends epoch catch-up automatically; anyone can run `keeper/` with the same
results (work is discovered from chain state, not our indexer). Settlement
randomness uses a pre-committed slot (D-023) so a censoring cranker can force
at most one re-roll per 512 slots, moving ≤ 1 lot per bidder. Fee swaps are
keeper-only (oracle-bounded); a stalled keeper delays treasury/Shield income
but never loses funds. Alerts fire after 3 consecutive job failures.

### T5 — Jupiter route poisoning
*Attack:* a malicious route (or compromised Jupiter API) drains the swap input
or plants a delegate on a protocol vault.
*Mitigations:* the swap program must equal `market.swap_program`; the input
amount is fixed by the instruction; the output is measured as the vault
balance delta and must meet `oracle_min_out` (≤ 0.5 % slippage vs Pyth);
the input vault is re-read after the CPI and rejected if a delegate or close
authority was set; temp wSOL accounts are created and closed inside the
instruction. Route accounts come from the API but cannot widen these bounds.
*Residual:* the 0.5 % slippage budget per chunk (TWAP-chunked conversions).

### T6 — Transfer-hook allowlist bypass
*Attack:* move tokens through a DEX/aggregator/lending market to escape tenure
reset and the offer mechanic; reassign an ATA owner to a program PDA.
*Mitigations (D-012):* top-level program check via the Instructions sysvar;
destination owner must be on-curve or an allowlisted protocol PDA;
ImmutableOwner required on destinations (blocks the SetAuthority bypass); the
hook program can never be changed on the mint (authority revoked, D-014);
no permanent delegate. Fuzzed and integration-tested (`tests/programs/tests/hook.rs`).
*Residual:* smart-contract wallets with PDA vaults cannot receive the token
unless governance allowlists them (documented trade-off).

### T7 — Randomness grinding
*Attack:* choose when to settle, or (as a leader) grind the slot hash to win
more lots.
*Mitigations (D-023):* `rand_slot` = close slot + 4 is fixed at bid close;
settlement must happen within the 512-slot SlotHashes window; systematic
sampling bounds the effect of any seed on any bidder to ≤ 1 lot and the
allocation is zero-sum between bidders. Fuzzed: `fuzz/fuzz_targets/allocator.rs`.
*Residual:* a leader of `rand_slot` can bias a few re-rolls; a VRF adapter is
the documented upgrade path.

### T8 — Launchpad rugs
*Attack:* a child creator mints extra supply, freezes holders, pulls
liquidity, changes metadata, or dumps a large allocation.
*Mitigations (D-050/D-051):* the launchpad creates the mint itself — fixed
supply (mint authority revoked), no freeze authority, no permanent delegate,
hook pinned, metadata frozen; liquidity ≥ 5 SOL locked forever in an AMM with
no withdraw; creator allocation ≤ 5 % in a program vault vesting linearly over
90 days; `backstop-core` re-verifies the mint. The UI shows a risk panel for
every child. Guardian can pause new launches.
*Residual:* social-engineering rugs (misleading names/URIs) — metadata is
shown with an explicit "unverified" label.

### T9 — Key compromise
| Key | Blast radius | Response |
|---|---|---|
| Keeper | delay; swaps still oracle-bounded; auto-absorb still bounded by each user's grant | rotate via `set_roles`; incident runbook §3 |
| Agent | parameters move within on-chain bounds at ≤ 1 update/param/hour | `set_agent` to a new key or disable bounds; runbook §4 |
| Guardian | can pause new offers/auto-absorb/launchpad (not exits) | governance rotates guardian |
| Governance (3-of-5) | params within validated ranges; timelocked treasury actions visible 48 h ahead | cancel queued actions with remaining signers; upgrade timelock gives users 48 h to exit |

### T10 — Program upgrade risk
Upgrades require the 3-of-5 Squads multisig and a 48 h timelock, giving users
time to redeem against the treasury floor and exit. Path to immutability:
after audits and a stable period, set the upgrade authority to `None`
per program (documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

### T11 — Yield adapter risk (Kamino / Marginfi)
Deployed chest USDC carries smart-contract and liquidity risk of the lending
market. Mitigations: idle buffer (default 20 %, agent-tunable within bounds),
adapter mint sanity checks, a permissionless `unwind` instruction that pulls
funds back regardless of the buffer target (anyone can rescue a large
withdrawal or bid), adapter value refreshed on `rebalance` (D-042). Yield is
always described as **variable** and the risk is disclosed in the UI.

### T12 — AI treasury agent manipulation
*Attack:* prompt injection through on-chain text, or a misbehaving model
pushing parameters to extremes.
*Mitigations (D-060..D-065):* only numeric aggregates reach the model; three
independent limits (on-chain bounds + cooldown, off-chain step limit and
invariants, dry-run default); everything outside bounds becomes a governance
proposal; copy-linted narration with template fallback.

### T13 — Off-chain data integrity (indexer/API)
The indexer is idempotent and replayable from any slot; it never signs or
holds keys. The keeper does not depend on it. A compromised API can mislead
the UI (wrong numbers) but cannot move funds — all transactions are built
client-side from chain state via the SDK and signed by the user's wallet.

### T14 — Frontend supply chain
Pinned dependencies with a lockfile, `pnpm install --frozen-lockfile` in CI,
no third-party scripts at runtime, CSP headers, transaction simulation and a
human-readable summary before signing.

## 3. Invariants enforced in tests

See [docs/audit-prep.md](docs/audit-prep.md) §3 for the invariant → test map
(chest/vault conservation, fee conservation, no fill below frozen price,
escrow = unfilled, tenure monotone except reset, treasury non-decreasing
except redemption/timelock, hook rejects non-allowlisted destinations).
