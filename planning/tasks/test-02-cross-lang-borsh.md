---
id: test-02-cross-lang-borsh
status: todo
sub: INFRA
layer: test
depends_on: [tee-01-persona-schema, tee-05-signer-and-report]
estimate: 1.5h
demo_step: N/A (CI)
---

# Cross-language Borsh Golden Vector CI

## Context
Python(tee/inference)의 수동 Borsh 구현과 Rust(tee/shared)의 Borsh 직렬화가 **바이트 수준 일치**해야 서명이 호환된다.
한쪽이 스키마를 바꾸면 즉시 감지되도록 **golden vector CI**를 세운다.

PRD NFR-SEC-5 (canonicalization)
iteration-1 리뷰: Missing tasks §3

## Files
- `tests/golden/gen_vectors.rs`           — Rust로 hard-coded payload 직렬화 → hex 덤프
- `tests/golden/fixtures/payload_01.json` — 입력 필드 (인간이 읽기 편한 형태)
- `tests/golden/fixtures/payload_01.borsh.hex` — Rust 직렬화 결과 (CI가 매번 재생성 + 비교)
- `tests/golden/fixtures/payload_01.hash.hex`  — keccak256 결과
- `tests/golden/py_verify.py`             — Python 쪽에서 같은 입력으로 직렬화 → hex 비교
- `.github/workflows/golden.yml` (로드맵, CI 설정)
- `scripts/golden/regen.sh`

## Spec

### 입력 fixture (payload_01.json)
```json
{
  "subject": "alice.testnet",
  "policy_id": 42,
  "verdict": "Eligible",
  "score": 7800,
  "issued_at": 1712896800000000000,
  "expires_at": 1712983200000000000,
  "nonce_hex": "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
  "evidence_summary": {
    "wallet_count_near": 2,
    "wallet_count_evm": 3,
    "avg_holding_days": 540,
    "total_dao_votes": 12,
    "github_included": true,
    "rationale": "Long-term holder with active DAO participation and OSS contributions."
  },
  "payload_version": 1
}
```

### Rust 쪽 (gen_vectors.rs)
```rust
// examples/gen_vectors.rs inside tee/shared
use tee_shared::*;
use serde_json;
use borsh::BorshSerialize;
use std::fs;

fn main() {
    let input: FixtureInput = serde_json::from_str(&fs::read_to_string("tests/golden/fixtures/payload_01.json").unwrap()).unwrap();
    let payload = build_payload(&input);
    let bytes = borsh::to_vec(&payload).unwrap();
    fs::write("tests/golden/fixtures/payload_01.borsh.hex", hex::encode(&bytes)).unwrap();
    let hash = canonical::payload_hash(&payload);
    fs::write("tests/golden/fixtures/payload_01.hash.hex", hex::encode(hash)).unwrap();
    println!("len={} hash={}", bytes.len(), hex::encode(hash));
}
```

실행: `cargo run -p tee-shared --example gen_vectors`

### Python 쪽 (py_verify.py)
```python
#!/usr/bin/env python3
import json, sys, pathlib
from tee_inference.sign.canonical import serialize_attestation_payload
from eth_hash.auto import keccak

fixtures = pathlib.Path(__file__).parent / "fixtures"
for name in ["payload_01"]:
    inp = json.loads((fixtures / f"{name}.json").read_text())
    expected_hex = (fixtures / f"{name}.borsh.hex").read_text().strip()
    expected_hash_hex = (fixtures / f"{name}.hash.hex").read_text().strip()

    payload = build_python_payload(inp)
    actual_bytes = serialize_attestation_payload(payload)
    actual_hash = keccak(actual_bytes)  # 32 bytes

    actual_hex = actual_bytes.hex()
    actual_hash_hex = actual_hash.hex()

    if actual_hex != expected_hex:
        print(f"FAIL [{name}]: borsh bytes mismatch", file=sys.stderr)
        print(f"  expected: {expected_hex}", file=sys.stderr)
        print(f"  actual:   {actual_hex}", file=sys.stderr)
        sys.exit(1)
    if actual_hash_hex != expected_hash_hex:
        print(f"FAIL [{name}]: keccak hash mismatch", file=sys.stderr)
        sys.exit(1)
    print(f"OK [{name}]: {len(actual_bytes)} bytes, hash={actual_hash_hex}")
```

### regen.sh
```bash
#!/usr/bin/env bash
set -euo pipefail
cargo run -p tee-shared --example gen_vectors
echo "Regenerated Rust golden vectors. Run py_verify.py to validate."
python3 tests/golden/py_verify.py
```

### CI 흐름
1. PR에서 schema 변경 → Rust golden이 새로 계산됨
2. Python도 업데이트 안 하면 `py_verify.py` 실패 → CI red
3. 개발자가 Python canonical.py 업데이트 → CI green
4. **절대 깨진 채 merge 불가**

## Acceptance Criteria
- [ ] `bash scripts/golden/regen.sh` 성공
- [ ] `payload_01.borsh.hex`의 길이가 스키마 필드 합과 일치 (sanity)
- [ ] Python `py_verify.py`가 생성된 파일과 바이트 일치
- [ ] keccak256 결과가 양쪽 동일
- [ ] 의도적으로 Python score를 1 바꿨을 때 CI가 즉시 실패
- [ ] 최소 2개 fixture (payload_01: happy, payload_02: Ineligible + edge chars in rationale)
- [ ] fixture에 다국어 rationale (한글/이모지)를 포함한 테스트 추가

## Test Cases
1. happy: 동일 input → Rust == Python
2. edge: rationale에 UTF-8 multi-byte 문자 (한글) → byte 길이 일치
3. edge: score = 0, verdict = Ineligible → 직렬화 성공
4. edge: nonce 전부 0 → 직렬화 성공
5. regression: Python serializer 버그 유도 → CI 실패 확인

## References
- Borsh spec: https://github.com/near/borsh
- `planning/tasks/tee-01-persona-schema.md`
- `planning/tasks/tee-05-signer-and-report.md`
- iteration-1 review §Missing Tasks
