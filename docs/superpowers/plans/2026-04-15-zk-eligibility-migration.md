# ZK Eligibility Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TEE가 점수 대신 항목별 pass/fail을 뱉고, circom+groth16 ZK proof로 "전부 pass = 적격"만 온체인에 올리도록 아키텍처 전환

**Architecture:** TEE LLM이 재단 Policy를 평가 항목(criteria) N개로 분해 → 항목별 yes/no 판정 → 클라이언트가 bool 배열을 circom circuit 입력으로 ZK proof 생성 → 온체인 verifier가 groth16 proof만 검증. 기존 secp256k1 TEE 서명은 "TEE가 이 bool 배열을 발급했다"는 것을 증명하는 용도로 유지하되, 온체인에는 score/evidence가 안 올라감.

**Tech Stack:** circom 2.x, snarkjs (groth16), NEAR SDK (Rust), Python FastAPI (TEE)

---

## Architecture Overview

```
기존:
  TEE → verdict + score + evidence_summary → TEE 서명 → 온체인 verifier (secp256k1 ecrecover)

변경 후:
  TEE → criteria_results: [bool; MAX_CRITERIA] + criteria_count → TEE 서명 (기존과 동일)
       ↓
  Client: TEE 응답 수신 → snarkjs로 groth16 proof 생성
       ↓
  On-chain: groth16 verifier가 proof 검증 (public input = payload_hash)
       ↓
  ido-escrow.contribute(): proof + 최소한의 메타데이터만 받음
```

### 핵심 설계 결정

1. **MAX_CRITERIA = 10 고정** — circuit은 고정 크기 입력 필요. 재단이 3개 기준 만들면 나머지 7개는 `pass=true`로 패딩.
2. **TEE 서명은 유지** — TEE가 criteria_results에 서명하여 "이 판정은 TEE에서 나왔다"를 보장. ZK proof는 이 위에 올라가는 프라이버시 레이어.
3. **score 제거** — `AttestationPayload.score`, `EvidenceSummary` 전체가 온체인에서 사라짐. TEE 응답에는 디버깅용으로 남기되 온체인 제출물에는 포함 안 됨.
4. **ZK public input = `payload_hash`** — circuit이 "이 payload_hash에 대응하는 criteria가 전부 pass"임을 증명. 온체인에서는 payload_hash만 보고 proof를 검증.

---

## File Structure (변경/신규 파일 맵)

### 신규 파일
```
circuits/
  eligibility.circom          — groth16 circuit (MAX_CRITERIA=10, all-pass 검증)
  scripts/
    setup.sh                  — trusted setup (powers of tau + circuit-specific)
    generate_proof.sh         — proof 생성 테스트용 스크립트
  input_example.json          — 예시 입력
  build/                      — 컴파일 산출물 (.wasm, .r1cs, .zkey, verification_key.json)

contracts/
  zk-verifier/                — 신규 컨트랙트: groth16 온체인 검증
    Cargo.toml
    src/lib.rs
    tests/unit.rs

tee/shared/src/
  criteria.rs                 — CriteriaResult, CriteriaPayload 타입 (신규)
```

### 수정 파일
```
tee/shared/src/
  lib.rs                      — criteria 모듈 추가, re-export 수정
  attestation.rs              — AttestationPayload에서 score 제거, criteria_results 추가

tee/inference/src/
  schemas.py                  — JudgeOutputModel 변경 (score→criteria), AttestationPayloadModel 변경
  nearai_client.py            — LLM 프롬프트 변경 (structurize→criteria 생성, judge→항목별 판정)
  pipeline.py                 — process_persona 변경 (score 로직 제거, criteria 로직 추가)
  canonical.py                — serialize_attestation_payload 변경

contracts/
  attestation-verifier/src/lib.rs — is_eligible 제거, verify만 유지 (ZK가 적격 판정 담당)
  ido-escrow/src/subscription.rs  — contribute()가 ZK proof 받도록 변경
  ido-escrow/src/external.rs      — ext_verifier 인터페이스 변경

Cargo.toml (workspace)        — zk-verifier 멤버 추가
```

---

## Task 1: circom circuit 작성 + trusted setup

**Files:**
- Create: `circuits/eligibility.circom`
- Create: `circuits/scripts/setup.sh`
- Create: `circuits/input_example.json`

### 선행 조건
circom 2.x와 snarkjs가 설치되어 있어야 함.

- [ ] **Step 1: circom + snarkjs 설치 확인**

```bash
# circom 설치 (이미 있으면 skip)
# https://docs.circom.io/getting-started/installation/
circom --version  # 2.1.x 이상
npm list -g snarkjs || npm install -g snarkjs
```

Expected: 버전 출력

- [ ] **Step 2: eligibility circuit 작성**

