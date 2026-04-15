#!/usr/bin/env bash
# Deploy all 5 contracts to NEAR testnet and initialize them.
# Prerequisites:
#   1. near login (OWNER_ACCOUNT must be logged in)
#   2. scripts/deploy/config.env exists (copy from config.env.example)
#   3. scripts/tee/bootstrap_signer.sh has been run
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "${SCRIPT_DIR}/config.env"

export NEAR_ENV="${NEAR_ENV:-testnet}"

echo "=== [1/6] Building wasm binaries ==="
"$ROOT/scripts/build_all.sh"

echo ""
echo "=== [2/6] Creating sub-accounts ==="
"$SCRIPT_DIR/create_subaccounts.sh"

echo ""
echo "=== [3/6] Deploying contracts ==="

deploy_and_init() {
    local account="$1"
    local wasm="$2"
    local init_args="$3"
    local wasm_path="$ROOT/$wasm"

    if [ ! -f "$wasm_path" ]; then
        echo "ERROR: wasm not found: $wasm_path"
        exit 1
    fi

    echo "  [deploy] $account <- $wasm"
    near deploy "$account" "$wasm_path"
    echo "  [init] $account"
    near call "$account" new "$init_args" --accountId "$OWNER_ACCOUNT"
}

# 3a. policy-registry
deploy_and_init "$POLICY_REGISTRY_ACCOUNT" "$POLICY_WASM" \
    "{\"owner\": \"$OWNER_ACCOUNT\"}"

# 3b. attestation-verifier
deploy_and_init "$VERIFIER_ACCOUNT" "$VERIFIER_WASM" \
    "{\"owner\": \"$OWNER_ACCOUNT\", \"initial_signing_address\": $INITIAL_TEE_SIGNING_ADDRESS_JSON}"

# 3c. zk-verifier
ZK_VK_JSON=$(cat "$ROOT/$ZK_VERIFICATION_KEY_JSON_PATH" | jq -c '.')
deploy_and_init "$ZK_VERIFIER_ACCOUNT" "$ZK_VERIFIER_WASM" \
    "{\"owner\": \"$OWNER_ACCOUNT\", \"verification_key_json\": $(echo "$ZK_VK_JSON" | jq -Rs '.')}"

# 3d. ido-escrow (depends on all verifier accounts)
deploy_and_init "$ESCROW_ACCOUNT" "$ESCROW_WASM" \
    "{\"owner\": \"$OWNER_ACCOUNT\", \"policy_registry\": \"$POLICY_REGISTRY_ACCOUNT\", \"attestation_verifier\": \"$VERIFIER_ACCOUNT\", \"zk_verifier\": \"$ZK_VERIFIER_ACCOUNT\"}"

# 3e. mock-ft
deploy_and_init "$MOCK_FT_ACCOUNT" "$MOCK_FT_WASM" \
    "{\"owner_id\": \"$OWNER_ACCOUNT\", \"total_supply\": \"1000000000000000000000000000\", \"symbol\": \"MOCK\", \"name\": \"Mock Token\"}"

echo ""
echo "=== [4/6] Wiring cross-contract references ==="
echo "  [call] policy_registry.set_escrow_account($ESCROW_ACCOUNT)"
near call "$POLICY_REGISTRY_ACCOUNT" set_escrow_account \
    "{\"escrow_account\": \"$ESCROW_ACCOUNT\"}" \
    --accountId "$OWNER_ACCOUNT"

echo ""
echo "=== [5/6] Verifying deployment ==="
"$SCRIPT_DIR/verify_deployment.sh"

echo ""
echo "=== [6/6] Done! ==="
echo ""
echo "Contract accounts:"
echo "  policy-registry:      $POLICY_REGISTRY_ACCOUNT"
echo "  attestation-verifier: $VERIFIER_ACCOUNT"
echo "  zk-verifier:          $ZK_VERIFIER_ACCOUNT"
echo "  ido-escrow:           $ESCROW_ACCOUNT"
echo "  mock-ft:              $MOCK_FT_ACCOUNT"
