# BACKSTOP

A Solana token with an unusual exit mechanic: every sell above a minimum size
becomes a time-limited, discounted offer to existing holders. Holders absorb
offers with USDC from per-wallet chests funded by trading fees; a pooled
Shield takes a priority slice; the unabsorbed remainder is sold to a
protocol-owned AMM. A SOL treasury backs a redeemable floor, a launchpad
spins up child tokens on the same engine, and an AI treasury agent narrates
and tunes parameters inside governance-set bounds.

> Not a security and not an investment product. Lending-adapter yield is
> **variable**; chest withdrawals are **time-locked**; offers cannot be
> cancelled and fills are not guaranteed.

## Repository

| Path | What |
|---|---|
| `programs/` | Anchor programs: `transfer-hook`, `backstop-core`, `backstop-amm`, `backstop-offers`, `backstop-chest`, `backstop-launchpad` (+ test-only `mock-swap`, `mock-lending`) |
| `crates/` | `backstop-math` (all numeric logic, property-tested and fuzzed), `backstop-common` (ids, seeds, PDAs) |
| `sdk/` | TypeScript SDK: PDAs, transaction builders, event parsing, launchpad client |
| `indexer/` `api/` `keeper/` `agent/` | Off-chain services (Postgres, Redis, Helius) |
| `web/` | Next.js app |
| `tests/programs` `tests/e2e` `tests/load` `fuzz/` | LiteSVM integration, Playwright, load tests, libFuzzer targets |
| `scripts/` | build, IDL sync, deploy (mainnet-gated), localnet rehearsal, genesis/seed (`scripts/ts`), copy lint |
| `infra/terraform` | AWS infrastructure |
| `docs/` | architecture, accounts & seeds, economic spec, runbooks, deployment, audit prep, copy guidelines |

Start with [docs/architecture.md](docs/architecture.md), then
[DECISIONS.md](DECISIONS.md), [THREAT_MODEL.md](THREAT_MODEL.md) and
[SECURITY.md](SECURITY.md).

## Tasks

| Command | Does |
|---|---|
| `pnpm build` | programs (SBF + IDLs → SDK) and every TypeScript package |
| `pnpm test` | `test:programs` + `test:ts` |
| `pnpm test:programs` | `cargo test --workspace` (unit, property, LiteSVM integration) |
| `pnpm test:ts` | SDK, indexer, API, keeper, agent, web unit tests, load smoke (Postgres via `DATABASE_URL`) |
| `pnpm test:e2e` | Playwright e2e (`pnpm --filter ./tests/e2e install-browsers` once) |
| `pnpm test:load` | full load test: 50k holders, 500 offers/h, API latency (`LOAD_DATABASE_URL`, drops its schema) |
| `pnpm deploy:devnet` | deploy programs to devnet, then `pnpm genesis:devnet` and `pnpm seed:devnet` |
| `pnpm deploy:mainnet` | **gated** (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)) |
| `pnpm indexer:replay -- --from-slot N` | idempotent re-ingest |
| `pnpm keeper:run` / `api:run` / `agent:run` / `indexer:run` | services |
| `pnpm copy:lint` | user-facing copy guidelines |
| `pnpm lint` / `pnpm typecheck` / `pnpm fmt` | static checks / formatting |

Local stack: `docker compose up -d` (Postgres, Redis); `docker compose --profile app up -d --build`
adds the services. Localnet rehearsal: `bash scripts/rehearse-localnet.sh`, then
`pnpm --filter ./scripts/ts genesis --cluster localnet` and
`pnpm --filter ./scripts/ts seed --cluster localnet --fast --crank --child`.

## Toolchain

Rust 1.99.1 · Agave 4.4.1 · Anchor 1.2.2 · Node 20+ · pnpm 9 · Postgres 16 · Redis 7
(details and rationale: DECISIONS D-001, D-002, D-007, D-008).

## License

None declared yet (D-004) — all rights reserved until the owner chooses one.
