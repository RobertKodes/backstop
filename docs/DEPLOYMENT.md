# Deployment

## Environments

| Target | Command | Gate |
|---|---|---|
| Localnet | `bash scripts/deploy.sh localnet` | none (uses `solana-test-validator`) |
| Devnet | `pnpm deploy:devnet` then `pnpm genesis:devnet` and `pnpm seed:devnet` | funded deployer keypair |
| Mainnet | `pnpm deploy:mainnet` | **gated** — see below |

## Keys (never in the repo — D-003)

* Program keypairs: generated per environment into
  `~/.config/backstop/program-keys/<cluster>/<program>-keypair.json`
  (`scripts/deploy.sh` creates them if missing and prints the program IDs to
  write into `declare_id!`, `Anchor.toml`, `backstop-common::ids` and
  `sdk/src/constants.ts` before building).
* Deployer: `DEPLOYER_KEYPAIR` (devnet: a throwaway key funded by faucet;
  mainnet: a hardware wallet or Squads proposer).
* Service keys (keeper, agent, guardian): generated separately, stored in the
  secrets manager, referenced by Terraform (`infra/terraform`).

## Devnet flow

```bash
export DEPLOYER_KEYPAIR=~/.config/solana/devnet-deployer.json   # funded with ~40 SOL
pnpm deploy:devnet          # builds verifiable .so files, deploys all programs
pnpm genesis:devnet         # mint BACKSTOP, hook, market, pool, book, chests, Shield, agent authority, launchpad
pnpm seed:devnet            # fake activity: wallets, buys, offers, bids, settlements, a child launch
```

Then point the services at devnet (`RPC_URL`, `MARKETS` from
`scripts/ts/out/devnet.json`) and deploy them (Terraform or `docker compose
--profile app up -d`). The public demo URL is the web app built with
`NEXT_PUBLIC_CLUSTER=devnet`.

## Mainnet gate (`scripts/deploy.sh mainnet-beta`)

The script refuses to run unless **all** of the following hold:

1. `CONFIRM_MAINNET=I-UNDERSTAND-THIS-IS-MAINNET` is set.
2. The git tree is clean and `HEAD` is a signed tag matching `v*`.
3. `audits/SIGNOFF` exists and contains the `HEAD` commit hash (written after
   the external audit and fix review).
4. `cargo test --workspace` and the TypeScript test suite pass (re-run by the
   script).
5. Programs are built with `anchor build --verifiable` and the resulting
   SHA-256 hashes are printed for the multisig signers to compare.
6. `UPGRADE_AUTHORITY` is set to the Squads vault address; after deployment
   the script transfers each program's upgrade authority to it and verifies
   with `solana program show`.

## Upgrade authority and timelock

* Upgrade authority: Squads v4 multisig, 3-of-5, with a 48 h time lock on the
  vault's transactions. Program buffers are written by a proposer and the
  upgrade instruction executes only after approval + time lock.
* Governance roles (`Market.governance`, `HookConfig.governance`,
  `LaunchpadConfig.governance`) are the same Squads vault. Treasury
  withdrawals and redemption pauses additionally use the on-chain 48 h
  `queue_action` timelock in `backstop-core`.

## Path to immutability

1. Mainnet launch with upgradeable programs under the 3-of-5 + 48 h timelock.
2. After ≥ 2 independent audits and ≥ 6 months without critical findings,
   freeze `backstop-amm` and `backstop-offers` (set upgrade authority to
   `None`).
3. Freeze `transfer-hook` once the allowlist set is stable (allowlist edits
   remain possible through `HookConfig.governance`).
4. Freeze `backstop-chest` once the yield adapters are final; `backstop-core`
   last, after which only governable parameters (validated ranges) can change.
