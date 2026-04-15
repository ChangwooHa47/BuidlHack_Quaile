---
id: zk-07-tee-zk-input-response
status: done
sub: TEE
layer: tee
depends_on: ["zk-06-tee-python-criteria"]
estimate: 45m
demo_step: "Subscribing.Review"
---

# TEE 응답에 ZK circuit 입력 포함

## Context
TEE `/v1/attest` 응답에 클라이언트가 snarkjs로 groth16 proof를 생성하는 데 필요한 정보(`zk_input`)를 추가.

클라이언트 플로우: TEE 응답 수신 → `zk_input`으로 snarkjs witness 계산 → proof 생성 → 온체인 contribute() 호출

계획 문서: `docs/superpowers/plans/2026-04-15-zk-eligibility-migration.md` Task 7

## Files
- `tee/inference/src/schemas.py` (modify)
- `tee/inference/src/pipeline.py` (modify)
- `tee/inference/src/main.py` (modify)
- `tee/inference/tests/test_pipeline.py` (modify)

## Spec

### schemas.py 추가

```python
class ZkCircuitInputModel(BaseModel):
    """클라이언트가 snarkjs로 proof 생성할 때 쓰는 입력."""
    payload_hash_limbs: list[str]  # 4개의 64-bit limb (decimal string)
    criteria: list[int]            # [1,1,1,0,...] MAX_CRITERIA개, 0 or 1
    criteria_count: str            # decimal string

class AttestationResponseModel(BaseModel):
    """TEE /v1/attest 엔드포인트의 전체 응답."""
    bundle: AttestationBundleModel
    tee_report: bytes      # base64 직렬화
    zk_input: ZkCircuitInputModel
```

### pipeline.py 추가

```python
def payload_hash_to_limbs(h: bytes) -> list[str]:
    """32-byte hash → 4 x 64-bit limbs (big-endian per limb)."""
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

`process_persona` 반환 타입: `AttestationBundleWithReportModel` → `AttestationResponseModel`
```python
async def process_persona(...) -> AttestationResponseModel:
    ...
    zk_input = build_zk_input(digest, criteria_results)
    return AttestationResponseModel(bundle=bundle, tee_report=tee_report, zk_input=zk_input)
```

### main.py 변경
```python
@app.post("/v1/attest", response_model=AttestationResponseModel)
async def attest(persona: PersonaSubmission) -> AttestationResponseModel:
    # 기존과 동일, 반환 타입만 변경
```

### zk_input 형식 예시
```json
{
  "payload_hash_limbs": ["1234567890123456", "9876543210987654", "1111111111111111", "2222222222222222"],
  "criteria": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  "criteria_count": "6"
}
```

## Acceptance Criteria
- [ ] `cd tee/inference && uv run pytest -v` 전부 통과
- [ ] `/v1/attest` 응답에 `zk_input` 필드 포함
- [ ] `zk_input.payload_hash_limbs`가 4개의 decimal string
- [ ] `zk_input.criteria`가 MAX_CRITERIA(10)개의 0/1 배열
- [ ] `zk_input.criteria_count`가 실제 criteria 개수의 decimal string
- [ ] `AttestationBundleWithReportModel`이 더 이상 엔드포인트 반환 타입으로 사용되지 않음

## Test Cases
1. happy: `payload_hash_to_limbs(bytes(32))` → 4개 limb, 각각 valid decimal
2. happy: `build_zk_input` → criteria=[1,1,...], count=str(N)
3. edge: 32-byte hash all zeros → limbs 전부 "0"
4. edge: 32-byte hash all 0xff → limbs 전부 큰 수 (2^64 - 1)
5. integration: `process_persona` mock → 응답에 `zk_input` 포함 확인

## 코드리뷰 체크포인트
이 태스크 완료 후 반드시:
1. `payload_hash_to_limbs`의 endianness가 circom circuit의 기대와 일치하는지 (big-endian per limb)
2. `zk_input.criteria` 배열 길이가 항상 10(MAX_CRITERIA)인지
3. main.py의 response_model이 `AttestationResponseModel`로 변경되었는지

## References
- 계획 문서 Task 7
- circom circuit: `circuits/eligibility.circom` (payload_hash_limbs 사용 방식)
