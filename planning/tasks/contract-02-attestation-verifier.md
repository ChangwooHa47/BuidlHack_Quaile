---
id: contract-02-attestation-verifier
status: done
sub: BE
layer: contract
depends_on: [infra-01-monorepo-init, tee-01-persona-schema]
estimate: 2h
demo_step: "Subscribing.Review → Contribution"
---

# Attestation Verifier 컨트랙트

## Context
NEAR AI Cloud TEE가 서명한 AttestationBundle의 **secp256k1 ECDSA 서명**을 온체인에서 검증한다.

**중요**: 리서치(`planning/research/near-ai-tee-notes.md` §4)에서 NEAR AI Cloud는 Ethereum 스타일 **secp256k1** 서명을 사용한다는 것을 확인. Ed25519가 아니다. 따라서 `env::ecrecover`를 쓴다.

ONE_PAGER §6 데모 [3] TEE 서명 → [4] 온체인 검증에 대응.
PRD FR-AV-1 ~ FR-AV-6 구현.

## Files
- `contracts/attestation-verifier/Cargo.toml`
- `contracts/attestation-verifier/src/lib.rs`
- `contracts/attestation-verifier/src/crypto.rs`  — ecrecover wrapper + address derivation
- `contracts/attestation-verifier/src/types.rs`   — (or reexport from `tee/shared`)
- `contracts/attestation-verifier/src/errors.rs`
- `contracts/attestation-verifier/tests/unit.rs`
- `contracts/attestation-verifier/tests/integration.rs` — workspaces-tests

## Spec

### 타입 (재사용: `tee/shared` crate)
```rust
use near_sdk::{AccountId, near_bindgen, env, BorshStorageKey, PanicOnDefault};
use near_sdk::borsh::{self, BorshSerialize, BorshDeserialize};
use near_sdk::collections::LookupMap;

pub type KeyId = u32;
pub type EthAddress = [u8; 20];
pub type Hash32 = [u8; 32];
pub type PolicyId = u64;

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct AttestationPayload {
    pub subject: AccountId,
    pub policy_id: PolicyId,
    pub verdict: Verdict,
    pub score: u16,
    pub issued_at: u64,
    pub expires_at: u64,
    pub nonce: [u8; 32],
    pub evidence_summary: EvidenceSummary,
    pub payload_version: u8,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub enum Verdict { Eligible, Ineligible }

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct EvidenceSummary {
    pub wallet_count_near: u8,
    pub wallet_count_evm: u8,
    pub avg_holding_days: u32,
    pub total_dao_votes: u32,
    pub github_included: bool,
    pub rationale: String,
}

// v2: tee_report 제거 (off-chain 전송만, 컨트랙트 검증 없음)
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct AttestationBundle {
    pub payload: AttestationPayload,
    pub payload_hash: Hash32,     // keccak256(borsh(payload))
    pub signature_rs: [u8; 64],   // r(32) || s(32)
    pub signature_v: u8,          // recovery id, 0 or 1 (클라이언트 정규화)
    pub signing_key_id: KeyId,    // which registered key signed
}
```

### 컨트랙트 상태
```rust
#[near_bindgen]
#[derive(BorshSerialize, BorshDeserialize, PanicOnDefault)]
pub struct AttestationVerifier {
    pub owner: AccountId,
    pub signing_addresses: LookupMap<KeyId, EthAddress>,
    pub current_key_id: KeyId,
    pub retired_grace_until: LookupMap<KeyId, u64>, // ns timestamp; 이전 키를 grace까지 허용
}

#[derive(BorshStorageKey, BorshSerialize)]
enum StorageKey {
    SigningAddresses,
    RetiredGrace,
}
```

### 메서드
```rust
#[near_bindgen]
impl AttestationVerifier {
    #[init]
    pub fn new(owner: AccountId, initial_signing_address: EthAddress) -> Self;

    /// Owner만 호출 가능. 키 로테이션.
    /// - 새 key_id 발급
    /// - current_key_id 갱신
    /// - 이전 key는 retired_grace_until[prev] = now + grace_ns 로 등록
    pub fn rotate_key(&mut self, new_address: EthAddress, grace_seconds: u64) -> KeyId;

    /// 서명 검증:
    ///  1. `keccak256(borsh(payload)) == payload_hash`
    ///  2. `ecrecover(payload_hash, signature_rs, signature_v, true)` → 64-byte pubkey
    ///  3. `keccak256(pubkey)[12..32] == signing_addresses[signing_key_id]`
    ///  4. `signing_key_id == current_key_id` OR `env::block_timestamp() <= retired_grace_until[signing_key_id]`
    pub fn verify(&self, bundle: AttestationBundle) -> bool;

    /// verify() + payload.verdict == Eligible + payload.expires_at > block_timestamp
    pub fn is_eligible(&self, bundle: AttestationBundle) -> bool;

    /// 등록된 주소 조회
    pub fn get_signing_address(&self, key_id: KeyId) -> Option<EthAddress>;
    pub fn current_signing_address(&self) -> EthAddress;
}
```

