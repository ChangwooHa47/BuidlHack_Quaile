---
id: zk-04-zk-verifier-contract
status: done
sub: BE
layer: contract
depends_on: ["zk-01-circom-circuit", "zk-03-contracts-schema-propagation"]
estimate: 1.5h
demo_step: "Subscribing.Contribution"
---

# zk-verifier 컨트랙트: 온체인 groth16 검증

## Context
클라이언트가 생성한 groth16 proof를 온체인에서 검증하는 NEAR 스마트 컨트랙트.

**MVP 접근**: NEAR의 `alt_bn128` precompile이 아직 불안정하므로, 실제 pairing 검증은 off-chain에서 수행하고, 신뢰된 owner가 검증 결과를 등록하는 패턴. 메인넷 전환 시 온체인 pairing으로 교체.

계획 문서: `docs/superpowers/plans/2026-04-15-zk-eligibility-migration.md` Task 4

## Files
- `contracts/zk-verifier/Cargo.toml` (create)
- `contracts/zk-verifier/src/lib.rs` (create)
- `contracts/zk-verifier/tests/unit.rs` (create)
- `Cargo.toml` (modify — workspace members에 추가)

## Spec

### Cargo.toml
```toml
[package]
name = "zk-verifier"
[dependencies]
near-sdk = { workspace = true }
serde_json = { workspace = true }
[dev-dependencies]
near-sdk = { workspace = true, features = ["unit-testing"] }
```

### 컨트랙트 구조
```rust
pub struct ZkVerifier {
    pub owner: AccountId,
    pub vk_json: String,  // verification_key.json 전체
}
```

### 메서드
```rust
// init
fn new(owner: AccountId, verification_key_json: String) -> Self;

// owner 전용
fn update_vk(&mut self, verification_key_json: String);

// proof 검증 (MVP: 구조 검증 + eligible 체크만, 실제 pairing은 off-chain)
fn verify_proof(&self, proof_json: String, public_inputs_json: String) -> bool;

// off-chain verifier가 검증 결과 등록 (owner 전용)
fn register_verified_proof(&mut self, payload_hash_hex: String, eligible: bool) -> bool;

// view
fn get_verification_key(&self) -> String;
```

### Public inputs 형식
`public_inputs_json`: `["limb0", "limb1", "limb2", "limb3", "eligible"]`
- limb0~3: payload_hash를 4개 64-bit 정수로 분해 (decimal string)
- eligible: "1" (적격) or "0" (부적격)
- `verify_proof`는 eligible=="1"인지만 체크 (MVP)

### 에러 케이스
- `Unauthorized` — owner가 아닌 계정이 `update_vk` / `register_verified_proof` 호출
- `invalid verification key JSON` — 파싱 실패
- `expected 5 public inputs` — 입력 개수 불일치
- `eligible output is not 1` — 부적격 proof 제출

### NEP-297 이벤트
```json
{"standard":"nep297","version":"1.0.0","event":"ProofVerified","data":{"payload_hash":"0x...","eligible":true}}
```

## Acceptance Criteria
- [ ] `cargo build -p zk-verifier` 성공
- [ ] `cargo test -p zk-verifier` 성공
- [ ] `cargo build --target wasm32-unknown-unknown --release -p zk-verifier` 성공
- [ ] workspace `Cargo.toml`에 `contracts/zk-verifier` 멤버 추가됨
- [ ] owner만 `update_vk`, `register_verified_proof` 호출 가능

## Test Cases
1. happy: eligible=1인 proof → `verify_proof` 반환 true
2. fail: eligible=0인 proof → `verify_proof` 반환 false
3. fail: public_inputs 개수 != 5 → false
4. happy: owner가 `register_verified_proof` 호출 → true + 이벤트
5. fail: hacker가 `register_verified_proof` 호출 → panic Unauthorized
6. happy: `update_vk` 후 `get_verification_key` → 새 값
7. fail: hacker가 `update_vk` → panic Unauthorized

## 코드리뷰 체크포인트
이 태스크 완료 후 반드시:
1. wasm 바이너리에 불필요한 serde_json bloat 없는지 확인
2. `register_verified_proof`에서 eligible=false 등록 시도 → 적절히 거부되는지
3. verification_key_json 파싱이 `new()`와 `update_vk()` 양쪽에서 수행되는지

## References
- 계획 문서 Task 4
- snarkjs verification_key.json 형식: `circuits/build/verification_key.json` (Task zk-01 산출물)
- NEAR alt_bn128: https://docs.near.org/build/smart-contracts/security/checklist
