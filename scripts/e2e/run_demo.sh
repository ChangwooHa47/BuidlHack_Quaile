#!/usr/bin/env bash
# End-to-end demo: full flow from policy registration to claim.
#
# Prerequisites:
#   1. Contracts deployed (scripts/deploy/deploy_all.sh)
#   2. TEE service running (cd tee/inference && uvicorn src.main:create_app --factory --port 8080)
#   3. config.env populated
#   4. circuits/build/ has circuit artifacts (from zk-01 setup)
#   5. Investor account exists and is logged in
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load deploy config
source "$ROOT/scripts/deploy/config.env"

export NEAR_ENV="${NEAR_ENV:-testnet}"
TEE_URL="${TEE_URL:-http://localhost:8080}"
INVESTOR_ACCOUNT="${INVESTOR_ACCOUNT:-investor-1.testnet}"
FOUNDATION_ACCOUNT="${FOUNDATION_ACCOUNT:-$OWNER_ACCOUNT}"

OUT_DIR="$SCRIPT_DIR/out"
mkdir -p "$OUT_DIR"

echo "============================================================"
echo "  Qualie E2E Demo"
echo "============================================================"
echo ""
echo "  Owner:      $OWNER_ACCOUNT"
echo "  Foundation:  $FOUNDATION_ACCOUNT"
echo "  Investor:    $INVESTOR_ACCOUNT"
echo "  TEE:         $TEE_URL"
echo ""

# ── Step 1: Register foundation ──
echo "=== [1/9] Register foundation ==="
near call "$POLICY_REGISTRY_ACCOUNT" add_foundation \
    "{\"foundation\": \"$FOUNDATION_ACCOUNT\"}" \
    --accountId "$OWNER_ACCOUNT" || true
echo ""

# ── Step 2: Register policy ──
echo "=== [2/9] Register policy ==="
NOW_NS=$(date +%s)000000000
SUB_START=$(( NOW_NS + 60000000000 ))     # +60s
SUB_END=$(( NOW_NS + 7260000000000 ))     # +2h+1min (> sub_start + 1h)
LIVE_END=$(( NOW_NS + 14460000000000 ))   # +4h+1min

POLICY_TX=$(near call "$POLICY_REGISTRY_ACCOUNT" register_policy \
    "{\"natural_language\": \"Prefer long-term NEAR holders with minimum 180 days wallet history and active ecosystem participation.\", \"ipfs_cid\": \"bafybeibwzifw52ttrkqlikfzext5akxu7lz4xiwjgwzmqcpdzmp3n5mbdq\", \"sale_config\": {\"token_contract\": \"$MOCK_FT_ACCOUNT\", \"total_allocation\": \"1000000000000000000000000000\", \"price_per_token\": \"1000000000000000000000000\", \"payment_token\": \"Near\", \"subscription_start\": $SUB_START, \"subscription_end\": $SUB_END, \"live_end\": $LIVE_END}}" \
    --accountId "$FOUNDATION_ACCOUNT" 2>&1)
echo "$POLICY_TX"
POLICY_ID=$(echo "$POLICY_TX" | grep -oE "[0-9]+" | tail -1)
echo "Policy ID: $POLICY_ID"
echo "$POLICY_ID" > "$OUT_DIR/policy_id.txt"
echo ""

# ── Step 3: Advance to Subscribing ──
echo "=== [3/9] Advance status → Subscribing ==="
echo "Waiting for subscription_start..."
sleep 65
near call "$POLICY_REGISTRY_ACCOUNT" advance_status \
    "{\"id\": $POLICY_ID}" \
    --accountId "$OWNER_ACCOUNT"
echo ""

# ── Step 4: Submit persona to TEE ──
echo "=== [4/9] Submit persona to TEE ==="
"$ROOT/tee/inference/.venv/bin/python3" "$SCRIPT_DIR/05_submit_persona.py" \
    --tee-url "$TEE_URL" \
    --investor "$INVESTOR_ACCOUNT" \
    --policy-id "$POLICY_ID" \
    --out-dir "$OUT_DIR"
echo ""

# ── Step 5: Generate ZK proof ──
echo "=== [5/9] Generate ZK proof (snarkjs) ==="
(
    cd "$OUT_DIR"
    WASM_PATH="$ROOT/circuits/build/eligibility_js/eligibility.wasm"
    ZKEY_PATH="$ROOT/circuits/build/eligibility_final.zkey"

    snarkjs wtns calculate "$WASM_PATH" zk_input.json witness.wtns
    snarkjs groth16 prove "$ZKEY_PATH" witness.wtns proof.json public.json
    snarkjs groth16 verify "$ROOT/circuits/build/verification_key.json" public.json proof.json
    echo "ZK proof verified locally."
)
echo ""

# ── Step 6: Contribute ──
echo "=== [6/9] Contribute (bundle + ZK proof) ==="
"$SCRIPT_DIR/06_contribute.sh" "$POLICY_ID" "$INVESTOR_ACCOUNT" "$OUT_DIR"
echo ""

# ── Step 7: Advance to Live, then Closed ──
echo "=== [7/9] Advance status → Live → Closed ==="
# For demo speed, we manually advance (in production this is time-gated)
near call "$POLICY_REGISTRY_ACCOUNT" advance_status \
    "{\"id\": $POLICY_ID}" \
    --accountId "$OWNER_ACCOUNT" || echo "(may need to wait for subscription_end)"
echo ""

# ── Step 8: Settle ──
echo "=== [8/9] Settle ==="
near call "$ESCROW_ACCOUNT" settle \
    "{\"policy_id\": $POLICY_ID, \"max_contributions\": 100}" \
    --accountId "$OWNER_ACCOUNT" \
    --gas 300000000000000 || echo "(settle may need Closed status)"
echo ""

# ── Step 9: Verify ──
echo "=== [9/9] Verify ==="
echo "Contribution:"
near view "$ESCROW_ACCOUNT" get_contribution \
    "{\"investor\": \"$INVESTOR_ACCOUNT\", \"policy_id\": $POLICY_ID}" || true
echo ""
echo "Policy totals:"
near view "$ESCROW_ACCOUNT" get_policy_totals \
    "{\"policy_id\": $POLICY_ID}" || true
echo ""

echo "============================================================"
echo "  Demo complete!"
echo "============================================================"
