---
id: zk-02-shared-criteria-types
status: done
sub: TEE
layer: tee
depends_on: []
estimate: 1h
demo_step: "Subscribing.Review"
---

# tee-shared: score+evidence → CriteriaResults 타입 전환

## Context
기존 `AttestationPayload`의 `score: u16` + `EvidenceSummary`를 제거하고, `CriteriaResults` (bool 배열 + count)로 교체한다. 이 타입이 ZK circuit의 private input과 1:1 대응.

계획 문서: `docs/superpowers/plans/2026-04-15-zk-eligibility-migration.md` Task 2

## Files
- `tee/shared/src/criteria.rs` (create)
- `tee/shared/src/lib.rs` (modify)
- `tee/shared/src/attestation.rs` (modify)
- `tee/shared/tests/roundtrip.rs` (modify)

## Spec

### 신규: `criteria.rs`
```rust
pub const MAX_CRITERIA: usize = 10;

pub struct Criterion {
    pub description: String,
    pub pass: bool,
}

#[derive(BorshSerialize, BorshDeserialize, ...)]
pub struct CriteriaResults {
    pub results: [bool; MAX_CRITERIA],  // 고정 크기, 패딩은 true
    pub count: u8,                       // 실제 기준 개수 (1..=10)
}

impl CriteriaResults {
    pub fn from_vec(passes: Vec<bool>) -> Self;  // 패딩 자동
    pub fn all_pass(&self) -> bool;              // active 기준 전부 true인지
}
```

### 변경: `attestation.rs`
**제거:**
- `EvidenceSummary` struct 전체
- `RATIONALE_MAX_CHARS` 상수
- `AttestationPayload.score: u16`
- `AttestationPayload.evidence_summary: EvidenceSummary`

**추가:**
- `AttestationPayload.criteria_results: CriteriaResults`

**유지:**
- `Verdict` enum (Eligible/Ineligible)
- 나머지 필드 전부

**payload_version**: 1 → 2로 범프 (Borsh 레이아웃 비호환)

### 변경: `lib.rs`
- `pub mod criteria;` 추가
- re-exports에서 `EvidenceSummary`, `RATIONALE_MAX_CHARS` 제거
- `CriteriaResults`, `Criterion`, `MAX_CRITERIA` re-export 추가

### Borsh 직렬화 레이아웃
`CriteriaResults`의 Borsh:
- `results`: `[bool; 10]` = 10바이트 (각 0x00 or 0x01), 길이 prefix 없음 (고정 배열)
- `count`: `u8` = 1바이트
- 총 11바이트

## Acceptance Criteria
- [ ] `cargo test -p tee-shared` 통과
- [ ] `cargo build -p tee-shared --no-default-features --features contract` 성공
- [ ] `EvidenceSummary` 타입이 코드에서 완전히 제거됨
- [ ] `CriteriaResults::from_vec(vec![true, true, true])` → `count=3`, `results[3..]=true`
- [ ] `CriteriaResults::all_pass()` 정상 동작

## Test Cases
1. `from_vec([true, true, true])` → `all_pass() == true`, `count == 3`
2. `from_vec([true, false, true])` → `all_pass() == false`
3. `from_vec` 빈 벡터 → panic
4. `from_vec` 11개 → panic (MAX_CRITERIA 초과)
5. roundtrip: borsh serialize → deserialize → 원본과 동일

## 코드리뷰 체크포인트
이 태스크 완료 후 반드시:
1. `tee/shared/src/attestation.rs`에서 `score`, `EvidenceSummary` 흔적 완전 제거 확인
2. Borsh 필드 순서가 Python canonical.py와 맞는지 확인 (Task zk-06에서 동기화)
3. `Verdict` enum의 Borsh variant index 변경 없음 확인 (Eligible=0, Ineligible=1)

## References
- 계획 문서 Task 2: `docs/superpowers/plans/2026-04-15-zk-eligibility-migration.md`
- 기존 attestation.rs: `tee/shared/src/attestation.rs`