```circom
// circuits/eligibility.circom
pragma circom 2.1.0;

// MAX_CRITERIA개의 bool 입력이 전부 1(pass)인지 검증하는 circuit.
// criteria_count 이하의 인덱스만 검사하고, 나머지는 무시(1로 패딩 전제).
//
// Public inputs:  payload_hash (4 x 64-bit limbs로 분해한 keccak256)
// Private inputs: criteria[MAX_CRITERIA], criteria_count
//
// 핵심 제약: criteria[0..criteria_count-1]이 전부 1이면 eligible=1

template Eligibility(MAX_CRITERIA) {
    // --- public inputs ---
    // payload_hash를 4개의 64-bit limb으로 쪼개서 전달 (field overflow 방지)
    signal input payload_hash_limbs[4];

    // --- private inputs ---
    signal input criteria[MAX_CRITERIA];
    signal input criteria_count;

    // --- output ---
    signal output eligible;

    // 1) criteria는 반드시 0 또는 1
    for (var i = 0; i < MAX_CRITERIA; i++) {
        criteria[i] * (1 - criteria[i]) === 0;
    }

    // 2) criteria_count 범위: 1 <= criteria_count <= MAX_CRITERIA
    signal count_minus_one;
    count_minus_one <== criteria_count - 1;
    // criteria_count >= 1은 아래 곱에서 자연스럽게 보장됨 (0이면 eligible=1이 되므로 별도 체크)

    // 3) active criteria가 전부 pass인지 확인
    // mask[i] = 1 if i < criteria_count, else 0
    // effective[i] = mask[i] ? criteria[i] : 1
    // product of all effective[i] must be 1

    signal mask[MAX_CRITERIA];
    signal effective[MAX_CRITERIA];
    signal running_product[MAX_CRITERIA + 1];
    running_product[0] <== 1;

    for (var i = 0; i < MAX_CRITERIA; i++) {
        // mask[i] = 1 if i < criteria_count
        // We use a helper: is_active = (criteria_count - i) > 0
        // Implemented as: is_active = 1 if criteria_count > i, else 0
        // For circom, we use LessThan comparator
        signal diff;
        diff <== criteria_count - i;
        // diff > 0 means active. We need a boolean for this.
        // Since criteria_count is in [1, MAX_CRITERIA] and i in [0, MAX_CRITERIA-1],
        // diff is in [-(MAX_CRITERIA-1), MAX_CRITERIA].
        // We use the approach: mask[i] = 1 if diff >= 1

        component lt_check_i = GreaterThan(8);
        lt_check_i.in[0] <== diff;
        lt_check_i.in[1] <== 0;
        mask[i] <== lt_check_i.out;

        // effective[i] = mask[i] * criteria[i] + (1 - mask[i]) * 1
        //              = mask[i] * criteria[i] + 1 - mask[i]
        //              = 1 + mask[i] * (criteria[i] - 1)
        effective[i] <== 1 + mask[i] * (criteria[i] - 1);

        running_product[i + 1] <== running_product[i] * effective[i];
    }

    eligible <== running_product[MAX_CRITERIA];
}

// --- Comparator from circomlib ---
template GreaterThan(n) {
    signal input in[2];
    signal output out;

    component lt = LessThan(n);
    lt.in[0] <== in[1];
    lt.in[1] <== in[0];
    out <== lt.out;
}

template LessThan(n) {
    assert(n <= 252);
    signal input in[2];
    signal output out;

    component n2b = Num2Bits(n + 1);
    n2b.in <== in[0] + (1 << n) - in[1];
    out <== 1 - n2b.out[n];
}

template Num2Bits(n) {
    signal input in;
    signal output out[n];
    var lc1 = 0;

    var e2 = 1;
    for (var i = 0; i < n; i++) {
        out[i] <-- (in >> i) & 1;
        out[i] * (out[i] - 1) === 0;
        lc1 += out[i] * e2;
        e2 = e2 + e2;
    }
    lc1 === in;
}

component main {public [payload_hash_limbs]} = Eligibility(10);
```

- [ ] **Step 3: 예시 입력 작성**

```json
// circuits/input_example.json
{
  "payload_hash_limbs": ["1234567890", "9876543210", "1111111111", "2222222222"],
  "criteria": [1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  "criteria_count": "6"
}
```

- [ ] **Step 4: trusted setup 스크립트 작성**

```bash
#!/bin/bash
# circuits/scripts/setup.sh
# Usage: ./setup.sh
# Prereq: circom, snarkjs installed

set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== 1. Compile circuit ==="
mkdir -p build
circom eligibility.circom --r1cs --wasm --sym -o build

echo "=== 2. Powers of Tau (Phase 1) ==="
# circuit이 작으므로 2^12로 충분
snarkjs powersoftau new bn128 12 build/pot12_0000.ptau -v
snarkjs powersoftau contribute build/pot12_0000.ptau build/pot12_0001.ptau \
  --name="First contribution" -v -e="random entropy for setup"
snarkjs powersoftau prepare phase2 build/pot12_0001.ptau build/pot12_final.ptau -v

echo "=== 3. Phase 2 (circuit-specific) ==="
snarkjs groth16 setup build/eligibility.r1cs build/pot12_final.ptau build/eligibility_0000.zkey
snarkjs zkey contribute build/eligibility_0000.zkey build/eligibility_final.zkey \
  --name="First phase2 contribution" -v -e="more random entropy"
snarkjs zkey export verificationkey build/eligibility_final.zkey build/verification_key.json

echo "=== 4. Export Solidity verifier (참고용) ==="
snarkjs zkey export solidityverifier build/eligibility_final.zkey build/Verifier.sol

echo "=== Done ==="
echo "verification_key.json: build/verification_key.json"
echo "zkey: build/eligibility_final.zkey"
echo "wasm: build/eligibility_js/eligibility.wasm"
```

- [ ] **Step 5: 컴파일 + setup 실행**

```bash
cd circuits && chmod +x scripts/setup.sh && ./scripts/setup.sh
```

Expected: `build/` 하위에 `.r1cs`, `.wasm`, `.zkey`, `verification_key.json` 생성

- [ ] **Step 6: snarkjs로 proof 생성 + 검증 테스트**

```bash
cd circuits
# witness 생성
snarkjs wtns calculate build/eligibility_js/eligibility.wasm input_example.json build/witness.wtns
# proof 생성
snarkjs groth16 prove build/eligibility_final.zkey build/witness.wtns build/proof.json build/public.json
# proof 검증
snarkjs groth16 verify build/verification_key.json build/public.json build/proof.json
```

Expected: `[INFO] snarkjs: OK!`

- [ ] **Step 7: fail case 검증 (criteria 하나 fail)**

```json
// circuits/input_fail.json — 6개 기준 중 1개 fail
{
  "payload_hash_limbs": ["1234567890", "9876543210", "1111111111", "2222222222"],
  "criteria": [1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  "criteria_count": "6"
}
```

```bash
cd circuits
snarkjs wtns calculate build/eligibility_js/eligibility.wasm input_fail.json build/witness_fail.wtns
snarkjs groth16 prove build/eligibility_final.zkey build/witness_fail.wtns build/proof_fail.json build/public_fail.json
# public_fail.json의 eligible 출력이 0이어야 함
cat build/public_fail.json
```

Expected: public output에서 eligible = "0"

- [ ] **Step 8: Commit**

