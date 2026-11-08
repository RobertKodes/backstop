# Keeper runbook

The keeper (`keeper/`) cranks permissionless instructions and performs the
oracle-bounded fee swaps that only the configured keeper key may sign. Anyone
can run a keeper; ours is one of many possible crankers (THREAT_MODEL T4).

## Run

```bash
cp keeper/.env.example keeper/.env       # fill in KEEPER_KEYPAIR, RPC_URL, MARKETS …
pnpm --filter ./keeper build
pnpm keeper:run                           # or: docker compose --profile app up keeper
```

| Variable | Meaning |
|---|---|
| `RPC_URL` | Helius (or other) RPC with `getProgramAccounts` enabled |
| `DATABASE_URL` | optional; enables the `keeper_runs` audit table (else in-memory) |
| `KEEPER_KEYPAIR` | path / JSON array / base58 — must equal `Market.keeper` for swap jobs |
| `MARKETS` | JSON array `[{mint, quoteMint, quoteTokenProgram?, adapterAccounts?}]` — BACKSTOP and every child |
| `ALERT_WEBHOOK_URL` | Slack/Discord-compatible webhook for alerts |
| `DASHBOARD_PORT` | default 8790 — `/` HTML dashboard, `/status` JSON, `/health` |
| `JUPITER_ENABLED`, `JUPITER_URL`, `SWAP_SLIPPAGE_BPS` | mainnet swap routing (localnet uses the mock swap program) |
| `DISTRIBUTE_MIN`, `CONVERT_MIN`, `SHIELD_CONVERT_MIN_LAMPORTS` | thresholds before distributing / converting |
| `CHUNK_INTERVAL_SECS` | spacing of TWAP-chunked conversions |
| `PRIORITY_FEE_MICROLAMPORTS` | compute-unit price |

## Jobs (per market)

| Job | Interval | What it does | If it stops |
|---|---|---|---|
| `settle` | 5 s | early close / `close_bidding` at window end, `settle` once `rand_slot` is reached (within 512 slots), `sell_remainder`, `claim` for every bid, `close_offer` | offers wait; anyone can crank. After 512 slots a re-close re-rolls randomness (bounded, D-023) |
| `autoabsorb` | 5 s | `auto_bid` for open offers within each user's `Grant` (discount ≥ min, per-offer/day caps, reserve floor) | users' auto-absorb doesn't fire; manual bids still work |
| `fees` | 60 s | `distribute_fees` (+ epoch catch-up), `sync_shield_rewards`, treasury USDC → SOL via `convert_treasury` (oracle-bounded, chunked) | fees accumulate in the vault; nothing is lost |
| `parentShare` | 5 min | children: `convert_parent_share` wSOL → USDC → BACKSTOP holder rewards | parent share accumulates in `parent_vault` |
| `shieldLamports` | 15 min | `convert_shield_lamports`: redemption-fee SOL → Shield rewards | pending lamports accumulate |
| `yield` | 1 h | `rebalance` toward `yield_buffer_bps` | buffer drifts; `unwind` remains permissionless |
| `epochs` | 10 min | `advance_epochs` when > 32 boundaries pending; checkpoint holders approaching the ring horizon (D-020) | transfers prepend catch-up (SDK); very idle markets need the crank |
| `snapshot` | 1 h | treasury `snapshot` event (floor price history) | charts have gaps |

Every transaction is simulated first and logged to `keeper_runs` with
pre/post SHA-256 hashes of every writable account (`keeper/src/tx.ts`).

## Alerts

* A job failing 3 times in a row posts to `ALERT_WEBHOOK_URL`.
* Watch: keeper SOL balance (< 1 SOL), RPC errors, `fees.convert*` repeatedly
  failing with `SwapSlippage` or `OracleUnavailable` (route poor or oracle stale — see incident
  runbook §5), `settle` failing with `RandomnessUnavailable` (the committed slot left
  the 512-slot window; the next `close_bidding` re-arms it automatically).

## Routine operations

* **Add a child market:** append it to `MARKETS` (quote = wSOL) and restart.
* **Rotate the keeper key:** governance `set_roles` with the new keeper on every
  market, then switch `KEEPER_KEYPAIR` and restart. Old key can still crank
  permissionless jobs but no longer swap.
* **Backfill after downtime:** just start it — jobs discover work from chain
  state; no manual replay is needed for the keeper.
* **Dry diagnosis:** `curl localhost:8790/status | jq` shows last run, last
  error and failure streak per job.
