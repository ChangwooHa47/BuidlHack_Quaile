# Qualie (Buidl-NEAR AI) — 테스트 계획

> Staging 배포 전 전체 시스템 검증. 3단계로 나눠서 진행.

**Last Updated**: 2026-04-15

---

## 환경 요구사항

### 도구

| 도구 | 버전 | 확인 명령 |
|---|---|---|
| near-cli-rs | 0.25+ | `near --version` |
| snarkjs | 0.7+ | `snarkjs` (help 출력 확인) |
| circom | 2.1+ | `circom --version` |
| Rust + wasm32 target | 1.78+ | `rustup target list --installed \| grep wasm32` |
| Python + uv | 3.11+ | `python3 --version && uv --version` |
| jq | any | `jq --version` |

### NEAR Testnet 계정

```
Owner:              rockettheraccon.testnet
policy-registry:    policy.rockettheraccon.testnet
attestation-verifier: verifier.rockettheraccon.testnet
ido-escrow:         escrow.rockettheraccon.testnet
zk-verifier:        zkverifier.rockettheraccon.testnet
mock-ft:            mockft.rockettheraccon.testnet
```

계정 키: `~/.near-credentials/accounts.json`에 등록되어 있어야 함.

### 테스트용 투자자 프로필

```
NEAR 계정:    rockettheraccon.testnet
EVM 주소:     0x4606435057A755B9b696c29b0f6bBA9E72bF9B0E
Self Intro:   "I have been actively participating in the NEAR and Ethereum ecosystems 
               for over 2 years. I provide liquidity on Ref Finance and have voted in 
               multiple DAO proposals on Sputnik. I also hold positions across Ethereum, 
               Base, and Arbitrum with a focus on long-term DeFi protocols."
GitHub:       skip (테스트 범위 밖)
```

### 테스트용 재단 Criteria (Policy natural_language)

```
Evaluation criteria for this IDO:
1. Investor must have held tokens for at least 90 days on any chain
2. Must have participated in DAO governance voting at least 3 times
3. Must have on-chain activity on 2 or more chains (NEAR + EVM)
4. Wallet age must exceed 180 days
5. Self introduction must demonstrate genuine DeFi or blockchain experience
```

이 criteria로 위 투자자를 평가하면 LLM이 각 항목별 pass/fail을 판정할 수 있다.

### 환경변수

**TEE 서비스** (`tee/inference/.env`):
```bash
NEAR_AI_API_KEY=<https://cloud.near.ai 에서 발급>
NEAR_AI_BASE_URL=https://api.near.ai/v1
NEAR_AI_MODEL=deepseek-ai/DeepSeek-V3.1
TEE_SIGNER_PRIVKEY=          # 비워두면 dev signer 사용
ALLOW_DEV_TEE_SIGNER=true
TEE_SIGNER_KEY_ID=1
NEAR_RPC_URL=https://rpc.testnet.near.org
POLICY_REGISTRY_ACCOUNT=policy.rockettheraccon.testnet
IDO_ESCROW_ACCOUNT=escrow.rockettheraccon.testnet
```

**배포 스크립트** (`scripts/deploy/config.env`): 이미 설정됨.

### Circuit 산출물

`circuits/build/` 하위에 다음 파일이 있어야 함:
- `eligibility_js/eligibility.wasm`
- `eligibility_final.zkey`
- `verification_key.json`

없으면: `cd circuits && ./scripts/setup.sh`

---

## Phase 1 — 격리 검증 (외부 의존 없음)

코드 레벨 신뢰도 확보. 네트워크 없이 로컬에서 전부 실행 가능.

### 1-1. Rust workspace 전체 테스트

```bash
cargo test --workspace
```

**기대 결과**: 45 passed, 0 failed

**검증 대상**:
- attestation-verifier: ecrecover, key rotation, grace period
- ido-escrow: contribute, rollback, settlement, claim/refund
- policy-registry: register, advance_status, mark_closed
- mock-ft: mint, ft_transfer
- zk-verifier: verify_proof, register_verified_proof
- tee-shared: borsh roundtrip, payload_hash

### 1-2. Python TEE 서비스 테스트

```bash
cd tee/inference && uv run pytest -v
```

**기대 결과**: 63 passed, 0 failed