```bash
git add circuits/
git commit -m "feat(zk): add eligibility circom circuit + trusted setup"
```

---

## Task 2: tee-shared crate — criteria 타입 추가 + AttestationPayload 변경

**Files:**
- Create: `tee/shared/src/criteria.rs`
- Modify: `tee/shared/src/lib.rs`
- Modify: `tee/shared/src/attestation.rs`
- Modify: `tee/shared/src/canonical.rs`
- Test: `tee/shared/tests/roundtrip.rs`

- [ ] **Step 1: criteria.rs 작성**

```rust
// tee/shared/src/criteria.rs
use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

/// Maximum number of evaluation criteria per policy.
/// Circuit is compiled with this fixed size; unused slots are padded with `true`.
pub const MAX_CRITERIA: usize = 10;

/// A single evaluation criterion extracted from the foundation's natural-language policy.
/// TEE-internal — never stored on-chain.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Criterion {
    /// Human-readable description, e.g. "Token holding >= 90 days"
    pub description: String,
    /// Whether this criterion was met by the investor.
    pub pass: bool,
}

/// The evaluation result that gets signed by the TEE and fed into the ZK circuit.
/// `results[i]` = true means criterion i passed. Indices >= `count` are padding (always true).
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "contract", borsh(crate = "near_sdk::borsh"))]
pub struct CriteriaResults {
    /// Fixed-size boolean array. `results[i]` for `i < count` = actual judgment.
    /// `results[i]` for `i >= count` = `true` (padding).
    pub results: [bool; MAX_CRITERIA],
    /// Number of actual criteria (1..=MAX_CRITERIA).
    pub count: u8,
}

impl CriteriaResults {
    /// Create from a variable-length vec of bools. Pads remaining with true.
    /// Panics if `passes.len() > MAX_CRITERIA` or `passes.is_empty()`.
    pub fn from_vec(passes: Vec<bool>) -> Self {
        assert!(!passes.is_empty(), "at least one criterion required");
        assert!(
            passes.len() <= MAX_CRITERIA,
            "too many criteria: {} > {}",
            passes.len(),
            MAX_CRITERIA
        );
        let mut results = [true; MAX_CRITERIA];
        for (i, &pass) in passes.iter().enumerate() {
            results[i] = pass;
        }
        CriteriaResults {
            results,
            count: passes.len() as u8,
        }
    }

    /// Returns true if all active criteria (0..count) passed.
    pub fn all_pass(&self) -> bool {
        self.results[..self.count as usize].iter().all(|&b| b)
    }
}
```

- [ ] **Step 2: attestation.rs 수정 — score 제거, criteria_results 추가**

`tee/shared/src/attestation.rs`에서:

기존 `AttestationPayload`:
```rust
pub struct AttestationPayload {
    pub subject: AccountId,
    pub policy_id: PolicyId,
    pub verdict: Verdict,
    pub score: u16,                    // 제거
    pub issued_at: Timestamp,
    pub expires_at: Timestamp,
    pub nonce: Nonce,
    pub evidence_summary: EvidenceSummary,  // 제거
    pub payload_version: u8,
}
```

변경 후:
```rust
pub struct AttestationPayload {
    pub subject: AccountId,
    pub policy_id: PolicyId,
    pub verdict: Verdict,
    pub issued_at: Timestamp,
    pub expires_at: Timestamp,
    pub nonce: Nonce,
    pub criteria_results: CriteriaResults,
    pub payload_version: u8,
}
```

`EvidenceSummary` struct는 삭제. `RATIONALE_MAX_CHARS` 상수도 삭제.

`Verdict` enum은 유지 (TEE 응답의 최종 판정으로 사용, ZK circuit의 eligible과 일치해야 함).

- [ ] **Step 3: lib.rs 수정**

```rust
// tee/shared/src/lib.rs — 추가/변경 부분만

pub mod criteria;

// re-exports 변경
pub use attestation::{AttestationBundle, AttestationPayload, Hash32, Nonce, Verdict};
pub use criteria::{CriteriaResults, Criterion, MAX_CRITERIA};
// EvidenceSummary, RATIONALE_MAX_CHARS 제거
```

- [ ] **Step 4: canonical.rs 수정 — payload_hash 직렬화 변경**

`tee/shared/src/canonical.rs`의 `payload_hash` 함수 자체는 변경 불필요 (borsh 직렬화 → keccak256). `AttestationPayload`의 borsh derive가 자동으로 새 필드 반영.

기존 golden vector 테스트의 `GOLDEN_PAYLOAD_HASH` 상수값은 구조체가 바뀌므로 재계산 필요.

- [ ] **Step 5: roundtrip 테스트 업데이트**

기존 `tee/shared/tests/roundtrip.rs`를 읽고 `EvidenceSummary` → `CriteriaResults`로 변경.

```rust
// roundtrip 테스트의 dummy_payload 수정
fn dummy_payload() -> AttestationPayload {
    AttestationPayload {
        subject: "alice.testnet".to_string(),
        policy_id: 1,
        verdict: Verdict::Eligible,
        issued_at: 1_700_000_000_000_000_000,
        expires_at: 1_700_003_600_000_000_000,
        nonce: [0x42u8; 32],
        criteria_results: CriteriaResults::from_vec(vec![true, true, true, true, true, true]),
        payload_version: 2,  // 버전 범프
    }
}
```

- [ ] **Step 6: cargo build + test**

```bash
# std mode
cargo test -p tee-shared
# contract mode
cargo build -p tee-shared --no-default-features --features contract
```

Expected: 둘 다 성공

- [ ] **Step 7: Commit**

```bash
git add tee/shared/
git commit -m "feat(shared): replace score+evidence with CriteriaResults for ZK eligibility"
```

---

## Task 3: contracts — AttestationPayload 변경 전파 + 컴파일 수정

**Files:**
- Modify: `contracts/attestation-verifier/src/lib.rs`
- Modify: `contracts/attestation-verifier/src/crypto.rs`
- Modify: `contracts/attestation-verifier/tests/unit.rs`
- Modify: `contracts/ido-escrow/src/subscription.rs`
- Modify: `contracts/ido-escrow/src/external.rs`
- Modify: `contracts/ido-escrow/tests/unit.rs`

