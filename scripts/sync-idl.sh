#!/usr/bin/env bash
# Copy the IDLs produced by scripts/build-programs.sh into the TS SDK.
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET_DIR="${CARGO_TARGET_DIR:-$(cargo metadata --format-version 1 --no-deps | python3 -c 'import json,sys; print(json.load(sys.stdin)["target_directory"])')}"
mkdir -p sdk/src/idl
for p in backstop_hook backstop_core backstop_amm backstop_offers backstop_chest backstop_launchpad; do
  if [ -f "$TARGET_DIR/idl/$p.json" ]; then
    cp "$TARGET_DIR/idl/$p.json" "sdk/src/idl/$p.json"
    [ -f "$TARGET_DIR/types/$p.ts" ] && cp "$TARGET_DIR/types/$p.ts" "sdk/src/idl/$p.ts"
    echo "synced $p"
  fi
done
