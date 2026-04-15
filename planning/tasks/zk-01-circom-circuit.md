---
id: zk-01-circom-circuit
status: done
sub: INFRA
layer: zk
depends_on: []
estimate: 1h
demo_step: "Subscribing.Contribution"
---

# Eligibility circom circuit + trusted setup

## Context
TEE가 점수 대신 항목별 pass/fail을 뱉고, 클라이언트가 ZK proof로 "전부 pass = 적격"만 온체인에 올리는 아키텍처 전환의 기반.

circom 2.x + groth16(BN254)으로 MAX_CRITERIA=10인 all-pass 검증 circuit을 작성하고, trusted setup까지 완료한다.

계획 문서: `docs/superpowers/plans/2026-04-15-zk-eligibility-migration.md` Task 1

## Files
- `circuits/eligibility.circom` (create)
- `circuits/scripts/setup.sh` (create)
- `circuits/input_example.json` (create)
- `circuits/input_fail.json` (create)
- `circuits/build/` (생성물 — gitignore 대상)
- `.gitignore` (modify — `circuits/build/` 추가)

## Spec

### Circuit 설계
- **Public inputs**: `payload_hash_limbs[4]` — keccak256 해시를 4개 64-bit limb으로 분해
- **Private inputs**: `criteria[10]` (각 0 or 1), `criteria_count` (1~10)
- **Output**: `eligible` — active criteria가 전부 1이면 1, 아니면 0
- **Active criteria**: index < criteria_count인 항목만 검사, 나머지는 패딩(항상 1)

### 핵심 제약
1. `criteria[i] * (1 - criteria[i]) === 0` — 각 원소는 반드시 bool
2. `mask[i] = 1 if i < criteria_count` — LessThan comparator로 구현
3. `effective[i] = mask[i] ? criteria[i] : 1` — inactive는 자동 pass
4. `eligible = product(effective[0..MAX_CRITERIA])` — 전부 1이어야 1

### Trusted Setup
- Powers of Tau: `bn128`, `2^12` (circuit 작으므로 충분)
- Phase 2: circuit-specific `.zkey` 생성
- 산출물: `verification_key.json`, `eligibility_final.zkey`, `eligibility.wasm`

## Acceptance Criteria
- [ ] `circom eligibility.circom --r1cs --wasm --sym` 컴파일 성공
- [ ] `setup.sh` 실행 시 `build/verification_key.json`, `build/eligibility_final.zkey` 생성
- [ ] 전부 pass 입력 → proof 생성 → `snarkjs groth16 verify` → OK, eligible=1
- [ ] 일부 fail 입력 → proof 생성 → eligible=0 확인
- [ ] `.gitignore`에 `circuits/build/` 추가됨

## Test Cases
1. happy: 6개 기준 전부 pass (나머지 4개 패딩) → eligible=1
2. fail: 6개 기준 중 1개 fail → eligible=0
3. edge: criteria_count=1, criteria[0]=1 → eligible=1
4. edge: criteria_count=10, 전부 pass → eligible=1

## References
- circom docs: https://docs.circom.io/
- snarkjs: https://github.com/iden3/snarkjs
- 계획 문서 Task 1: `docs/superpowers/plans/2026-04-15-zk-eligibility-migration.md`