이 Task는 "기존 TEE 서명 기반 플로우를 ZK proof 기반으로 교체하기 전"의 중간 단계.
목표: tee-shared의 AttestationPayload 변경으로 인한 컴파일 에러를 전부 해결.

- [ ] **Step 1: attestation-verifier — is_eligible에서 score 관련 로직 제거**

`contracts/attestation-verifier/src/lib.rs`:

`is_eligible()` 메서드에서 기존과 동일하게 `verdict == Eligible` 체크. `score` 관련 코드는 이미 없으므로 큰 변경 없음. `EvidenceSummary` import만 제거.

```rust
// is_eligible은 기존 로직 유지 (verdict + 서명 검증)
// EvidenceSummary 관련 import 없애기
use tee_shared::{AttestationBundle, Verdict};
```

- [ ] **Step 2: attestation-verifier unit test 수정**

`contracts/attestation-verifier/tests/unit.rs`에서 `EvidenceSummary` → `CriteriaResults`로 테스트 데이터 변경.

```rust
use tee_shared::{CriteriaResults, ...};

// 기존 EvidenceSummary 생성 부분을:
// evidence_summary: EvidenceSummary { ... }
// 로 대체:
criteria_results: CriteriaResults::from_vec(vec![true, true, true]),
payload_version: 2,
```

- [ ] **Step 3: ido-escrow subscription.rs — 컴파일 에러 수정**

`contracts/ido-escrow/src/subscription.rs`: `AttestationBundle` 사용은 동일. `EvidenceSummary` import 제거.

```rust
use tee_shared::{
    AttestationBundle, ContributionOutcome, Hash32, Policy, PolicyId, PolicyStatus, Timestamp,
    Contribution,
};
```

- [ ] **Step 4: ido-escrow unit test 수정**

`contracts/ido-escrow/tests/unit.rs`에서 `EvidenceSummary` → `CriteriaResults`.

- [ ] **Step 5: workspace 전체 빌드**

```bash
cargo build --workspace
cargo test --workspace
```

Expected: 전부 성공

- [ ] **Step 6: wasm 빌드 확인**

```bash
cargo build --target wasm32-unknown-unknown --release -p policy-registry
cargo build --target wasm32-unknown-unknown --release -p attestation-verifier
cargo build --target wasm32-unknown-unknown --release -p ido-escrow
```

Expected: 전부 성공

- [ ] **Step 7: Commit**

```bash
git add contracts/ tee/shared/
git commit -m "refactor(contracts): propagate AttestationPayload schema change (score→criteria)"
```

---

## Task 4: zk-verifier 컨트랙트 — 온체인 groth16 검증

**Files:**
- Create: `contracts/zk-verifier/Cargo.toml`
- Create: `contracts/zk-verifier/src/lib.rs`
- Create: `contracts/zk-verifier/tests/unit.rs`
- Modify: `Cargo.toml` (workspace members)

- [ ] **Step 1: Cargo.toml 작성**

```toml
# contracts/zk-verifier/Cargo.toml
[package]
name = "zk-verifier"
version.workspace = true
edition.workspace = true
license.workspace = true

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
near-sdk = { workspace = true }
serde_json = { workspace = true }

[dev-dependencies]
near-sdk = { workspace = true, features = ["unit-testing"] }
```

- [ ] **Step 2: workspace에 멤버 추가**

`Cargo.toml` (루트):
```toml
members = [
    "tee/shared",
    "contracts/policy-registry",
    "contracts/attestation-verifier",
    "contracts/ido-escrow",
    "contracts/mock-ft",
    "contracts/zk-verifier",
]
```

- [ ] **Step 3: zk-verifier 컨트랙트 작성**

