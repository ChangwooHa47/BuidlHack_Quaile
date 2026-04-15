#!/usr/bin/env bash
# Bootstrap TEE signing key.
# Usage: ./bootstrap_signer.sh [key_file]
# Default key_file: .secrets/tee_signer.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
KEY_FILE="${1:-$ROOT/.secrets/tee_signer.json}"

mkdir -p "$(dirname "$KEY_FILE")"
chmod 700 "$(dirname "$KEY_FILE")"

if [ -f "$KEY_FILE" ]; then
    echo "Key already exists: $KEY_FILE"
    jq -r '.address' "$KEY_FILE"
    exit 0
fi

echo "Generating new TEE signer key..."
# Use project venv if available (has eth_account), fall back to system python3
PYTHON="${ROOT}/tee/inference/.venv/bin/python3"
if [ ! -x "$PYTHON" ]; then
    PYTHON="python3"
fi
"$PYTHON" "$SCRIPT_DIR/gen_signer_key.py" > "$KEY_FILE"
chmod 600 "$KEY_FILE"

ADDR=$(jq -r '.address' "$KEY_FILE")
ADDR_BYTES=$(jq -c '.address_bytes' "$KEY_FILE")

echo ""
echo "Generated signer: $ADDR"
echo ""
echo "=== Next steps ==="
echo ""
echo "1. Add to scripts/deploy/config.env:"
echo "   INITIAL_TEE_SIGNING_ADDRESS_JSON='$ADDR_BYTES'"
echo ""
echo "2. Add to tee/inference/.env (read private_key from $KEY_FILE):"
echo "   TEE_SIGNER_PRIVKEY=0x<private_key from $KEY_FILE>"
echo "   TEE_SIGNER_KEY_ID=0"
