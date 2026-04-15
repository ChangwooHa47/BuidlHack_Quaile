---
id: zk-03-contracts-schema-propagation
status: done
sub: BE
layer: contract
depends_on: ["zk-02-shared-criteria-types"]
estimate: 1h
demo_step: "Subscribing.Contribution"
---

# Contracts: AttestationPayload 스키마 변경 전파

## Context
zk-02에서 `tee-shared`의 `AttestationPayload`가 바뀌면 이를 참조하는 모든 컨트랙트에서 컴파일 에러가 발생한다. 이 태스크는 그 에러를 전부 해결하는 중간 단계.

ZK proof 통합은 zk-05에서 별도로 진행. 여기서는 **컴파일이 되게 만드는 것**이 목표.

계획 문서: `docs/superpowers/plans/2026-04-15-zk-eligibility-migration.md` Task 3

## Files
- `contracts/attestation-verifier/src/lib.rs` (modify)
- `contracts/attestation-verifier/tests/unit.rs` (modify)
- `contracts/ido-escrow/src/subscription.rs` (modify)
- `contracts/ido-escrow/src/external.rs` (modify)
- `contracts/ido-escrow/tests/unit.rs` (modify)

## Spec

### attestation-verifier
- `use tee_shared::{...}` 에서 `EvidenceSummary` import 제거
- `is_eligible()` / `verify()` 내부 로직은 `verdict` 체크이므로 변경 불필요
- unit test의 dummy payload에서 `score`, `evidence_summary` → `criteria_results: CriteriaResults::from_vec(...)` 교체

### ido-escrow
- `subscription.rs`: `EvidenceSummary` import 제거. `AttestationBundle` 사용은 변경 없음
- `external.rs`: `AttestationBundle` 타입 참조는 변경 없음
- unit test: dummy bundle 생성 시 `criteria_results` 사용

### 공통 주의사항
- `payload_version: 2`로 변경
- `CriteriaResults`는 `tee-shared`에서 `contract` feature로 노출되므로 별도 import 없이 사용 가능
- **Borsh 직렬화 변경으로 기존 서명은 호환 불가** — 테스트에서 새 payload 기준으로 서명 재생성 필요

## Acceptance Criteria
- [ ] `cargo build --workspace` 성공
- [ ] `cargo test --workspace` 성공
- [ ] wasm 빌드 성공: `cargo build --target wasm32-unknown-unknown --release -p attestation-verifier`
- [ ] wasm 빌드 성공: `cargo build --target wasm32-unknown-unknown --release -p ido-escrow`
- [ ] 코드에서 `EvidenceSummary` 문자열이 contracts/ 하위에 없음

## Test Cases
1. attestation-verifier: 새 스키마 payload로 verify() → true
2. attestation-verifier: 새 스키마 payload로 is_eligible() → Eligible이면 true
3. ido-escrow: 새 스키마 bundle로 contribute() → 정상 진행 (cross-contract mock)
4. ido-escrow: 기존 score 필드 참조하는 코드 없음 확인

## 코드리뷰 체크포인트
이 태스크 완료 후 반드시:
1. `grep -r "EvidenceSummary" contracts/` → 결과 없음 확인
2. `grep -r "score" contracts/` → attestation 관련 score 참조 없음 확인 (ratio_bps 등 settlement score는 무관)
3. wasm 바이너리 크기가 비정상적으로 커지지 않았는지 확인

## References
- 계획 문서 Task 3
- attestation-verifier: `contracts/attestation-verifier/src/lib.rs`
- ido-escrow subscription: `contracts/ido-escrow/src/subscription.rs`