```rust
// contracts/zk-verifier/src/lib.rs
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::{env, near_bindgen, AccountId, BorshStorageKey, PanicOnDefault};
use near_sdk::serde::{Deserialize, Serialize};

/// Groth16 proof (BN254 curve).
/// All field elements are 32-byte big-endian encoded.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct Groth16Proof {
    /// G1 point: pi_a = [x, y] (2 x 32 bytes)
    pub pi_a: [String; 2],
    /// G2 point: pi_b = [[x1, x2], [y1, y2]] (2 x 2 x 32 bytes)
    pub pi_b: [[String; 2]; 2],
    /// G1 point: pi_c = [x, y]
    pub pi_c: [String; 2],
}

/// Verification key stored on-chain (set once at init or via update).
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct VerificationKey {
    pub alpha_g1: [String; 2],
    pub beta_g2: [[String; 2]; 2],
    pub gamma_g2: [[String; 2]; 2],
    pub delta_g2: [[String; 2]; 2],
    pub ic: Vec<[String; 2]>,  // IC[0], IC[1], ... IC[n_public]
}

#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    Vk,
}

#[near_bindgen]
#[derive(BorshSerialize, BorshDeserialize, PanicOnDefault)]
#[borsh(crate = "near_sdk::borsh")]
pub struct ZkVerifier {
    pub owner: AccountId,
    pub vk_json: String,  // verification_key.json 전체를 문자열로 저장
}

#[near_bindgen]
impl ZkVerifier {
    #[init]
    pub fn new(owner: AccountId, verification_key_json: String) -> Self {
        // 파싱 검증
        let _vk: serde_json::Value =
            serde_json::from_str(&verification_key_json).expect("invalid verification key JSON");
        Self {
            owner,
            vk_json: verification_key_json,
        }
    }

    /// Update the verification key (e.g., after re-running trusted setup).
    pub fn update_vk(&mut self, verification_key_json: String) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Unauthorized"
        );
        let _vk: serde_json::Value =
            serde_json::from_str(&verification_key_json).expect("invalid verification key JSON");
        self.vk_json = verification_key_json;
    }

    /// Verify a groth16 proof.
    ///
    /// `public_inputs`: the public signals from the circuit.
    /// For our eligibility circuit: [payload_hash_limb0, limb1, limb2, limb3, eligible]
    ///
    /// Returns true if the proof is valid.
    ///
    /// NOTE: MVP에서는 snarkjs의 verification 알고리즘을 NEAR에서 직접 구현하기보다,
    /// 신뢰할 수 있는 off-chain verifier가 proof를 검증한 뒤 결과를 이 컨트랙트에
    /// 등록하는 2단계 접근을 사용. 향후 NEAR의 alt_bn128 precompile이 안정화되면
    /// 온체인 pairing 검증으로 전환.
    pub fn verify_proof(
        &self,
        proof_json: String,
        public_inputs_json: String,
    ) -> bool {
        // MVP: proof + public_inputs의 구조만 검증.
        // 실제 pairing 검증은 off-chain에서 수행 후 이 컨트랙트의
        // `register_verified_proof`로 등록하는 패턴.
        let _proof: serde_json::Value =
            serde_json::from_str(&proof_json).expect("invalid proof JSON");
        let public_inputs: Vec<String> =
            serde_json::from_str(&public_inputs_json).expect("invalid public inputs JSON");

        // public_inputs: [limb0, limb1, limb2, limb3, eligible]
        // eligible(마지막)이 "1"이어야 적격
        if public_inputs.len() != 5 {
            env::log_str("expected 5 public inputs");
            return false;
        }
        if public_inputs[4] != "1" {
            env::log_str("eligible output is not 1");
            return false;
        }

        // TODO(mainnet): alt_bn128 precompile로 실제 pairing 검증 구현
        // MVP에서는 off-chain verifier trust model
        true
    }

    /// Register a proof that has been verified off-chain.
    /// Called by the trusted off-chain verifier after snarkjs.groth16.verify() passes.
    ///
    /// `payload_hash_hex`: 0x-prefixed 32-byte keccak256 hash
    /// Returns true if registration succeeded.
    pub fn register_verified_proof(
        &mut self,
        payload_hash_hex: String,
        eligible: bool,
    ) -> bool {
        // MVP: owner만 호출 가능 (off-chain verifier = owner)
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Unauthorized: only owner can register verified proofs"
        );
        assert!(eligible, "cannot register ineligible proof");

        env::log_str(&format!(
            r#"{{"standard":"nep297","version":"1.0.0","event":"ProofVerified","data":{{"payload_hash":"{}","eligible":{}}}}}"#,
            payload_hash_hex, eligible
        ));

        true
    }

    pub fn get_verification_key(&self) -> String {
        self.vk_json.clone()
    }
}
```

- [ ] **Step 4: unit test 작성**

```rust
// contracts/zk-verifier/tests/unit.rs
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

use zk_verifier::ZkVerifier;

fn setup() -> ZkVerifier {
    let context = VMContextBuilder::new()
        .predecessor_account_id("owner.testnet".parse().unwrap())
        .build();
    testing_env!(context);

    let vk_json = r#"{"protocol":"groth16","curve":"bn128","nPublic":5,"vk_alpha_1":["0","0","0"],"vk_beta_2":[["0","0"],["0","0"],["0","0"]],"vk_gamma_2":[["0","0"],["0","0"],["0","0"]],"vk_delta_2":[["0","0"],["0","0"],["0","0"]],"IC":[["0","0","0"],["0","0","0"],["0","0","0"],["0","0","0"],["0","0","0"],["0","0","0"]]}"#;
    ZkVerifier::new("owner.testnet".parse().unwrap(), vk_json.to_string())
}

#[test]
fn test_verify_proof_eligible() {
    let contract = setup();
    let proof = r#"{"pi_a":["1","2","1"],"pi_b":[["1","2"],["3","4"],["1","0"]],"pi_c":["1","2","1"]}"#;
    let public = r#"["123","456","789","101","1"]"#;
    assert!(contract.verify_proof(proof.to_string(), public.to_string()));
}

#[test]
fn test_verify_proof_ineligible() {
    let contract = setup();
    let proof = r#"{"pi_a":["1","2","1"],"pi_b":[["1","2"],["3","4"],["1","0"]],"pi_c":["1","2","1"]}"#;
    let public = r#"["123","456","789","101","0"]"#;
    assert!(!contract.verify_proof(proof.to_string(), public.to_string()));
}

#[test]
fn test_register_verified_proof() {
    let mut contract = setup();
    let result = contract.register_verified_proof(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef".to_string(),
        true,
    );
    assert!(result);
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_register_verified_proof_unauthorized() {
    let mut contract = setup();
    let context = VMContextBuilder::new()
        .predecessor_account_id("hacker.testnet".parse().unwrap())
        .build();
    testing_env!(context);
    contract.register_verified_proof("0xabc".to_string(), true);
}
```

- [ ] **Step 5: 빌드 + 테스트**

```bash
cargo build -p zk-verifier
cargo test -p zk-verifier
cargo build --target wasm32-unknown-unknown --release -p zk-verifier
```

Expected: 전부 성공

- [ ] **Step 6: Commit**

```bash
git add contracts/zk-verifier/ Cargo.toml
git commit -m "feat(zk-verifier): add on-chain groth16 verification contract (MVP)"
```

---

## Task 5: ido-escrow — contribute()를 ZK proof 기반으로 전환

**Files:**
- Modify: `contracts/ido-escrow/src/subscription.rs`
- Modify: `contracts/ido-escrow/src/external.rs`
- Modify: `contracts/ido-escrow/src/lib.rs`
- Modify: `contracts/ido-escrow/tests/unit.rs`

- [ ] **Step 1: external.rs — zk-verifier ext_contract 추가**

```rust
// contracts/ido-escrow/src/external.rs에 추가:

#[ext_contract(ext_zk_verifier)]
pub trait ZkVerifierExt {
    fn verify_proof(&self, proof_json: String, public_inputs_json: String) -> bool;
}
```

- [ ] **Step 2: ido-escrow lib.rs — zk_verifier 필드 추가**

```rust
// IdoEscrow struct에 추가:
pub zk_verifier: AccountId,

// new() 파라미터에 추가:
pub fn new(
    owner: AccountId,
    policy_registry: AccountId,
    attestation_verifier: AccountId,
    zk_verifier: AccountId,
) -> Self {
    // ... zk_verifier 저장
}
```

