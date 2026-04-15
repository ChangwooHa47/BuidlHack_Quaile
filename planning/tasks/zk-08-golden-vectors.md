---
id: zk-08-golden-vectors
status: done
sub: TEE
layer: test
depends_on: ["zk-02-shared-criteria-types", "zk-06-tee-python-criteria"]
estimate: 45m
demo_step: "Subscribing.Review"
---

# Golden vector 재생성 + cross-lang Borsh 검증

## Context
`AttestationPayload` 스키마가 바뀌면서 기존 golden vector(GOLDEN_PAYLOAD_HASH)가 무효화됨. Rust와 Python 양쪽에서 동일한 dummy payload를 직렬화 → keccak256 해서 결과가 일치하는지 검증.

이 태스크가 test-02-cross-lang-borsh의 역할을 겸함.

계획 문서: `docs/superpowers/plans/2026-04-15-zk-eligibility-migration.md` Task 8

## Files
- `tee/shared/src/canonical.rs` (modify — golden vector 상수 업데이트)
- `tee/shared/tests/roundtrip.rs` (modify)
- `tee/inference/tests/test_canonical.py` (create or modify)

## Spec

### 공통 dummy payload (Rust와 Python이 동일하게 사용)
```
subject: "alice.testnet"
policy_id: 1
verdict: Eligible (variant index 0)
issued_at: 1_700_000_000_000_000_000
expires_at: 1_700_003_600_000_000_000
nonce: [0x42; 32]
criteria_results:
  results: [true, true, true, true, true, true, true, true, true, true]
  count: 6
payload_version: 2
```

### Borsh 직렬화 순서 (확정)
1. `subject` → borsh_string("alice.testnet")
2. `policy_id` → u64 LE (1)
3. `verdict` → u8 (0 = Eligible)
4. `issued_at` → u64 LE
5. `expires_at` → u64 LE
6. `nonce` → [u8; 32] (고정, prefix 없음)
7. `criteria_results.results` → [bool; 10] (10바이트, prefix 없음)
8. `criteria_results.count` → u8
9. `payload_version` → u8

### Rust 작업
1. `canonical.rs`의 `dummy_payload()` 수정 (EvidenceSummary → CriteriaResults)
2. `GOLDEN_PAYLOAD_HASH` 상수를 임시로 주석 처리
3. 테스트 실행 → 새 hash 값 캡처
4. `GOLDEN_PAYLOAD_HASH` 상수 업데이트
5. 테스트 재실행 → 통과 확인

### Python 작업
```python
# test_canonical.py
from canonical import payload_hash, serialize_attestation_payload
from schemas import AttestationPayloadModel, CriteriaResultsModel

def test_golden_vector_matches_rust():
    payload = AttestationPayloadModel(
        subject="alice.testnet",
        policy_id=1,
        verdict="Eligible",
        issued_at=1_700_000_000_000_000_000,
        expires_at=1_700_003_600_000_000_000,
        nonce=bytes([0x42] * 32),
        criteria_results=CriteriaResultsModel(
            results=[True]*10,
            count=6,
        ),
        payload_version=2,
    )
    h = payload_hash(payload)
    # 이 값은 Rust GOLDEN_PAYLOAD_HASH와 동일해야 함
    assert h.hex() == "RUST에서_얻은_값"
```

## Acceptance Criteria
- [ ] Rust `cargo test -p tee-shared --features contract -- payload_hash` 통과
- [ ] Rust `cargo test -p tee-shared -- roundtrip` 통과
- [ ] Python `uv run pytest tests/test_canonical.py -v` 통과
- [ ] Rust golden vector와 Python golden vector가 동일한 hex 값
- [ ] `GOLDEN_PAYLOAD_HASH` 상수가 새 스키마 기준으로 업데이트됨

## Test Cases
1. Rust: dummy_payload → borsh → keccak256 → GOLDEN_PAYLOAD_HASH 일치
2. Rust: contract feature keccak vs sha3 reference → 동일 결과
3. Python: 동일 dummy_payload → borsh → keccak256 → Rust와 동일
4. edge: CriteriaResults 패딩(count=6인데 results[6..9]=true) 직렬화 확인

## 코드리뷰 체크포인트
이 태스크 완료 후 반드시:
1. Rust와 Python의 Borsh 바이트 출력을 hex dump로 비교해서 byte-for-byte 일치 확인
2. `criteria_results` 직렬화에서 length prefix가 없는지 확인 (고정 배열이므로)
3. `verdict` enum의 variant index가 Rust=Python 동일한지 (Eligible=0, Ineligible=1)

## References
- 계획 문서 Task 8
- Rust canonical: `tee/shared/src/canonical.rs`
- Python canonical: `tee/inference/src/canonical.py`
