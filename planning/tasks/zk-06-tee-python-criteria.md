---
id: zk-06-tee-python-criteria
status: done
sub: TEE
layer: tee
depends_on: ["zk-02-shared-criteria-types"]
estimate: 1.5h
demo_step: "Subscribing.Review"
---

# TEE Python: LLM 프롬프트 + 파이프라인을 criteria 기반으로 전환

## Context
TEE LLM judge가 점수(score) 대신 항목별 pass/fail을 뱉도록 전환. 재단의 자연어 Policy → 평가 항목(criteria) N개 생성 → 항목별 yes/no 판정.

기존 2-stage LLM (structurize → judge)은 유지하되:
- structurize: StructuredRules(정량 threshold + 정성 prompt) → CriteriaRules(항목 목록)
- judge: score 산출 → 항목별 pass/fail 판정

계획 문서: `docs/superpowers/plans/2026-04-15-zk-eligibility-migration.md` Task 6

## Files
- `tee/inference/src/schemas.py` (modify)
- `tee/inference/src/nearai_client.py` (modify)
- `tee/inference/src/pipeline.py` (modify)
- `tee/inference/src/canonical.py` (modify)
- `tee/inference/tests/test_pipeline.py` (modify)

## Spec

### schemas.py 변경

**제거:**
- `RuleWeightsModel`
- `StructuredRulesModel`
- `EvidenceSummaryModel`
- `JudgeOutputModel`의 `score`, `quantitative_score`, `qualitative_score` 필드

**추가/교체:**
```python
class CriterionResult(BaseModel):
    description: str
    passed: bool

class JudgeOutputModel(BaseModel):
    verdict: Literal["Eligible", "Ineligible"]
    criteria: list[CriterionResult]
    rationale: str  # 디버깅/로깅용, 온체인에는 안 올라감

class CriteriaRulesModel(BaseModel):
    criteria: list[str]       # 평가 항목 설명 목록
    qualitative_prompt: str   # LLM 정성 평가 프롬프트

class CriteriaResultsModel(BaseModel):
    results: list[bool]  # 길이 = MAX_CRITERIA(10), 패딩은 True
    count: int

class AttestationPayloadModel(BaseModel):
    subject: str
    policy_id: int
    verdict: Literal["Eligible", "Ineligible"]
    # score 제거됨
    issued_at: int
    expires_at: int
    nonce: bytes
    criteria_results: CriteriaResultsModel  # evidence_summary 대체
    payload_version: int  # 2
```

### nearai_client.py 변경

**STRUCTURE_PROMPT 교체:** 정량/정성 threshold 대신 yes/no 평가 항목 목록 추출.
```
Output STRICT JSON:
{
  "criteria": ["criterion 1 description", ...],
  "qualitative_prompt": "..."
}
```
- 최대 10개
- 각 항목은 yes/no로 판정 가능해야 함

**JUDGE_PROMPT 교체:** 각 criterion에 대해 passed: true/false 판정.
```
Output STRICT JSON:
{
  "verdict": "Eligible" | "Ineligible",
  "criteria": [{"description": "...", "passed": true/false}, ...],
  "rationale": "..." (≤280 chars, NO PII)
}
```
- verdict=Eligible ⇔ 전부 pass

**메서드 시그니처:**
```python
async def structurize(self, natural_language: str) -> CriteriaRulesModel: ...
async def judge(self, rules: CriteriaRulesModel, signals: AggregatedSignalModel, self_intro: str) -> JudgeOutputModel: ...
```

### pipeline.py 변경

**제거:**
- `build_evidence_summary()` 함수 전체
- `validate_judge_output()`의 score 범위 검증

**추가/교체:**
```python
MAX_CRITERIA = 10
RATIONALE_MAX_CHARS = 280

def validate_judge_output(out: JudgeOutputModel, self_intro: str) -> None:
    # criteria 개수 검증: 1..=MAX_CRITERIA
    # rationale 길이 + PII 검사 (기존과 동일)
    # verdict ↔ all_pass 정합성 검증

def build_criteria_results(out: JudgeOutputModel) -> CriteriaResultsModel:
    # out.criteria → bool 배열 추출
    # MAX_CRITERIA까지 True 패딩
```

`process_persona()`에서:
```python
criteria_results = build_criteria_results(judge_out)
payload = AttestationPayloadModel(
    ...,
    criteria_results=criteria_results,
    payload_version=2,
)
```

### canonical.py 변경

```python
def serialize_criteria_results(cr: CriteriaResultsModel) -> bytes:
    # [bool; 10] (고정 크기, length prefix 없음) + u8(count)
    buf = b""
    for r in cr.results:
        buf += borsh_bool(r)
    buf += borsh_u8(cr.count)
    return buf

def serialize_attestation_payload(payload: AttestationPayloadModel) -> bytes:
    # score 제거, evidence_summary → criteria_results
```

**Borsh 필드 순서 (Rust와 반드시 일치):**
1. subject (string)
2. policy_id (u64)
3. verdict (enum u8)
4. issued_at (u64)
5. expires_at (u64)
6. nonce ([u8; 32])
7. criteria_results (CriteriaResults)
8. payload_version (u8)

## Acceptance Criteria
- [ ] `cd tee/inference && uv run pytest -v` 전부 통과
- [ ] `StructuredRulesModel`, `RuleWeightsModel`, `EvidenceSummaryModel` 코드에서 완전 제거
- [ ] LLM structurize 프롬프트가 criteria 목록 반환
- [ ] LLM judge 프롬프트가 항목별 pass/fail 반환
- [ ] verdict=Eligible인데 fail 항목 있으면 → `LlmJudgeFailed` 예외
- [ ] canonical.py Borsh 필드 순서가 Rust attestation.rs와 일치

## Test Cases
1. happy: 3개 criteria 전부 pass → verdict=Eligible, criteria_results.count=3
2. happy: 3개 중 1개 fail → verdict=Ineligible
3. fail: verdict=Eligible인데 criteria에 fail 있음 → LlmJudgeFailed
4. fail: criteria 0개 → LlmJudgeFailed
5. fail: criteria 11개 → LlmJudgeFailed
6. PII: rationale에 ETH 주소 → PiiLeakError (기존 테스트 유지)
7. canonical: Borsh serialize → keccak256 → 결과가 예측 가능

## 코드리뷰 체크포인트
이 태스크 완료 후 반드시:
1. `grep -r "StructuredRulesModel\|RuleWeightsModel\|EvidenceSummaryModel\|quantitative_score\|qualitative_score" tee/inference/` → 결과 없음
2. canonical.py의 Borsh 필드 순서가 `tee/shared/src/attestation.rs`의 struct 필드 순서와 정확히 일치
3. nearai_client.py의 프롬프트에서 PII 유출 방지 지시가 유지되는지

## References
- 계획 문서 Task 6
- 기존 schemas.py: `tee/inference/src/schemas.py`
- 기존 nearai_client.py: `tee/inference/src/nearai_client.py`
- 기존 pipeline.py: `tee/inference/src/pipeline.py`
- 기존 canonical.py: `tee/inference/src/canonical.py`