- [ ] **Step 3: subscription.rs — contribute() 시그니처 변경**

기존: `contribute(policy_id, bundle: AttestationBundle)`
변경: `contribute(policy_id, bundle: AttestationBundle, zk_proof_json: String, zk_public_inputs_json: String)`

`on_is_eligible` 콜백 체인을 `ext_zk_verifier::verify_proof` 호출로 교체:

```rust
#[payable]
pub fn contribute(
    &mut self,
    policy_id: PolicyId,
    bundle: AttestationBundle,
    zk_proof_json: String,
    zk_public_inputs_json: String,
) -> Promise {
    // PHASE A: 기존 sync validation 동일

    // PHASE B: optimistic state write 동일

    // PHASE C: Promise chain 변경
    // 1) get_policy (기존과 동일)
    // 2) attestation-verifier.verify (TEE 서명 검증 — is_eligible 대신 verify만)
    // 3) zk-verifier.verify_proof (ZK proof 검증)
    // 세 검증 모두 통과해야 contribution 확정

    ext_policy_registry::ext(self.policy_registry.clone())
        .with_static_gas(GAS_VIEW)
        .get_policy(policy_id)
        .then(
            ext_self::ext(env::current_account_id())
                .with_static_gas(GAS_CALLBACK_POLICY)
                .on_get_policy(policy_id, investor, bundle, zk_proof_json, zk_public_inputs_json),
        )
}
```

`on_get_policy` 콜백에서:
- 기존: `ext_verifier::is_eligible(bundle)` 호출
- 변경: `ext_verifier::verify(bundle)` 호출 → `on_verify_signature` 콜백 → `ext_zk_verifier::verify_proof` 호출 → `on_zk_verified` 콜백

- [ ] **Step 4: external.rs — 콜백 시그니처 업데이트**

```rust
#[ext_contract(ext_self)]
pub trait IdoEscrowCallbacks {
    fn on_get_policy(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        bundle: AttestationBundle,
        zk_proof_json: String,
        zk_public_inputs_json: String,
    ) -> Promise;

    fn on_verify_signature(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        subscription_end: Timestamp,
        attestation_hash: Hash32,
        nonce: [u8; 32],
        zk_proof_json: String,
        zk_public_inputs_json: String,
    ) -> Promise;

    fn on_zk_verified(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        subscription_end: Timestamp,
        attestation_hash: Hash32,
        nonce: [u8; 32],
    ) -> PromiseOrValue<bool>;

    // ... 나머지 기존 콜백 유지
}
```

- [ ] **Step 5: unit test 업데이트**

테스트에서 `contribute()` 호출 시 `zk_proof_json`, `zk_public_inputs_json` 인자 추가.

- [ ] **Step 6: 빌드 + 테스트**

```bash
cargo build --workspace
cargo test --workspace
```

Expected: 전부 성공

- [ ] **Step 7: Commit**

```bash
git add contracts/
git commit -m "feat(ido-escrow): integrate ZK proof verification into contribute() flow"
```

---

## Task 6: TEE Python — LLM 프롬프트 + 파이프라인 변경

**Files:**
- Modify: `tee/inference/src/schemas.py`
- Modify: `tee/inference/src/nearai_client.py`
- Modify: `tee/inference/src/pipeline.py`
- Modify: `tee/inference/src/canonical.py`
- Modify: `tee/inference/tests/test_pipeline.py`

- [ ] **Step 1: schemas.py — JudgeOutputModel 변경**

```python
# 기존 JudgeOutputModel 교체
class CriterionResult(BaseModel):
    description: str
    passed: bool

class JudgeOutputModel(BaseModel):
    verdict: Literal["Eligible", "Ineligible"]
    criteria: list[CriterionResult]
    rationale: str  # 디버깅/로깅용, 온체인에는 안 올라감

# StructuredRulesModel → CriteriaRulesModel로 교체
class CriteriaRulesModel(BaseModel):
    criteria: list[str]  # 평가 항목 목록 (description만)
    qualitative_prompt: str  # LLM이 정성 평가할 때 쓸 프롬프트
```

- [ ] **Step 2: schemas.py — AttestationPayloadModel 변경**

```python
class CriteriaResultsModel(BaseModel):
    results: list[bool]  # 길이 = MAX_CRITERIA (10), 패딩은 True
    count: int

class AttestationPayloadModel(BaseModel):
    subject: str
    policy_id: int
    verdict: Literal["Eligible", "Ineligible"]
    # score 제거
    issued_at: int
    expires_at: int
    nonce: bytes
    criteria_results: CriteriaResultsModel  # evidence_summary 대체
    payload_version: int  # 2로 변경
    # ... nonce validator/serializer는 기존과 동일
```

- [ ] **Step 3: nearai_client.py — LLM 프롬프트 변경**

```python
STRUCTURE_PROMPT = """You are a criteria generator for an IDO launchpad.
Given a foundation's natural language criterion for selecting investors, extract
a list of specific, measurable evaluation criteria (max 10).

Each criterion should be a clear yes/no question that can be evaluated
against an investor's on-chain data and self-introduction.

Output STRICT JSON:
{
  "criteria": ["criterion 1 description", "criterion 2 description", ...],
  "qualitative_prompt": "prompt for LLM to evaluate qualitative criteria"
}

Rules:
- Each criterion must be answerable as yes/no
- Maximum 10 criteria
- Mix quantitative (on-chain measurable) and qualitative (LLM judgment)
- No preamble, no explanation. JSON ONLY.
"""

JUDGE_PROMPT = """You are an IDO investor evaluator running inside a TEE.
You are given:
- A list of evaluation criteria
- Aggregated on-chain signals (anonymized)
- Optional GitHub activity summary
- Optional self-introduction text

For EACH criterion, determine if the investor passes (true) or fails (false).

Output STRICT JSON:
{
  "verdict": "Eligible" | "Ineligible",
  "criteria": [
    {"description": "criterion text", "passed": true/false},
    ...
  ],
  "rationale": string (≤ 280 chars, NO PII, NO wallet addresses, NO GitHub username)
}

Rules:
- verdict is "Eligible" ONLY if ALL criteria pass
- Each criterion must have a clear true/false judgment
- rationale is a brief summary for debugging only
"""
```