### crypto.rs 구현 (의사코드)
```rust
use near_sdk::env;

pub fn keccak256(input: &[u8]) -> [u8; 32] {
    env::keccak256_array(input)
}

pub fn ecrecover_address(
    msg_hash: &[u8; 32],
    sig_rs: &[u8; 64],
    v: u8,
) -> Option<[u8; 20]> {
    // NEAR SDK: env::ecrecover(hash, sig, v, malleability_flag) -> Option<[u8;64]>
    let pubkey = env::ecrecover(msg_hash, sig_rs, v, true)?;
    // Ethereum address = last 20 bytes of keccak256(uncompressed pubkey without 0x04 prefix)
    let hash = env::keccak256_array(&pubkey);
    let mut addr = [0u8; 20];
    addr.copy_from_slice(&hash[12..32]);
    Some(addr)
}

pub fn borsh_hash<T: BorshSerialize>(value: &T) -> [u8; 32] {
    let bytes = value.try_to_vec().expect("borsh serialize");
    env::keccak256_array(&bytes)
}
```

### 에러
```rust
pub enum VerifyError {
    PayloadHashMismatch,
    EcrecoverFailed,
    SignerAddressMismatch,
    KeyNotRegistered(KeyId),
    KeyRetiredNoGrace(KeyId),
    Expired,
    Unauthorized,           // non-owner rotate_key
    InvalidVRecoveryId(u8), // v 값이 0/1이 아님
}
```

에러는 `near_sdk::require!` 또는 `env::panic_str`로 raise.

## Acceptance Criteria
- [ ] `cargo build --target wasm32-unknown-unknown --release` 성공
- [ ] Unit test: 유효 bundle 검증 성공 (known secp256k1 test vector)
- [ ] Unit test: payload 1바이트 변조 → PayloadHashMismatch
- [ ] Unit test: signature r 1바이트 변조 → recovered address 불일치 → SignerAddressMismatch
- [ ] Unit test: v가 0/1이 아닌 값 → InvalidVRecoveryId
- [ ] Unit test: non-owner가 rotate_key 호출 → Unauthorized
- [ ] Unit test: rotate_key 후 이전 키로 서명된 bundle이 grace 기간 내에는 verify 통과, 이후엔 거부
- [ ] Unit test: expires_at 과거 → is_eligible false
- [ ] Unit test: verdict=Ineligible → is_eligible false, verify는 true
- [ ] Integration test (workspaces-tests): 외부 서명(Python eth-account로 생성)으로 bundle 만들어 on-chain verify 성공

## Test Cases
1. **happy**: Python eth-account로 keccak256(borsh(payload)) 서명 → bundle 제출 → verify == true, is_eligible == true
2. **edge**: payload.score 1 변경 → payload_hash mismatch
3. **edge**: signature_v = 2 → InvalidVRecoveryId
4. **edge**: signature_rs[0] ^= 0x01 → ecrecover가 다른 address 복원 → SignerAddressMismatch
5. **edge**: rotate_key 직후 이전 키 서명 + block_timestamp < grace → 통과
6. **edge**: rotate_key 이후 grace 초과 + 이전 키 서명 → KeyRetiredNoGrace
7. **edge**: verdict=Ineligible → verify true, is_eligible false
8. **edge**: issued_at > expires_at (잘못 생성) → 현재 block_timestamp > expires_at이면 Expired
9. **edge**: payload.subject != predecessor_account_id (이건 ido-escrow에서 체크, 여기선 검증하지 않음 — 주석으로 명시)
10. **edge**: signing_key_id가 등록되지 않음 → KeyNotRegistered

## Integration test 도구
- `workspaces-tests` (Rust) + Python 보조 스크립트로 test vector 생성
- `scripts/gen_test_vector.py`: borsh 직렬화 + keccak + eth_account.sign_message_hash
- 생성된 vector는 `tests/fixtures/*.json`에 저장 (CI 재현성)

## References
- NEAR SDK `env::ecrecover`: https://docs.rs/near-sdk/latest/near_sdk/env/fn.ecrecover.html
- NEAR SDK `env::keccak256`: https://docs.rs/near-sdk/latest/near_sdk/env/fn.keccak256.html
- Ethereum address from pubkey: keccak256(uncompressed_pubkey)[12..]
- eth-account Python (test vector 생성): https://eth-account.readthedocs.io/
- `planning/research/near-ai-tee-notes.md` §4

## Open Questions (루프에서 해결)
1. ~~TEE 서명 알고리즘~~ → **secp256k1 ECDSA 확정** (리서치 §4)
2. **TEE 공개키 신뢰 방법**: MVP = owner 수동 등록. 로드맵 = 온체인 TDX verify
3. **payload_version**: 현재 1. bump 시 호환성 정책 → MVP는 최신 버전만 허용 (옛 버전 거부)
4. **signature_v 정규화**: eth-account는 27/28을 줄 수 있음 → 컨트랙트 진입 전 `v -= 27`를 한다는 규칙을 명시하거나 내부에서 처리
5. **double-spend 방지**: 동일 payload_hash가 여러 contribute()에 재사용 가능한가? → 아니, `ido-escrow`에서 `used_nonces`로 차단 (여기서 아닌 거기서)

## 결정 기록
- **서명 알고리즘**: secp256k1 ECDSA (NEAR AI Cloud와 호환) ← 2026-04-12 리서치
- **payload 직렬화**: Borsh (컨트랙트와 TEE가 `tee/shared` crate 공유)
- **키 저장**: `signing_addresses: LookupMap<KeyId, [u8;20]>` (pubkey 전체가 아닌 address만)
- **grace period**: 키 로테이션 시 이전 키를 일정 시간 허용 (in-flight attestation 보호)
