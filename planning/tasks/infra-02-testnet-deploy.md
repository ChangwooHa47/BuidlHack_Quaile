---
id: infra-02-testnet-deploy
status: done
sub: INFRA
layer: infra
depends_on: [tee-06-key-bootstrap, zk-04-zk-verifier-contract, zk-05-escrow-zk-integration]
estimate: 1.5h
demo_step: "Setup for demo"
---

# NEAR testnet 배포 자동화 (v2 — ZK 반영)

## Context
5개 컨트랙트(policy-registry, attestation-verifier, ido-escrow, zk-verifier, mock-ft)를 testnet에 배포하고 초기화하는 스크립트.

v1 대비 변경:
- zk-verifier 컨트랙트 배포 추가
- mock-ft 컨트랙트 배포 추가
- ido-escrow `new()` 파라미터에 `zk_verifier` 추가
- TEE FastAPI에 CORS 설정 추가

## Files
- `scripts/deploy/deploy_all.sh` (create/rewrite)
- `scripts/deploy/config.env.example` (create/rewrite)
- `scripts/deploy/create_subaccounts.sh` (create)
- `scripts/deploy/verify_deployment.sh` (create)
- `scripts/build_all.sh` (modify — zk-verifier 추가)
- `tee/inference/src/main.py` (modify — CORS middleware 추가)

## Spec

### config.env.example
```bash
OWNER_ACCOUNT="owner-nearai.testnet"
POLICY_REGISTRY_ACCOUNT="policy.${OWNER_ACCOUNT}"
VERIFIER_ACCOUNT="verifier.${OWNER_ACCOUNT}"
ESCROW_ACCOUNT="escrow.${OWNER_ACCOUNT}"
ZK_VERIFIER_ACCOUNT="zkverifier.${OWNER_ACCOUNT}"
MOCK_FT_ACCOUNT="mockft.${OWNER_ACCOUNT}"

# tee-06 bootstrap_signer.sh 산출물
INITIAL_TEE_SIGNING_ADDRESS_JSON="[171,205,239,...]"

# Wasm paths
POLICY_WASM="target/wasm32-unknown-unknown/release/policy_registry.wasm"
VERIFIER_WASM="target/wasm32-unknown-unknown/release/attestation_verifier.wasm"
ESCROW_WASM="target/wasm32-unknown-unknown/release/ido_escrow.wasm"
ZK_VERIFIER_WASM="target/wasm32-unknown-unknown/release/zk_verifier.wasm"
MOCK_FT_WASM="target/wasm32-unknown-unknown/release/mock_ft.wasm"

# ZK verification key (circuits/build/verification_key.json 내용)
ZK_VERIFICATION_KEY_JSON_PATH="circuits/build/verification_key.json"

NEAR_ENV="testnet"
```

### deploy_all.sh 흐름
1. Build all wasm (`scripts/build_all.sh`)
2. Create sub-accounts (5개)
3. Deploy + init:
   - policy-registry: `new(owner)`
   - attestation-verifier: `new(owner, initial_signing_address)`
   - zk-verifier: `new(owner, verification_key_json)` — `verification_key.json` 내용을 문자열로 전달
   - ido-escrow: `new(owner, policy_registry, attestation_verifier, zk_verifier)` — **zk_verifier 추가**
   - mock-ft: `new(owner, total_supply, metadata)`
4. Wire cross-contract: `policy_registry.set_escrow_account(escrow)`
5. Verify deployment

### CORS 설정 (main.py)
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # staging에서는 Vercel 도메인으로 제한
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Acceptance Criteria
- [ ] `deploy_all.sh` 한 번에 5개 컨트랙트 배포 + 초기화 성공
- [ ] ido-escrow가 zk_verifier 주소를 올바르게 참조
- [ ] zk-verifier에 verification_key.json이 정상 등록
- [ ] mock-ft가 배포되어 ft_transfer 가능
- [ ] TEE FastAPI에 CORS middleware 추가됨
- [ ] verify_deployment.sh 전부 통과

## Test Cases
1. 깨끗한 testnet에서 deploy_all 성공
2. 이미 존재하는 sub-account → skip
3. wasm 파일 누락 → 빌드 자동 호출
4. zk-verifier `get_verification_key()` → 등록한 JSON 반환

## 코드리뷰 체크포인트
1. ido-escrow init args에 `zk_verifier` 포함 확인
2. zk-verifier init 시 verification_key_json이 올바른 형식인지
3. CORS allow_origins가 staging에서 적절히 제한되는지

## References
- 기존 infra-02 계획 + ZK 변경사항
- zk-04: contracts/zk-verifier
- zk-05: ido-escrow ZK 통합
