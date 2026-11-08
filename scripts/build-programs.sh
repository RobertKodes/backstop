#!/usr/bin/env bash
# Build every on-chain program (SBF) and its IDL.
#
#   scripts/build-programs.sh                # all programs
#   PROGRAMS="backstop_hook" scripts/build-programs.sh
#
# BACKSTOP_NO_RUSTUP=1 works around rustup < 1.28 (e.g. Ubuntu's packaged
# rustup), which rejects the platform-tools toolchain name that
# cargo-build-sbf tries to link. The Solana rustc is then passed via $RUSTC.
set -euo pipefail
cd "$(dirname "$0")/.."

ALL="backstop_hook backstop_core backstop_amm backstop_offers backstop_chest backstop_launchpad mock_swap mock_lending"
PROGRAMS="${PROGRAMS:-$ALL}"
TARGET_DIR="$(cargo metadata --format-version 1 --no-deps | python3 -c 'import json,sys; print(json.load(sys.stdin)["target_directory"])')"
mkdir -p "$TARGET_DIR/idl" "$TARGET_DIR/types"

EXTRA=()
if [ "${BACKSTOP_NO_RUSTUP:-0}" = "1" ]; then
  if [ -z "${RUSTC:-}" ]; then
    RUSTC="$(ls -d "$HOME"/.cache/solana/v*/platform-tools/rust/bin/rustc 2>/dev/null | sort -V | tail -1)"
  fi
  export RUSTC
  EXTRA=(-- --no-rustup-override)
fi

for p in $PROGRAMS; do
  if [ ! -d "programs/$(echo "$p" | sed -e 's/^backstop_hook$/transfer-hook/' -e 's/^backstop_//' -e 's/_/-/g' -e 's/^\(core\|amm\|offers\|chest\|launchpad\)$/backstop-\1/')" ]; then
    echo "skip $p (not present yet)"
    continue
  fi
  echo "==> building $p"
  anchor build --no-idl -p "$p" "${EXTRA[@]}"
  echo "==> idl $p"
  anchor idl build -p "$p" -o "$TARGET_DIR/idl/$p.json" -t "$TARGET_DIR/types/$p.ts"
done
echo "artifacts: $TARGET_DIR/deploy, $TARGET_DIR/idl"
