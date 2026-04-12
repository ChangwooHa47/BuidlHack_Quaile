---
id: infra-02-testnet-deploy
status: todo
sub: INFRA
layer: infra
depends_on: [contract-01-policy-registry, contract-02-attestation-verifier, contract-03a-escrow-state, contract-03b-escrow-settlement, contract-03c-escrow-claim-refund]
estimate: 1h
demo_step: "Setup for demo"
---

# NEAR testnet 배포 자동화

## Context
3개 컨트랙트를 testnet에 배포하고 초기화하는 스크립트.
데모 세션 시작 시 한 번에 실행.

PRD §6.1, §9
ONE_PAGER §6

## Files
- `scripts/deploy/deploy_all.sh`
- `scripts/deploy/lib.sh`                     — 공통 헬퍼
- `scripts/deploy/wait_for_tx.sh`
- `scripts/deploy/create_subaccounts.sh`
- `scripts/deploy/init_contracts.sh`
- `scripts/deploy/config.env.example`

## Spec

### config.env
```bash
# NEAR accounts
OWNER_ACCOUNT="owner-nearai.testnet"
POLICY_REGISTRY_ACCOUNT="policy.${OWNER_ACCOUNT}"
VERIFIER_ACCOUNT="verifier.${OWNER_ACCOUNT}"
ESCROW_ACCOUNT="escrow.${OWNER_ACCOUNT}"

# Initial TEE signing address (from tee-06-key-bootstrap 산출물)
# JSON array of 20 u8 bytes. 예: [171, 205, 239, ...]
# tee-06 bootstrap_signer.sh가 이 값을 출력함.
INITIAL_TEE_SIGNING_ADDRESS_JSON="[171,205,239,18,52,86,120,154,188,222,240,18,52,86,120,154,188,222,240,18]"

# Wasm paths
POLICY_WASM="target/wasm32-unknown-unknown/release/policy_registry.wasm"
VERIFIER_WASM="target/wasm32-unknown-unknown/release/attestation_verifier.wasm"
ESCROW_WASM="target/wasm32-unknown-unknown/release/ido_escrow.wasm"

# Network
NEAR_ENV="testnet"
NODE_URL="https://rpc.testnet.near.org"
```

### deploy_all.sh 흐름
```bash
#!/usr/bin/env bash
set -euo pipefail
source scripts/deploy/lib.sh
source "${CONFIG:-scripts/deploy/config.env}"

echo "=== Step 1: Build ==="
./scripts/build_all.sh

echo "=== Step 2: Create sub-accounts ==="
./scripts/deploy/create_subaccounts.sh

echo "=== Step 3: Deploy + init each contract ==="
# policy-registry
near deploy "$POLICY_REGISTRY_ACCOUNT" "$POLICY_WASM" \
  --initFunction new --initArgs "{\"owner\":\"$OWNER_ACCOUNT\"}"

# attestation-verifier
# initial_signing_address는 [u8; 20] (JSON array). tee-06 산출물을 그대로 주입.
near deploy "$VERIFIER_ACCOUNT" "$VERIFIER_WASM" \
  --initFunction new --initArgs "{\"owner\":\"$OWNER_ACCOUNT\",\"initial_signing_address\":$INITIAL_TEE_SIGNING_ADDRESS_JSON}"

# ido-escrow
near deploy "$ESCROW_ACCOUNT" "$ESCROW_WASM" \
  --initFunction new --initArgs "{\"owner\":\"$OWNER_ACCOUNT\",\"policy_registry\":\"$POLICY_REGISTRY_ACCOUNT\",\"attestation_verifier\":\"$VERIFIER_ACCOUNT\"}"

echo "=== Step 4: Wire cross-contract references ==="
# policy-registry에 escrow 계정 등록 (mark_closed 권한)
near call "$POLICY_REGISTRY_ACCOUNT" set_escrow_account \
  "{\"escrow\":\"$ESCROW_ACCOUNT\"}" \
  --accountId "$OWNER_ACCOUNT"

echo "=== Step 5: Verify deployment ==="
./scripts/deploy/verify_deployment.sh
```

### create_subaccounts.sh
```bash
create_if_missing() {
  local acc="$1"
  if ! near view-account "$acc" 2>/dev/null; then
    near create-subaccount "$acc" --masterAccount "$OWNER_ACCOUNT" --initialBalance 5
  fi
}
create_if_missing "$POLICY_REGISTRY_ACCOUNT"
create_if_missing "$VERIFIER_ACCOUNT"
create_if_missing "$ESCROW_ACCOUNT"
```

### verify_deployment.sh (assertions)
```bash
# 1. each contract has code (view state)
# 2. policy_registry.get_owner() == OWNER_ACCOUNT
# 3. verifier.current_signing_address() == INITIAL_TEE_SIGNING_ADDRESS
# 4. escrow.get_config() returns policy/verifier accounts
```

### 초기 TEE signing address 가져오기
- `tee/inference` 서비스를 먼저 기동 → `GET /v1/attestation/info` → `signing_address`
- 또는 개발자가 로컬에서 `python -c "from eth_account import Account; ..."`로 생성 후 env에 설정

## Acceptance Criteria
- [ ] `bash scripts/deploy/deploy_all.sh` 성공 (빈 testnet에서)
- [ ] 재실행 시 idempotent (이미 존재하는 sub-account/컨트랙트 감지 + skip 또는 명시적 에러)
- [ ] 실패 시 어느 단계에서 실패했는지 명확한 로그
- [ ] `verify_deployment.sh`가 5개 assertion 전부 통과
- [ ] 모든 tx hash가 `scripts/deploy/out/deploy.log`에 기록

## Test Cases
1. happy: 깨끗한 testnet 계정으로 deploy_all 성공
2. edge: 이미 존재하는 sub-account → skip (경고만)
3. edge: wasm 파일 누락 → 빌드 자동 호출 또는 명확한 에러
4. edge: near CLI 미설치 → 가이드 메시지
5. edge: OWNER_ACCOUNT balance 부족 → "need N NEAR" 에러

## Open Questions
1. near-cli-rs vs near (JS) 어느 쪽을 기준으로? → `near-cli-rs` (최신, 유지보수 활발)
2. Sub-account 명명 규칙: `policy.{owner}` vs `{owner}-policy`? → MVP는 dot prefix (NEAR 관례)
3. wasm redeploy 시 state migration 필요? → MVP는 state 버전 1 유지, migration 로드맵
4. Faucet 자동화 (testnet 계정 충전) → `helper.nearprotocol.com` 사용

## References
- NEAR CLI RS: https://github.com/near/near-cli-rs
- testnet helper: https://helper.nearprotocol.com
- `planning/PRD.md` §9
- `planning/tasks/test-01-e2e-demo.md`
