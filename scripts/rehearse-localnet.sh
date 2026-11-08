#!/usr/bin/env bash
# Start a local validator with every program preloaded at its declared id.
# Runs in the foreground; in another shell:
#   pnpm --filter ./scripts/ts genesis --cluster localnet
#   pnpm --filter ./scripts/ts seed --cluster localnet --fast --crank --child
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${CARGO_TARGET_DIR:-target}"
LEDGER="${LEDGER_DIR:-$HOME/.backstop-ledger}"
args=()
for p in backstop_hook backstop_core backstop_amm backstop_offers backstop_chest backstop_launchpad mock_swap mock_lending; do
  id="$(awk -v p="$p" -F' = ' '/^\[programs.localnet\]/{s=1;next} /^\[/{s=0} s && $1==p {gsub(/"/,"",$2); print $2}' Anchor.toml)"
  so="$TARGET/deploy/$p.so"
  [ -f "$so" ] || { echo "missing $so — run scripts/build-programs.sh" >&2; exit 1; }
  args+=(--bpf-program "$id" "$so")
done
exec solana-test-validator --reset --quiet --ledger "$LEDGER" --limit-ledger-size 50000000 "${args[@]}"
