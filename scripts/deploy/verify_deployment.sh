#!/usr/bin/env bash
# Verify that all contracts are deployed and initialized correctly.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.env"

export NEAR_ENV="${NEAR_ENV:-testnet}"

PASS=0
FAIL=0

check() {
    local label="$1"
    local cmd="$2"
    if eval "$cmd" &>/dev/null; then
        echo "  [PASS] $label"
        PASS=$((PASS + 1))
    else
        echo "  [FAIL] $label"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== Verifying deployment ==="

check "policy-registry deployed" \
    "near state $POLICY_REGISTRY_ACCOUNT"

check "attestation-verifier deployed" \
    "near state $VERIFIER_ACCOUNT"

check "zk-verifier deployed" \
    "near state $ZK_VERIFIER_ACCOUNT"

check "ido-escrow deployed" \
    "near state $ESCROW_ACCOUNT"

check "mock-ft deployed" \
    "near state $MOCK_FT_ACCOUNT"

check "zk-verifier has verification key" \
    "near view $ZK_VERIFIER_ACCOUNT get_verification_key '{}' | grep -q protocol"

check "attestation-verifier has signing address" \
    "near view $VERIFIER_ACCOUNT current_signing_address '{}'"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
