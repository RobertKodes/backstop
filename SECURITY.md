# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately — **do not open a public issue or PR**.

* Email: `security@<project-domain>` (to be set by the project owner before launch)
* Include: affected component (program / service / web), a description, a
  proof of concept or reproduction steps, and the impact you expect.
* We aim to acknowledge within 48 hours and to give a remediation timeline
  within 7 days. Please allow us a reasonable window to fix and deploy before
  public disclosure; we will credit you unless you prefer otherwise.

A bug bounty (scope, tiers, payout currency) is decided by the project owner
before mainnet and will be published here.

## Scope

| In scope | Out of scope |
|---|---|
| Programs in `programs/` (except `mock-swap`, `mock-lending`, which are test-only) | Third-party programs (Token-2022, Jupiter, Kamino, Pyth, Squads) — report to their maintainers |
| Keeper, indexer, API, agent services | Denial of service by volumetric traffic against hosted infrastructure |
| Web app (`web/`) and SDK (`sdk/`) | Findings requiring a compromised user device or wallet |
| Deployment scripts and infrastructure code | Social engineering of the team |

## Supported versions

Only the latest deployed program versions and the `main` branch of the
services are supported. Program upgrades go through a 3-of-5 multisig with a
48 h timelock (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

## Security design summary

* **No admin custody of user funds.** AMM liquidity is non-withdrawable;
  treasury SOL leaves only through pro-rata redemption or a 48 h timelocked
  multisig action; chest withdrawals cannot be paused.
* **Bounded automation.** The keeper's swaps are oracle-bounded (≤ 0.5 %
  slippage); auto-absorb acts only within each user's revocable grant; the AI
  agent can only move parameters inside on-chain min/max with a 1 h cooldown.
* **Narrow emergency pause.** The guardian can pause only new offers,
  auto-absorb and launchpad — never redemption, chest withdrawals after lock,
  claims or settlement.
* **Token safety.** Fixed supply, no freeze authority, no permanent delegate,
  transfer hook pinned and its authority revoked — for BACKSTOP and every
  launchpad child (verified on-chain).

Details: [THREAT_MODEL.md](THREAT_MODEL.md), [DECISIONS.md](DECISIONS.md),
[docs/audit-prep.md](docs/audit-prep.md).

## Key management

* No secrets in the repository. Every service reads keys from its
  environment (see each `.env.example`); production keys live in a secrets
  manager (Terraform provisions references only).
* Program keypairs are generated at deploy time and never committed
  (`.gitignore` blocks `*-keypair.json`, `keys/`, `id.json`).
* Hot keys (keeper, agent, guardian) hold only the SOL needed for fees and can
  be rotated by governance without redeploying.