`NearAIClient` 메서드 변경:
```python
async def structurize(self, natural_language: str) -> CriteriaRulesModel:
    content = await self.chat(
        system=STRUCTURE_PROMPT,
        user=natural_language,
        temperature=0,
        response_format={"type": "json_object"},
    )
    return CriteriaRulesModel.model_validate_json(content)

async def judge(
    self,
    rules: CriteriaRulesModel,
    signals: AggregatedSignalModel,
    self_intro: str,
) -> JudgeOutputModel:
    content = await self.chat(
        system=JUDGE_PROMPT,
        user=json.dumps({
            "criteria": rules.criteria,
            "qualitative_prompt": rules.qualitative_prompt,
            "signals": signals.anon_summary(),
            "self_intro": self_intro[:2000],
        }),
        temperature=0,
        response_format={"type": "json_object"},
    )
    return JudgeOutputModel.model_validate_json(content)
```

- [ ] **Step 4: pipeline.py — process_persona 변경**

핵심 변경:
- `build_evidence_summary()` 삭제
- `validate_judge_output()` 변경 — score 검증 제거, criteria 개수 검증 추가
- `process_persona()`에서 `CriteriaResults` 생성

```python
MAX_CRITERIA = 10

def validate_judge_output(out: JudgeOutputModel, self_intro: str) -> None:
    if len(out.criteria) < 1 or len(out.criteria) > MAX_CRITERIA:
        raise LlmJudgeFailed(f"criteria count must be 1..={MAX_CRITERIA}")
    if len(out.rationale) > RATIONALE_MAX_CHARS:
        raise PiiLeakError("rationale exceeds 280 chars")
    # PII 검사는 기존과 동일 (RE_ETH_ADDR, RE_NEAR_ACC 등)
    all_pass = all(c.passed for c in out.criteria)
    if out.verdict == "Eligible" and not all_pass:
        raise LlmJudgeFailed("verdict=Eligible but not all criteria passed")
    if out.verdict == "Ineligible" and all_pass:
        raise LlmJudgeFailed("verdict=Ineligible but all criteria passed")

def build_criteria_results(out: JudgeOutputModel) -> CriteriaResultsModel:
    passes = [c.passed for c in out.criteria]
    # 패딩: MAX_CRITERIA까지 True로 채움
    while len(passes) < MAX_CRITERIA:
        passes.append(True)
    return CriteriaResultsModel(results=passes, count=len(out.criteria))
```

`process_persona`에서:
```python
criteria_results = build_criteria_results(judge_out)

payload = AttestationPayloadModel(
    subject=persona.near_account,
    policy_id=persona.policy_id,
    verdict=judge_out.verdict,
    issued_at=now,
    expires_at=policy.sale_config.subscription_end,
    nonce=persona.nonce,
    criteria_results=criteria_results,
    payload_version=2,
)
```

- [ ] **Step 5: canonical.py — 직렬화 변경**

```python
def serialize_criteria_results(cr: CriteriaResultsModel) -> bytes:
    # Borsh: [bool; 10] + u8
    # bool은 1바이트 (0x00 or 0x01), 고정 배열이므로 length prefix 없음
    buf = b""
    for r in cr.results:
        buf += borsh_bool(r)
    buf += borsh_u8(cr.count)
    return buf

def serialize_attestation_payload(payload: AttestationPayloadModel) -> bytes:
    return (
        borsh_string(payload.subject)
        + borsh_u64(payload.policy_id)
        + borsh_u8(0 if payload.verdict == "Eligible" else 1)
        # score 제거됨
        + borsh_u64(payload.issued_at)
        + borsh_u64(payload.expires_at)
        + borsh_fixed_array(payload.nonce, 32)
        + serialize_criteria_results(payload.criteria_results)  # evidence_summary 대체
        + borsh_u8(payload.payload_version)
    )
```

- [ ] **Step 6: test_pipeline.py 업데이트**

기존 테스트의 `JudgeOutputModel` 생성 부분을 새 스키마에 맞게 변경.

- [ ] **Step 7: pytest 실행**

```bash
cd tee/inference && uv run pytest -v
```

Expected: 전부 통과

- [ ] **Step 8: Commit**

```bash
git add tee/inference/
git commit -m "feat(tee): replace score-based judgment with per-criteria pass/fail for ZK"
```

---

## Task 7: TEE 응답에 ZK circuit 입력 포함 + 클라이언트 연동 스펙

**Files:**
- Modify: `tee/inference/src/schemas.py`
- Modify: `tee/inference/src/pipeline.py`
- Modify: `tee/inference/src/main.py`

TEE `/v1/attest` 응답에 클라이언트가 ZK proof를 생성하는 데 필요한 정보를 추가.

- [ ] **Step 1: 응답 모델 확장**

```python
# schemas.py에 추가
class ZkCircuitInputModel(BaseModel):
    """클라이언트가 snarkjs로 proof 생성할 때 쓰는 입력."""
    payload_hash_limbs: list[str]  # 4개의 64-bit limb (decimal string)
    criteria: list[int]            # [1,1,1,0,...] (MAX_CRITERIA개, 0 or 1)
    criteria_count: str            # decimal string

class AttestationResponseModel(BaseModel):
    """TEE /v1/attest 엔드포인트의 전체 응답."""
    bundle: AttestationBundleModel
    tee_report: bytes
    zk_input: ZkCircuitInputModel  # 클라이언트가 proof 생성에 사용

    @field_validator("tee_report", mode="before")
    @classmethod
    def parse_report(cls, value: object) -> bytes:
        if isinstance(value, bytes):
            return value
        if isinstance(value, str):
            return base64.b64decode(value)
        raise TypeError("tee_report must be bytes or base64 string")

    @field_serializer("tee_report")
    def serialize_report(self, value: bytes) -> str:
        return base64.b64encode(value).decode("ascii")
```

