#!/usr/bin/env bash
# Deploy the BACKSTOP programs.
#   scripts/deploy.sh localnet|devnet|mainnet-beta
#
# Keys are never in the repo (D-003): program keypairs come from
# $PROGRAM_KEYS_DIR (default ~/.config/backstop/program-keys/<cluster>, falling
# back to ~/.config/backstop/program-keys), the payer from $DEPLOYER_KEYPAIR.
# Mainnet is gated — see docs/DEPLOYMENT.md.
set -euo pipefail
cd "$(dirname "$0")/.."

CLUSTER="${1:?usage: scripts/deploy.sh localnet|devnet|mainnet-beta}"
case "$CLUSTER" in
  localnet) URL="${RPC_URL:-http://127.0.0.1:8899}" ;;
  devnet) URL="${RPC_URL:-https://api.devnet.solana.com}" ;;
  mainnet-beta) URL="${RPC_URL:-https://api.mainnet-beta.solana.com}" ;;
  *) echo "unknown cluster $CLUSTER" >&2; exit 2 ;;
esac
DEPLOYER="${DEPLOYER_KEYPAIR:-$HOME/.config/solana/id.json}"
KEYS="${PROGRAM_KEYS_DIR:-$HOME/.config/backstop/program-keys/$CLUSTER}"
[ -d "$KEYS" ] || KEYS="$HOME/.config/backstop/program-keys"
TARGET="${CARGO_TARGET_DIR:-target}"
PROGRAMS=(backstop_hook backstop_core backstop_amm backstop_offers backstop_chest backstop_launchpad)
[ "$CLUSTER" != "mainnet-beta" ] && PROGRAMS+=(mock_swap mock_lending)

die() { echo "✗ $*" >&2; exit 1; }

declared_id() { # program name → id from Anchor.toml [programs.localnet]
  awk -v p="$1" -F' = ' '/^\[programs.localnet\]/{s=1;next} /^\[/{s=0} s && $1==p {gsub(/"/,"",$2); print $2}' Anchor.toml
}

if [ "$CLUSTER" = "mainnet-beta" ]; then
  echo "== mainnet gate"
  [ "${CONFIRM_MAINNET:-}" = "I-UNDERSTAND-THIS-IS-MAINNET" ] || die "set CONFIRM_MAINNET=I-UNDERSTAND-THIS-IS-MAINNET"
  [ -z "$(git status --porcelain)" ] || die "git tree is not clean"
  TAG="$(git describe --exact-match --tags HEAD 2>/dev/null || true)"
  [[ "$TAG" == v* ]] || die "HEAD must be a release tag v*"
  git tag -v "$TAG" >/dev/null 2>&1 || die "tag $TAG is not signed/verifiable"
  HEAD_SHA="$(git rev-parse HEAD)"
  [ -f audits/SIGNOFF ] && grep -q "$HEAD_SHA" audits/SIGNOFF || die "audits/SIGNOFF must contain $HEAD_SHA"
  [ -n "${UPGRADE_AUTHORITY:-}" ] || die "set UPGRADE_AUTHORITY to the Squads vault address"
  echo "== full test suite"
  cargo test --workspace --quiet
  pnpm -r --workspace-concurrency=1 test
  echo "== verifiable build"
  anchor build --verifiable
  TARGET="target/verifiable"
else
  echo "== build"
  bash scripts/build-programs.sh
fi

echo "== deploy to $CLUSTER ($URL)"
for p in "${PROGRAMS[@]}"; do
  so="$TARGET/deploy/$p.so"
  [ -f "$so" ] || so="$TARGET/$p.so"
  [ -f "$so" ] || die "missing $so"
  kp="$KEYS/$p.json"
  [ -f "$kp" ] || die "missing program keypair $kp"
  want="$(declared_id "$p")"
  got="$(solana-keygen pubkey "$kp")"
  [ "$want" = "$got" ] || die "$p: keypair $got does not match declared id $want (update declare_id!/Anchor.toml/ids first)"
  echo "-- $p $got  sha256 $(sha256sum "$so" | cut -c1-16)…"
  solana program deploy --url "$URL" --keypair "$DEPLOYER" --program-id "$kp" "$so" \
    --max-sign-attempts 50 --with-compute-unit-price 10000
  if [ "$CLUSTER" = "mainnet-beta" ]; then
    solana program set-upgrade-authority "$got" --url "$URL" --keypair "$DEPLOYER" \
      --new-upgrade-authority "$UPGRADE_AUTHORITY" --skip-new-upgrade-authority-signer-check
    solana program show "$got" --url "$URL" | grep -q "$UPGRADE_AUTHORITY" || die "$p upgrade authority not transferred"
  fi
done
echo "✓ deployed. Next: pnpm --filter ./scripts/ts genesis --cluster $CLUSTER"
