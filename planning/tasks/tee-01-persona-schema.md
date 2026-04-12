---
id: tee-01-persona-schema
status: todo
sub: TEE
layer: tee
depends_on: []
estimate: 1.5h
demo_step: "Subscribing.Subscription"
---

# Persona / Policy / Attestation 공유 스키마 (`tee/shared` crate)

## Context
TEE 인프라와 NEAR 스마트 컨트랙트가 **같은 타입**으로 말해야 payload canonicalization mismatch가 발생하지 않는다.
`tee/shared`는 Rust workspace crate로, contracts와 tee/inference 양쪽에서 참조된다.

PRD NFR-SEC-5 (canonicalization), FR-TEE-8 (Borsh Keccak hash)
ERD §3 전체 (이 태스크가 ERD를 코드화한다)

## Files
- `tee/shared/Cargo.toml`
- `tee/shared/src/lib.rs`
- `tee/shared/src/policy.rs`
- `tee/shared/src/persona.rs`
- `tee/shared/src/signal.rs`
- `tee/shared/src/attestation.rs`
- `tee/shared/src/canonical.rs`       — borsh hash utility
- `tee/shared/tests/roundtrip.rs`

## Spec

### workspace 등록
`Cargo.toml` (workspace root):
```toml
[workspace]
members = [
    "contracts/policy-registry",
    "contracts/attestation-verifier",
    "contracts/ido-escrow",
    "tee/shared",
]
```

### Crate 기능 플래그
```toml
[features]
default = ["std"]
std = []
contract = ["near-sdk"]
```

- `contract` feature: near-sdk와 `env::keccak256_array` 사용
- `std` (default): 일반 Rust 환경용 (tee/inference에서 사용)

### 타입 정의
ERD §3의 전체 타입을 그대로 구현. 핵심 타입:

```rust
// policy.rs
pub type PolicyId = u64;
pub type Timestamp = u64;

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct Policy { /* ERD §3.2 */ }

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum PolicyStatus { Upcoming, Subscribing, Live, Closed }

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct SaleConfig { /* ERD §3.2 */ }

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum PaymentToken { Near, Nep141(AccountId) }

// persona.rs (TEE only, 컨트랙트에는 import되지 않음)
pub struct Persona { /* ERD §3.3 */ }
pub struct NearWalletProof { /* ERD §3.3 */ }
pub struct EvmWalletProof { /* ERD §3.3 */ }

// attestation.rs
pub type Hash32 = [u8; 32];
pub type Nonce = [u8; 32];

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct AttestationPayload { /* ERD §3.6 + contract-02와 동일 */ }

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum Verdict { Eligible, Ineligible }

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct EvidenceSummary { /* ERD §3.6 */ }

// v2: on-chain struct — tee_report 제거
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct AttestationBundle {
    pub payload: AttestationPayload,
    pub payload_hash: Hash32,
    pub signature_rs: [u8; 64],
    pub signature_v: u8,
    pub signing_key_id: u32,
}

// v2: off-chain wrapper — TEE → client 전송 시에만 사용
// 컨트랙트는 이 struct를 import하지 않음
#[cfg(not(feature = "contract"))]
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AttestationBundleWithReport {
    pub bundle: AttestationBundle,
    pub tee_report: Vec<u8>,  // intel_quote + nvidia_payload JSON
}
```

### canonical.rs — Payload hashing
```rust
use borsh::BorshSerialize;

#[cfg(feature = "contract")]
pub fn keccak256(bytes: &[u8]) -> [u8; 32] {
    near_sdk::env::keccak256_array(bytes)
}

#[cfg(not(feature = "contract"))]
pub fn keccak256(bytes: &[u8]) -> [u8; 32] {
    use sha3::{Digest, Keccak256};
    let mut h = Keccak256::new();
    h.update(bytes);
    h.finalize().into()
}

pub fn payload_hash(p: &AttestationPayload) -> [u8; 32] {
    let bytes = borsh::to_vec(p).expect("borsh serialize");
    keccak256(&bytes)
}
```

## Acceptance Criteria
- [ ] `cargo build --workspace` 성공 (contracts + tee/shared)
- [ ] `cargo build -p tee-shared --no-default-features --features contract` 성공 (wasm 가능)
- [ ] `cargo test -p tee-shared` 성공
- [ ] Unit test: Policy/Persona/AttestationPayload Borsh roundtrip
- [ ] Unit test: `payload_hash`가 contract feature와 std feature에서 동일한 해시 반환 (빌드 2벌 비교)
- [ ] Unit test: ERD §7 invariant 최소 3개 assert 함수로 표현

## Test Cases
1. happy: Policy roundtrip (Borsh 직렬화 → 역직렬화 동일)
2. happy: Persona roundtrip
3. happy: AttestationPayload roundtrip + payload_hash 일치
4. edge: 빈 `rationale` 허용? → 허용 (단, 컨트랙트 side는 max length 제한 권장)
5. edge: `signature_v = 2` → (컨트랙트가 거부하지만 struct 직렬화는 OK)
6. edge: Borsh 역직렬화 시 알 수 없는 variant → 에러

## References
- `planning/ERD.md` §3
- `planning/PRD.md` NFR-SEC-5
- `planning/research/near-ai-tee-notes.md` §4 (secp256k1)
- Borsh spec: https://github.com/near/borsh

## Open Questions
1. `Persona`를 컨트랙트에 import할 필요는 없음 → contract feature에서 제외할지? → 제안: persona.rs 전체를 `#[cfg(not(feature = "contract"))]`로 가리기
2. `near_sdk::AccountId`는 contract feature 있을 때만 존재. 스탠드얼론에서는 `String` 또는 `near_account_id::AccountId` 크레이트 사용
