# AI treasury agent

`agent/` reviews each market's last 24 h of indexed data, proposes parameter
changes and writes a short narration. It is deliberately boring: one
structured-output model call per cycle, everything else deterministic.
Design decisions: D-060 … D-066.

## Cycle

1. Read `Market.params` and `AgentAuthority` from chain. If the configured key
   is not `AgentAuthority.agent`, nothing will execute (all proposals become
   governance proposals).
2. Build the snapshot (`agent/src/snapshot.ts`): price/volume, offers
   (absorption rate, Shield share, remainder), chests (flows, penalties),
   Shield, fees, treasury floor, yield adapter idle share, holders, children,
   recent parameter changes. Numbers only.
3. Ask Claude (`AGENT_MODEL`, default `claude-opus-5-5`, effort `high`) with a
   fixed system prompt (`PROMPT_VERSION`) for `{assessment, proposals[], post,
   feed}`. Refusals fall back server-side (`fallbacks: "default"`); the serving
   model is recorded.
4. Policy gate (`agent/src/policy.ts`) classifies each proposal:
   * **execute** — agent-tunable, inside [min, max], off cooldown, passes
     cross-parameter invariants, within the step limit (default 25 % of the
     window; larger moves are clamped), under the per-cycle cap (default 2);
   * **governance** — not agent-tunable or outside bounds → `agent_proposals`
     table + optional webhook;
   * **deferred** — cooling down or over the cap;
   * **rejected** — malformed, duplicate, no-op, breaks invariants, or the
     window was too quiet (< 5 trades + offers).
5. Execute (unless `DRY_RUN=true`, the default): simulate, send
   `agent_set_param`, confirm.
6. Copy-lint the narration; if it violates the guidelines, use the
   deterministic template. Append on-chain outcome lines.
7. Store the post with the exact snapshot (`agent_posts`), proposals, actions
   and run record (`agent_runs`). Post to X if `X_ENABLED=true`.

## Governance setup

```text
init_agent(agent_pubkey)                       # once per market
set_agent_bound(YieldBufferBps, true, 1500, 3000)
set_agent_bound(ShieldPerOfferCap, true, 5_000e6, 20_000e6)
set_agent_bound(BaseDiscountBps, true, 300, 800)       # optional
set_agent(agent_pubkey, 3600)                  # cooldown (≥ 60 s; spec: 1 h)
```

Recommended starting set: `yieldBufferBps`, `shieldPerOfferCap`,
`shieldMaxShareBps`. Keep fee splits, locks, penalties and redemption
parameters governance-only.

## Operations

| Task | How |
|---|---|
| Run once (cron) | `pnpm --filter ./agent once` |
| Service | `pnpm agent:run` (health on `HEALTH_PORT`, `/status`) |
| Go live | set `DRY_RUN=false` after reviewing a week of dry-run posts |
| Enable X | `X_ENABLED=true`, `X_ACCESS_TOKEN` (OAuth 2.0 user token, `tweet.write`) |
| Review proposals | `GET /v1/agent/proposals?status=open` |
| Feed | `GET /v1/agent/posts?mint=…` (web: Agent feed page) |
| Stop immediately | stop the service, or governance `set_agent` to another key |

## Cost and limits

One request per market per cycle (default every 6 h). The system prompt is
marked for prompt caching; the snapshot is a few thousand tokens. Token usage
per run is stored in `agent_runs`.
