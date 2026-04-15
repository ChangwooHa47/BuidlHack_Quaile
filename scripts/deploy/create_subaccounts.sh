#!/usr/bin/env bash
# Create sub-accounts for contract deployment.
# Idempotent — skips if account already exists.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.env"

export NEAR_ENV="${NEAR_ENV:-testnet}"
DEPOSIT="10"  # NEAR to fund each sub-account

create_if_missing() {
    local account="$1"
    if near state "$account" &>/dev/null; then
        echo "  [skip] $account already exists"
    else
        echo "  [create] $account"
        near create-account "$account" \
            --masterAccount "$OWNER_ACCOUNT" \
            --initialBalance "$DEPOSIT"
    fi
}

echo "=== Creating sub-accounts under $OWNER_ACCOUNT ==="
create_if_missing "$POLICY_REGISTRY_ACCOUNT"
create_if_missing "$VERIFIER_ACCOUNT"
create_if_missing "$ESCROW_ACCOUNT"
create_if_missing "$ZK_VERIFIER_ACCOUNT"
create_if_missing "$MOCK_FT_ACCOUNT"
echo "=== Done ==="