**검증 대상**:
- 소유권 검증 (NEP-413, EIP-191)
- 파이프라인 (process_persona mock)
- LLM 응답 파싱 + validation
- PII 필터
- Borsh canonical 직렬화
- TEE signer (secp256k1)

### 1-3. Circom circuit proof 생성 + 검증

```bash
cd circuits/build

# 이미 있는 proof 검증
snarkjs groth16 verify verification_key.json public.json proof.json
# 기대: [INFO] snarkJS: OK!

# fail case 검증
snarkjs groth16 verify verification_key.json public_fail.json proof_fail.json 2>&1 || true
# 기대: eligible 출력이 0
cat public_fail.json | jq '.[4]'
# 기대: "0"
```

### 1-4. Wasm 빌드 + 크기 확인

```bash
cargo build --target wasm32-unknown-unknown --release -p policy-registry
cargo build --target wasm32-unknown-unknown --release -p attestation-verifier
cargo build --target wasm32-unknown-unknown --release -p ido-escrow
cargo build --target wasm32-unknown-unknown --release -p zk-verifier
cargo build --target wasm32-unknown-unknown --release -p mock-ft

# 크기 확인 (NEAR 제한: 4MB)
ls -lh target/wasm32-unknown-unknown/release/*.wasm
```

**기대 결과**: 5개 전부 빌드 성공, 각 wasm < 4MB

### 1-5. Borsh cross-lang golden vector

```bash
# Rust
cargo test -p tee-shared --features contract -- payload_hash 2>&1 | grep -E "ok|FAILED"

# Python
cd tee/inference && uv run pytest tests/test_pipeline.py::test_python_payload_hash_is_deterministic -v
```

**기대 결과**: 둘 다 통과. CriteriaResults 포함 AttestationPayload의 Borsh→keccak256 해시가 Rust/Python 일치.

---

## Phase 2 — Testnet 통합 (NEAR testnet + TEE 서비스)

실제 네트워크 연결. NEAR AI API key 필요.

### 2-1. 컨트랙트 view 호출 확인

```bash
# Policy 조회
near view policy.rockettheraccon.testnet get_policy '{"id": 0}'

# Escrow 상태
near view escrow.rockettheraccon.testnet get_policy_pending_total '{"policy_id": 0}'

# ZK verifier
near view zkverifier.rockettheraccon.testnet get_verification_key '{}'
```

**기대 결과**: 각각 JSON 응답 반환. 에러 없음.

### 2-2. TEE 서비스 기동

```bash
cd tee/inference
source .env  # 또는 direnv
uv run uvicorn src.main:create_app --factory --port 8080 &
sleep 3

# healthz 확인
curl -s http://localhost:8080/healthz
# 기대: {"status":"ok"}

# attestation info 확인
curl -s http://localhost:8080/v1/attestation/info | jq '.'
# 기대: signing_address, key_id 반환
```

### 2-3. `/v1/structurize` 호출 (LLM criteria 생성)

```bash
curl -s -X POST http://localhost:8080/v1/structurize \
  -H "Content-Type: application/json" \
  -d '{"natural_language": "Prefer long-term NEAR holders with minimum 180 days wallet history and active DAO participation."}' \
  | jq '.'
```

**기대 결과**:
```json
{
  "criteria": ["Has held tokens for more than 180 days", "..."],
  "qualitative_prompt": "..."
}
```

**위험**: NEAR AI API 응답이 스키마에 안 맞을 수 있음. 실패 시 retry 3회 후 500 반환.

### 2-4. `/v1/attest` 호출 (전체 파이프라인 — 실제 AI 판단)

이 단계에서 **실제 온체인 데이터 수집 + 실제 LLM 판단**을 검증한다.
서명 검증은 skip (staging에서 FE 통해 테스트). 데이터 수집 + AI 판단이 핵심.

**테스트용 EVM 지갑**: `0x4606435057A755B9b696c29b0f6bBA9E72bF9B0E`

```bash
cd scripts/e2e
python3 05_submit_persona.py \
  --tee-url http://localhost:8080 \
  --investor rockettheraccon.testnet \
  --policy-id 0 \
  --out-dir ./out
```

