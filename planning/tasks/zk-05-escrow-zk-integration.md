---
id: zk-05-escrow-zk-integration
status: done
sub: BE
layer: contract
depends_on: ["zk-03-contracts-schema-propagation", "zk-04-zk-verifier-contract"]
estimate: 1.5h
demo_step: "Subscribing.Contribution"
---

# ido-escrow: contribute()를 ZK proof 기반으로 전환

## Context
기존 `contribute()`는 `attestation-verifier.is_eligible(bundle)`로 TEE 서명 + verdict를 검증했다. 이제 TEE 서명 검증(verify) + ZK proof 검증(verify_proof) 이중 구조로 전환.

플로우: `contribute()` → `get_policy` → `attestation-verifier.verify(bundle)` → `zk-verifier.verify_proof(proof, public_inputs)` → 확정

계획 문서: `docs/superpowers/plans/2026-04-15-zk-eligibility-migration.md` Task 5

## Files
- `contracts/ido-escrow/src/lib.rs` (modify — `zk_verifier` 필드 추가)
- `contracts/ido-escrow/src/subscription.rs` (modify — contribute 시그니처 + Promise chain 변경)
- `contracts/ido-escrow/src/external.rs` (modify — ext_zk_verifier 추가, 콜백 시그니처 변경)
- `contracts/ido-escrow/tests/unit.rs` (modify)

## Spec

### lib.rs 변경
```rust
pub struct IdoEscrow {
    // 기존 필드 유지 +
    pub zk_verifier: AccountId,  // 신규
}

pub fn new(
    owner: AccountId,
    policy_registry: AccountId,
    attestation_verifier: AccountId,
    zk_verifier: AccountId,       // 신규 파라미터
) -> Self { ... }
```

### subscription.rs 변경

**contribute() 시그니처:**
```rust
pub fn contribute(
    &mut self,
    policy_id: PolicyId,
    bundle: AttestationBundle,
    zk_proof_json: String,              // 신규
    zk_public_inputs_json: String,      // 신규
) -> Promise
```

**Promise chain 변경:**
기존: `get_policy → on_get_policy → is_eligible → on_is_eligible`
변경: `get_policy → on_get_policy → verify (서명만) → on_verify_signature → verify_proof (ZK) → on_zk_verified`

### external.rs 변경

**추가:**
```rust
#[ext_contract(ext_zk_verifier)]
pub trait ZkVerifierExt {
    fn verify_proof(&self, proof_json: String, public_inputs_json: String) -> bool;
}
```

**콜백 변경:**
- `on_get_policy` — `zk_proof_json`, `zk_public_inputs_json` 파라미터 추가
- `on_is_eligible` → `on_verify_signature`로 리네임 (서명 검증만 담당)
- `on_zk_verified` 신규 — ZK proof 검증 결과 콜백

### 검증 흐름 상세

```
contribute()
  ├─ PHASE A: sync validation (기존과 동일)
  ├─ PHASE B: optimistic state write (기존과 동일)
  └─ PHASE C: Promise chain
       1. ext_policy_registry.get_policy(policy_id)
          → on_get_policy(policy_id, investor, bundle, zk_proof_json, zk_public_inputs_json)
       2. ext_verifier.verify(bundle)  // TEE 서명 검증 (is_eligible 대신 verify만)
          → on_verify_signature(policy_id, investor, sub_end, hash, nonce, zk_proof_json, zk_public_inputs_json)
       3. ext_zk_verifier.verify_proof(zk_proof_json, zk_public_inputs_json)  // ZK 검증
          → on_zk_verified(policy_id, investor, sub_end, hash, nonce)
```

### 에러 처리
- TEE 서명 검증 실패 → rollback + refund (기존과 동일)
- ZK proof 검증 실패 → rollback + refund (신규)
- 실패 이벤트에 `"ZkProofFailed"` reason 추가

### Gas 배분
- `GAS_VIEW`: 30 TGas (기존)
- `GAS_CALLBACK_POLICY`: 90 TGas (기존 60 → 증가, ZK 검증 체인 추가분)
- `GAS_CALLBACK_SIGNATURE`: 60 TGas (신규, verify 콜백)
- `GAS_CALLBACK_ZK`: 30 TGas (신규, verify_proof 콜백)

## Acceptance Criteria
- [ ] `cargo build -p ido-escrow` 성공
- [ ] `cargo test -p ido-escrow` 성공
- [ ] `cargo build --target wasm32-unknown-unknown --release -p ido-escrow` 성공
- [ ] `contribute()` 시그니처에 `zk_proof_json`, `zk_public_inputs_json` 포함
- [ ] Promise chain이 verify → verify_proof 순서로 실행
- [ ] ZK proof 실패 시 rollback + refund 동작

## Test Cases
1. happy: 유효 bundle + 유효 ZK proof → contribution 확정
2. fail: 유효 bundle + 무효 ZK proof → rollback + refund
3. fail: 무효 bundle (서명) + 유효 ZK proof → rollback + refund
4. fail: 만료된 attestation → 기존처럼 sync validation에서 거부
5. fail: nonce 재사용 → 기존처럼 거부
6. edge: ZK verifier cross-contract 호출 실패 (PromiseError) → rollback + refund

## 코드리뷰 체크포인트
이 태스크 완료 후 반드시:
1. `on_is_eligible` 함수가 완전히 제거되었거나 `on_verify_signature`로 리네임되었는지
2. Gas 배분이 전체 트랜잭션에서 충분한지 (300 TGas 제한)
3. rollback_contribution이 ZK 실패 경로에서도 정상 호출되는지
4. external.rs의 `ext_verifier` trait에서 `is_eligible` → `verify`로 변경되었는지

## References
- 계획 문서 Task 5
- 기존 subscription.rs: `contracts/ido-escrow/src/subscription.rs`
- 기존 external.rs: `contracts/ido-escrow/src/external.rs`
