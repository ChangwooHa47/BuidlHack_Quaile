#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== [1/3] Rust workspace build ==="
cd "$ROOT"
cargo build --workspace

echo "=== [2/3] Wasm build (contracts) ==="
# Add contract crates here as they are created:
#   -p policy-registry -p attestation-verifier -p ido-escrow
cargo build --target wasm32-unknown-unknown --release \
  $(cargo metadata --no-deps --format-version 1 \
    | python3 -c "
import json,sys
pkgs = json.load(sys.stdin)['packages']
names = [p['name'] for p in pkgs if 'contracts/' in p['manifest_path']]
print(' '.join(f'-p {n}' for n in names))
" 2>/dev/null || true)

echo "=== [3/3] Python TEE service ==="
cd "$ROOT/tee/inference"
uv sync --quiet
uv run pytest -q

echo ""
echo "=== Build complete ==="