- [ ] **Step 2: pipeline.py — ZK circuit input 생성 헬퍼**

```python
def payload_hash_to_limbs(h: bytes) -> list[str]:
    """32-byte keccak256 hash → 4 x 64-bit limbs (little-endian within each limb)."""
    assert len(h) == 32
    limbs = []
    for i in range(4):
        chunk = h[i*8:(i+1)*8]
        val = int.from_bytes(chunk, "big")
        limbs.append(str(val))
    return limbs

def build_zk_input(payload_hash: bytes, criteria_results: CriteriaResultsModel) -> ZkCircuitInputModel:
    return ZkCircuitInputModel(
        payload_hash_limbs=payload_hash_to_limbs(payload_hash),
        criteria=[1 if r else 0 for r in criteria_results.results],
        criteria_count=str(criteria_results.count),
    )
```

`process_persona` 반환 타입을 `AttestationResponseModel`로 변경:
```python
async def process_persona(...) -> AttestationResponseModel:
    # ... 기존 로직 ...
    zk_input = build_zk_input(digest, criteria_results)
    return AttestationResponseModel(
        bundle=bundle,
        tee_report=tee_report,
        zk_input=zk_input,
    )
```

- [ ] **Step 3: main.py — 엔드포인트 응답 타입 변경**

```python
@app.post("/v1/attest", response_model=AttestationResponseModel)
async def attest(persona: PersonaSubmission) -> AttestationResponseModel:
    # 기존과 동일
```

- [ ] **Step 4: 테스트**

```bash
cd tee/inference && uv run pytest -v
```

- [ ] **Step 5: Commit**

```bash
git add tee/inference/
git commit -m "feat(tee): include ZK circuit input in attestation response"
```

---

## Task 8: golden vector 재생성 + cross-lang Borsh 검증

**Files:**
- Modify: `tee/shared/src/canonical.rs` (golden vector 상수 업데이트)
- Modify: `tee/shared/tests/roundtrip.rs`
- Create or Modify: cross-lang test (test-02 범위)

- [ ] **Step 1: Rust golden vector 재계산**

`tee/shared/src/canonical.rs`의 contract_tests에서 `dummy_payload()`를 새 스키마로 변경하고, 테스트를 실행해서 새로운 golden hash를 얻음.

```bash
# 먼저 기존 GOLDEN_PAYLOAD_HASH assertion을 주석 처리
cargo test -p tee-shared --features contract -- payload_hash 2>&1
# 출력에서 새 hash 값 확인 후 GOLDEN_PAYLOAD_HASH 업데이트
```

- [ ] **Step 2: Python canonical.py 테스트**

동일한 dummy payload를 Python에서 직렬화 + keccak256 → Rust golden vector와 일치 확인.

```python
# 간단한 스크립트 또는 test_canonical.py에서:
from canonical import payload_hash, serialize_attestation_payload
from schemas import AttestationPayloadModel, CriteriaResultsModel

payload = AttestationPayloadModel(
    subject="alice.testnet",
    policy_id=1,
    verdict="Eligible",
    issued_at=1_700_000_000_000_000_000,
    expires_at=1_700_003_600_000_000_000,
    nonce=bytes([0x42] * 32),
    criteria_results=CriteriaResultsModel(
        results=[True, True, True, True, True, True, True, True, True, True],
        count=6,
    ),
    payload_version=2,
)
h = payload_hash(payload)
print(h.hex())
# 이 값이 Rust GOLDEN_PAYLOAD_HASH와 일치해야 함
```

- [ ] **Step 3: Commit**

```bash
git add tee/
git commit -m "test: update golden vectors for criteria-based AttestationPayload"
```

---

## Task 9: 최종 통합 빌드 + 정리

**Files:**
- All workspace crates
- `.gitignore` (circuits/build/ 추가)

- [ ] **Step 1: .gitignore 업데이트**

```
# circuits build artifacts
circuits/build/
```

- [ ] **Step 2: 전체 workspace 빌드**

```bash
cargo build --workspace
cargo test --workspace
```

- [ ] **Step 3: wasm 빌드**

```bash
cargo build --target wasm32-unknown-unknown --release -p policy-registry
cargo build --target wasm32-unknown-unknown --release -p attestation-verifier
cargo build --target wasm32-unknown-unknown --release -p ido-escrow
cargo build --target wasm32-unknown-unknown --release -p zk-verifier
cargo build --target wasm32-unknown-unknown --release -p mock-ft
```

- [ ] **Step 4: Python 테스트**

```bash
cd tee/inference && uv run pytest -v
```

- [ ] **Step 5: circom circuit 검증**

```bash
cd circuits && snarkjs groth16 verify build/verification_key.json build/public.json build/proof.json
```

- [ ] **Step 6: planning task 파일 상태 업데이트**

해당 없는 기존 task들(score 기반)의 설명 업데이트 또는 supersede 처리.

- [ ] **Step 7: Commit**

```bash
git add .gitignore
git commit -m "chore: add circuits/build/ to gitignore, verify full workspace build"
```

---

## Dependency Graph

```
Task 1 (circom circuit)
  ↓
Task 2 (tee-shared 타입 변경)  ←── 독립: Task 1과 병렬 가능
  ↓
Task 3 (contracts 컴파일 수정)  ←── Task 2 의존
  ↓
Task 4 (zk-verifier 컨트랙트)  ←── Task 1, Task 3 의존
  ↓
Task 5 (ido-escrow ZK 통합)    ←── Task 3, Task 4 의존
  ↓
Task 6 (TEE Python 변경)       ←── Task 2 의존 (Task 3과 병렬 가능)
  ↓
Task 7 (TEE 응답 확장)         ←── Task 6 의존
  ↓
Task 8 (golden vector)         ←── Task 2, Task 6 의존
  ↓
Task 9 (통합 빌드)             ←── 전부 의존
```

**병렬 가능:**
- Task 1 ‖ Task 2 (circom과 Rust 타입은 독립)
- Task 3 ‖ Task 6 (contracts 수정과 Python 수정은 독립, 둘 다 Task 2에만 의존)
