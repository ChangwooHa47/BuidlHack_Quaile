#!/usr/bin/env bash
# Call ido-escrow.contribute() with bundle + ZK proof.
# Usage: ./06_contribute.sh <policy_id> <investor_account> <out_dir>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$ROOT/scripts/deploy/config.env"

export NEAR_ENV="${NEAR_ENV:-testnet}"

POLICY_ID="${1:?Usage: 06_contribute.sh <policy_id> <investor> <out_dir>}"
INVESTOR="${2:?}"
OUT_DIR="${3:?}"

BUNDLE=$(cat "$OUT_DIR/bundle.json" | jq -c '.')
PROOF_JSON=$(cat "$OUT_DIR/proof.json" | jq -c '.')
PUBLIC_JSON=$(cat "$OUT_DIR/public.json" | jq -c '.')

# Build the args — zk_proof_json and zk_public_inputs_json are stringified JSON
ARGS=$(jq -n \
    --argjson policy_id "$POLICY_ID" \
    --argjson bundle "$BUNDLE" \
    --arg zk_proof_json "$PROOF_JSON" \
    --arg zk_public_inputs_json "$PUBLIC_JSON" \
    '{
        policy_id: $policy_id,
        bundle: $bundle,
        zk_proof_json: $zk_proof_json,
        zk_public_inputs_json: $zk_public_inputs_json
    }')

echo "  Calling contribute() on $ESCROW_ACCOUNT..."
near call "$ESCROW_ACCOUNT" contribute \
    "$ARGS" \
    --accountId "$INVESTOR" \
    --deposit 100 \
    --gas 200000000000000

echo "  Contribute tx submitted."
