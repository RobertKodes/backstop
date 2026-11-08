# Incident runbook

Principles: **users can always exit** (redeem against the floor, withdraw
chests after their lock, claim fills and Shield gains). Pauses are narrow and
reversible; anything touching treasury SOL goes through the 48 h timelock.

Roles: *guardian* (fast, pause-only), *governance* (3-of-5 Squads), *keeper*,
*agent*. Instruction names refer to `backstop-core` unless noted.

## 0. Triage (first 15 minutes)

1. Identify scope: which market(s), which instruction, since which slot.
2. Freeze the blast radius if user funds are at risk:
   `set_pauses` (guardian) with `NEW_OFFERS | AUTO_ABSORB | LAUNCHPAD` (= 7)
   as needed. This never blocks redemption, chest withdrawals after lock,
   claims or settlement of existing offers.
3. Stop automation that might amplify: stop the agent service (`DRY_RUN=true`
   or scale to 0) and, if implicated, the keeper.
4. Open an incident channel, start a timeline, snapshot evidence
   (`keeper_runs`, `agent_runs`, indexer `raw_events`, transaction signatures).

## 1. Smart-contract bug

* Pause the affected surface (above).
* Prepare a fix; upgrade via Squads → 48 h timelock (see DEPLOYMENT.md).
  During the timelock users can exit; communicate the timeline clearly.
* If treasury SOL must be protected: governance `queue_action`
  `TreasuryWithdraw { to: <multisig vault>, lamports }` (48 h) — visible
  on-chain to everyone. Cancel with `cancel_action` if no longer needed.
* After the upgrade: run the full test suite against a mainnet fork, unpause.

## 2. Transfer-hook allowlist incident

* Symptom: tokens moving through an unexpected program, or legitimate
  transfers failing.
* Hook governance (`backstop_hook::set_allowlist`) can add/remove allowlisted
  programs and protocol owners. Removing a program takes effect immediately.
* Never attempt to change the mint's hook program — it is immutable by design
  (D-014); fixes go through a hook program upgrade.

## 3. Keeper key compromised or keeper misbehaving

* Impact is bounded: swaps are oracle-bounded, auto-absorb respects grants.
* Governance `set_roles` with a new keeper on every market (and the launchpad's
  `update_launchpad` for future children); restart the keeper with the new key.
* Review `keeper_runs` for the window; users can revoke grants (`set_grant`
  enabled = false) in the app.

## 4. Agent key compromised or agent misbehaving

* Impact is bounded to parameters inside `AgentAuthority` bounds, at most one
  update per parameter per hour.
* Governance `set_agent` to a new key (or a burn address), and/or
  `set_agent_bound(param, enabled=false, …)` for affected parameters.
* Restore parameters with `set_param`. Check `param_changes` (agent = true) and
  `agent_runs` for the sequence of events; stored snapshots show what the model
  saw.

## 5. Oracle or swap route failure

* Symptom: `convert_*` failing with slippage/staleness errors.
* Nothing is lost — fee balances accumulate. Do **not** widen
  `max_swap_slippage_bps` beyond 50 without a governance review.
* Pyth outage: wait, or governance switches the oracle config (manual price is
  for localnet/devnet only). Jupiter outage: set `JUPITER_ENABLED=false`
  (conversions pause).

## 6. Yield adapter (Kamino/Marginfi) incident

* Call `backstop_chest::unwind` (permissionless) to pull funds back to the idle
  vault; repeat in chunks if liquidity is thin.
* Governance `set_param yield_buffer_bps 10000` stops new deployments; agent
  bounds for the buffer should be disabled during the incident.
* If the adapter cannot return funds, the next `rebalance` refreshes
  `adapter_value` from the adapter position, so chest share prices reflect the
  loss; communicate the impact per chest.

## 7. Randomness / settlement stuck

* `settle` must happen within 512 slots of `rand_slot`; otherwise it fails with
  `RandomnessUnavailable` and the keeper (or anyone) calls `close_bidding`
  again, which commits a new `rand_slot`. Bias bound:
  ≤ 1 lot per bidder per re-roll (D-023).

## 8. Indexer / API incident

* The indexer never affects funds. Fix and replay:
  `pnpm indexer:replay -- --from-slot <N>` (idempotent).
* If the API serves wrong data, put the web app into maintenance banner mode;
  transactions are still built from chain state by the SDK.

## 9. Governance key loss

* Squads 3-of-5 tolerates two lost keys: rotate members in Squads.
* Pending governance transfer: `propose_governance` + `accept_governance`
  (both on each market, hook config and launchpad).

## 10. Post-incident

Write a public post-mortem (timeline, root cause, user impact, fix,
follow-ups), add a regression test, update THREAT_MODEL.md and this runbook.
