# Architecture

BACKSTOP is a Token-2022 token whose every sell above a minimum size becomes a
time-limited, discounted offer to existing holders. Holders absorb offers with
USDC from per-wallet chests funded by trading fees; a pooled Shield takes a
priority slice; the unabsorbed remainder is sold to a protocol-owned AMM.

## Components

```mermaid
flowchart LR
  subgraph Users
    W[Wallet<br/>Phantom / Solflare / Backpack]
  end
  subgraph Web["web/ (Next.js)"]
    UI[Pages + SDK tx builders]
  end
  subgraph Chain["Solana programs"]
    HOOK[transfer-hook<br/>allowlist · tenure · rewards]
    CORE[backstop-core<br/>market · fees · treasury · governance · agent]
    AMM[backstop-amm<br/>pool · TWAP]
    OFF[backstop-offers<br/>offer book · bids · tickets]
    CHEST[backstop-chest<br/>chests · grants · Shield · yield]
    LP[backstop-launchpad<br/>child factory · vesting]
    T22[(Token-2022)]
    JUP[(Jupiter v6)]
    KAM[(Kamino / Marginfi)]
    PYTH[(Pyth)]
  end
  subgraph Services["Off-chain services"]
    IDX[indexer<br/>Helius webhook + poller]
    API[api<br/>REST + WS + OpenAPI]
    KEEP[keeper<br/>permissionless cranks]
    AGENT[agent<br/>Claude · bounded params]
    PG[(Postgres)]
    RD[(Redis)]
  end

  W --> UI --> W
  W -- signed txs --> OFF & AMM & CHEST & CORE & LP
  OFF -- sell_from_offer / buy_with_ticket --> AMM
  OFF -- settle (Shield signer) --> CHEST
  CHEST -- settle_offer --> OFF
  AMM & OFF & CHEST --> T22 --> HOOK
  CORE -- deposit_rewards / credit --> HOOK
  CORE -- oracle-bounded swaps --> JUP
  CORE --- PYTH
  CHEST -- YieldAdapter --> KAM
  LP -- init CPIs --> HOOK & CORE & AMM & OFF & CHEST
  IDX -- events --> PG
  API --> PG & RD
  UI --> API
  KEEP -- cranks --> OFF & CHEST & CORE & HOOK
  AGENT -- agent_set_param --> CORE
  AGENT --> PG
```

## Program responsibilities and CPI depth

| Program | Owns | Calls |
|---|---|---|
| `transfer-hook` | `HookConfig`, `Holder` (tenure + reward checkpoint), `RewardState` (epoch ring) | — (leaf) |
| `backstop-core` | `Market` (params, roles, fee totals), `Treasury`, `AgentAuthority`, `QueuedAction` | hook (reward deposits, credits), swap program (Jupiter / mock) |
| `backstop-amm` | `Pool` (reserves, 96-entry TWAP ring, direct-sell cap) | Token-2022 (→ hook) |
| `backstop-offers` | `OfferBook`, `Offer`, `Bid`, `Ticket` | amm (remainder, ticket buys), chest (settlement via Shield signer), Token-2022 |
| `backstop-chest` | `ChestMarket`, `Chest`, `Grant`, `Shield`, `ShieldPosition` | offers (bids), yield adapter, Token-2022 |
| `backstop-launchpad` | `LaunchpadConfig`, `ChildLaunch` | hook, core, amm, offers, chest (initialisation only) |

Deepest path (remainder sale): `offers → amm → Token-2022 → hook` = 4 of the
5 allowed levels. This is why tenure/rewards live in the hook (D-010) and the
remainder sale is a separate instruction (D-041).

## Lifecycle of a sell

```mermaid
sequenceDiagram
  participant S as Seller
  participant O as backstop-offers
  participant H as Holders / chests
  participant SH as Shield
  participant A as AMM
  S->>O: create_offer (tokens escrowed, price = TWAP × (1 − discount))
  H->>O: place_bid / bid_from_chest / auto_bid (lots × lot_cost locked)
  Note over O: window (600 s) or early close when fully covered
  O->>O: close_bidding → rand_slot = slot + 4
  O->>SH: settle (Shield priority slice ≤ 50 %, ≤ cap) — atomic
  O->>O: random offset from SlotHashes[rand_slot]
  O->>A: sell_remainder (unabsorbed lots → AMM)
  H->>O: claim (tokens + 40 % of seller lot tenure, refunds)
  S->>O: claim proceeds (USDC − 3 % fee) + Return Ticket
```

## Fees

```mermaid
flowchart LR
  F[3 % trade fee<br/>AMM buys & sells, offer fills] --> FV[market fee vault]
  FV -- distribute_fees --> P{child?}
  P -- yes 30 % --> PV[parent_vault] -- convert_parent_share --> PR[parent holder rewards → BACKSTOP chests by tenure weight]
  P --> C70[70 % holder chests<br/>RewardState accumulator]
  P --> S10[10 % Shield rewards]
  P --> T20[20 % treasury] -- convert_treasury (oracle-bounded) --> SOL[treasury SOL → floor]
```

## Off-chain services

| Service | Role | State | Can it move funds? |
|---|---|---|---|
| indexer | decode events from every program, idempotent declarative mutations, replay from any slot | Postgres | no |
| api | REST + WebSocket (`backstop:live` channel), OpenAPI at `/docs`, Redis cache, rate limit | Postgres, Redis | no |
| keeper | settle/remainder/claims, auto-absorb, fee distribution & swaps, rebalance, epochs, snapshots; audit log with pre/post state hashes | Postgres (`keeper_runs`) | only within on-chain bounds |
| agent | 24 h snapshot → Claude → bounded `agent_set_param`, governance proposals, narration (X feature-flagged) | Postgres (`agent_*`) | no (parameters only) |
| web | all user flows; builds transactions client-side with the SDK | — | no (user signs) |

See [accounts-and-seeds.md](accounts-and-seeds.md), [economic-spec.md](economic-spec.md),
[keeper-runbook.md](keeper-runbook.md), [incident-runbook.md](incident-runbook.md),
[agent.md](agent.md), [DEPLOYMENT.md](DEPLOYMENT.md), [audit-prep.md](audit-prep.md).