> **NOTE**: 현재 `05_submit_persona.py`는 빈 wallets로 호출한다.
> 실제 AI 판단 검증을 위해서는 EVM 주소의 온체인 데이터가 ingestor를 통해 수집되어야 한다.
> 서명 검증 없이 데이터만 수집하려면, ingestor를 직접 호출하거나
> `05_submit_persona.py`에 `--evm-address 0x4606...9B0E` 옵션을 추가해야 한다.
> 지갑 소유권 서명 검증은 staging FE 테스트에서 진행.

**기대 결과**:
- `out/bundle.json` 생성 (AttestationBundle)
- `out/zk_input.json` 생성 (payload_hash_limbs, criteria, criteria_count)
- LLM이 실제 온체인 데이터 기반으로 criteria pass/fail 판정
- verdict=Eligible 또는 Ineligible (실제 데이터에 따라 달라짐)

**주의**:
- Policy status가 `Subscribing`이어야 함. 아니면 400 에러.
- 서명 검증 skip — staging FE 테스트에서 검증.
- dev signer 사용 중이므로 TEE report는 mock.

### 2-5. ZK proof 생성

```bash
cd scripts/e2e/out

# verdict가 Eligible일 때만 진행
snarkjs wtns calculate \
  ../../circuits/build/eligibility_js/eligibility.wasm \
  zk_input.json \
  witness.wtns

snarkjs groth16 prove \
  ../../circuits/build/eligibility_final.zkey \
  witness.wtns \
  proof.json \
  public.json

snarkjs groth16 verify \
  ../../circuits/build/verification_key.json \
  public.json \
  proof.json
```

**기대 결과**: `[INFO] snarkJS: OK!`

**위험**: verdict=Ineligible이면 zk_input의 criteria에 0이 있어서 eligible 출력이 0. 이 경우 proof는 생성되지만 contribute()에서 거부됨.

### 2-6. contribute() 호출

```bash
cd scripts/e2e
./06_contribute.sh 0 rockettheraccon.testnet ./out
```

**기대 결과**: contribute tx 성공. `ContributionCreated` 이벤트.

**위험 구간**:
- **Gas**: 200 TGas 설정. get_policy → verify → verify_proof 3단계 Promise 체인. 부족하면 300 TGas로 올려야 함.
- **ZK proof eligible 필드**: public.json의 마지막 값이 "1"이어야 함.
- **Attestation 만료**: `expires_at`이 지났으면 sync validation에서 거부.
- **Nonce 재사용**: 같은 nonce로 두 번 호출하면 NonceReused 에러.

### 2-7. Contribution 확인

```bash
near view escrow.rockettheraccon.testnet get_contribution \
  '{"investor": "rockettheraccon.testnet", "policy_id": 0}'
```

**기대 결과**: Contribution 객체 반환. `outcome: "NotSettled"`, `amount > 0`.

---

## Phase 3 — Full E2E (전체 플로우)

`run_demo.sh`로 전체 시나리오 실행. Policy 등록부터 Claim까지.

### 사전 준비

1. TEE 서비스 기동 (Phase 2-2)
2. 기존 Policy와 겹치지 않도록 새 Policy 등록 (run_demo.sh가 자동 처리)
3. mock-ft에서 escrow로 토큰 입금 확인:

```bash
# escrow 계정 storage deposit
near call mockft.rockettheraccon.testnet storage_deposit \
  '{"account_id": "escrow.rockettheraccon.testnet"}' \
  --accountId rockettheraccon.testnet \
  --deposit 0.00125

# escrow에 토큰 전송 (claim 시 필요)
near call mockft.rockettheraccon.testnet ft_transfer \
  '{"receiver_id": "escrow.rockettheraccon.testnet", "amount": "1000000000000000000000000000"}' \
  --accountId rockettheraccon.testnet \
  --depositYocto 1
```

### 실행

```bash
cd scripts/e2e

# subscription window를 짧게 하려면 run_demo.sh의 시간 상수 수정:
# SUB_START: +60s, SUB_END: +300s (5분), LIVE_END: +600s (10분)

TEE_URL=http://localhost:8080 \
INVESTOR_ACCOUNT=rockettheraccon.testnet \
bash run_demo.sh
```

### 단계별 검증 포인트

| 단계 | 스크립트 내 위치 | 대기 시간 | 검증 |
|---|---|---|---|
| 1. Register foundation | [1/9] | 즉시 | add_foundation 성공 |
| 2. Register policy | [2/9] | 즉시 | policy_id 반환 |
| 3. Advance → Subscribing | [3/9] | ~65초 | status=Subscribing |
| 4. TEE attest | [4/9] | 수 초 | bundle.json + zk_input.json 생성 |
| 5. ZK proof | [5/9] | 수 초 | snarkjs verify OK |
| 6. contribute() | [6/9] | 수 초 | ContributionCreated 이벤트 |
| 7. Advance → Live | [7/10] | **subscription_end 대기** | status=Live |
| 8. settle() | [8/10] | 수 초 | PolicySettled 이벤트 |
| 9. Verify | [9/10] | 즉시 | contribution + policy_totals 조회 |

**주의: 7단계에서 subscription_end까지 대기.** 기본 설정은 2시간+. 빠른 테스트를 원하면 run_demo.sh의 `SUB_END`를 `NOW_NS + 360000000000` (6분)으로 수정.

### claim 테스트 (run_demo.sh에 포함 안 됨 — 수동)

```bash
# settle 완료 후
near call escrow.rockettheraccon.testnet claim \
  '{"policy_id": <POLICY_ID>}' \
  --accountId rockettheraccon.testnet \
  --gas 100000000000000

# 확인
near view escrow.rockettheraccon.testnet get_contribution \
  '{"investor": "rockettheraccon.testnet", "policy_id": <POLICY_ID>}'
# 기대: claim_done: true

# mock-ft 잔액 확인
near view mockft.rockettheraccon.testnet ft_balance_of \
  '{"account_id": "rockettheraccon.testnet"}'
# 기대: balance > 0
```

---

## 위험 구간 + 대응

| 위험 | 발생 시점 | 증상 | 대응 |
|---|---|---|---|
| LLM 응답 파싱 실패 | Phase 2-3, 2-4 | 500 Internal Server Error | retry 3회 내장. 계속 실패 시 NEAR AI API 상태 확인 |
| contribute() gas 부족 | Phase 2-6 | tx 실패, rollback 발생 | `06_contribute.sh`의 `--gas`를 `300000000000000`으로 수정 |
| TEE report fetch 실패 | Phase 2-4 | 502 Bad Gateway | dev signer 모드에서는 mock report. `ALLOW_DEV_TEE_SIGNER=true` 확인 |
| Borsh 불일치 | Phase 1-5 | golden vector 실패 | canonical.py 필드 순서 vs attestation.rs struct 순서 비교 |
| escrow에 mock-ft 없음 | Phase 3 claim | claim tx 실패 | Phase 3 사전 준비의 ft_transfer + storage_deposit 실행 |
| Policy status 불일치 | Phase 2-4 | 400 "must be Subscribing" | advance_status 먼저 호출, subscription_start 지났는지 확인 |
| Nonce 재사용 | Phase 2-6 재시도 | "NonceReused" 에러 | 새 nonce로 05_submit_persona.py 다시 실행 |
| subscription_end 안 지남 | Phase 3-7 | advance_status no-op | 대기하거나 SUB_END 시간 수정 후 재배포 |

---

## 체크리스트 (최종 확인)

### Phase 1 ✅
- [ ] `cargo test --workspace` — 45 passed
- [ ] `uv run pytest -v` — 63 passed
- [ ] `snarkjs groth16 verify` — OK
- [ ] wasm 빌드 5개 성공, 각 < 4MB
- [ ] golden vector Rust↔Python 일치

### Phase 2 ✅
- [ ] 컨트랙트 view 호출 정상
- [ ] TEE healthz 200 OK
- [ ] `/v1/structurize` — criteria 배열 반환
- [ ] `/v1/attest` — bundle + zk_input 생성
- [ ] snarkjs proof 생성 + 검증 OK
- [ ] contribute() tx 성공
- [ ] get_contribution 조회 — amount > 0

### Phase 3 ✅
- [ ] run_demo.sh 전체 통과
- [ ] claim() 성공 — claim_done=true
- [ ] mock-ft 잔액 > 0
- [ ] policy_totals 존재 — ratio_bps, total_matched 확인
