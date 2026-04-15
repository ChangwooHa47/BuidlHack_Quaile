---
id: tee-04-llm-judge
status: superseded
sub: TEE
layer: tee
depends_on: [tee-02-inference-service, tee-03-ownership-verification, ingest-01-near-rpc, ingest-02-evm-multichain, ingest-03-github]
estimate: 2h
demo_step: "Subscribing.Review (핵심)"
---

# LLM 심사 — Policy Structurizer + Verdict Judge

## Context
수집된 signals + Policy의 natural_language를 LLM이 두 번 호출해서 판정한다.

**2단계**:
1. **Structurize**: natural_language → `StructuredRules` (정형화)
2. **Judge**: signals + StructuredRules → `Verdict + score + rationale`

PRD FR-TEE-6, FR-TEE-7, FR-TEE-11
ERD §3.5 StructuredRules, §3.6 EvidenceSummary

## Files
- `tee/inference/src/judge/__init__.py`
- `tee/inference/src/judge/structurize.py`
- `tee/inference/src/judge/verdict.py`
- `tee/inference/src/judge/prompts.py`
- `tee/inference/tests/test_judge.py`

## Spec

### Pydantic 모델 (LLM structured output)
```python
class StructuredRules(BaseModel):
    min_wallet_holding_days: int | None = None
    min_wallet_age_days: int | None = None
    min_total_tx_count: int | None = None
    min_dao_votes: int | None = None
    min_github_contributions: int | None = None
    required_token_holdings: list[str] = []
    qualitative_prompt: str
    weights: RuleWeights

class RuleWeights(BaseModel):
    quantitative: float = 0.6
    qualitative: float = 0.4

class JudgeOutput(BaseModel):
    verdict: Literal["Eligible", "Ineligible"]
    score: int  # 0..=10000
    rationale: str  # ≤ 280 chars
    quantitative_score: int
    qualitative_score: int
```

### Structurize prompt (prompts.py)
```python
STRUCTURE_PROMPT = """You are a policy structurizer for an IDO launchpad.
Given a foundation's natural language criterion for selecting investors, extract:
- Quantitative rules (numeric thresholds)
- A qualitative prompt that captures the INTENT for later LLM judgment
- Weights between quantitative and qualitative evaluation

Output STRICT JSON matching this schema:
{
  "min_wallet_holding_days": int | null,
  "min_wallet_age_days": int | null,
  "min_total_tx_count": int | null,
  "min_dao_votes": int | null,
  "min_github_contributions": int | null,
  "required_token_holdings": [string],
  "qualitative_prompt": string,
  "weights": {"quantitative": float, "qualitative": float}
}

Rules:
- Leave numeric thresholds as null if not implied by the text.
- weights must sum to 1.0.
- qualitative_prompt should guide a later LLM judge; include specific behavioral traits.
- No preamble, no explanation. JSON ONLY.
"""
```

### Judge prompt
```python
JUDGE_PROMPT = """You are an IDO investor evaluator running inside a Trusted Execution Environment.
You are given:
- A foundation's criterion (already structurized)
- Aggregated on-chain signals (anonymized)
- Optional GitHub activity summary
- Optional self-introduction text

Output STRICT JSON:
{
  "verdict": "Eligible" | "Ineligible",
  "score": int (0..=10000),
  "rationale": string (≤ 280 chars, NO PII, NO wallet addresses, NO GitHub username, NO real-name references),
  "quantitative_score": int (0..=10000),
  "qualitative_score": int (0..=10000)
}

Guidance:
- First apply quantitative rules (hard minimums). If any fail, verdict=Ineligible.
- Then evaluate qualitative_prompt against signals.
- Final score = weights.quantitative * quantitative_score + weights.qualitative * qualitative_score.
- Threshold: score >= 5000 → Eligible.
- rationale must explain the decision WITHOUT revealing any identifying data.
"""
```

### 호출 (structurize.py)
```python
async def structurize(nl: str, client: NearAIClient) -> StructuredRules:
    for attempt in range(3):
        try:
            resp = await client.chat(
                system=STRUCTURE_PROMPT,
                user=nl,
                temperature=0,
                response_format={"type": "json_object"},
            )
            rules = StructuredRules.model_validate_json(resp.content)
            if not (0.99 < rules.weights.quantitative + rules.weights.qualitative < 1.01):
                raise ValueError("weights don't sum to 1")
            return rules
        except (ValidationError, ValueError) as e:
            if attempt == 2:
                raise LlmStructurizeFailed(str(e))
            continue
```

### Judge (verdict.py)
```python
async def judge(
    rules: StructuredRules,
    signals: AggregatedSignal,
    self_intro: str,
    client: NearAIClient,
) -> JudgeOutput:
    # 1. Build anonymized signal summary
    summary = build_anon_summary(signals)
    payload = {
        "rules": rules.model_dump(),
        "signals": summary,
        "self_intro": self_intro[:2000],
    }
    resp = await client.chat(
        system=JUDGE_PROMPT,
        user=json.dumps(payload),
        temperature=0,
        response_format={"type": "json_object"},
    )
    return JudgeOutput.model_validate_json(resp.content)

def build_anon_summary(signals: AggregatedSignal) -> dict:
    """개인 식별 가능한 필드(address, account_id, login) 제거."""
    from statistics import mean
    all_holding_days = [w.holding_days for w in signals.near] + [w.holding_days for w in signals.evm]
    return {
        "near_wallet_count": len(signals.near),
        "evm_wallet_count": len(signals.evm),
        "max_holding_days": max(all_holding_days, default=0),
        "avg_holding_days": int(mean(all_holding_days)) if all_holding_days else 0,
        "total_tx_count": sum(w.tx_count for w in signals.evm) + sum(w.total_txs for w in signals.near),
        "dao_votes": sum(len(w.dao_votes) for w in signals.near),
        "github_contribs": signals.github.contributions_last_year if signals.github else 0,
        "github_account_age_days": signals.github.account_age_days if signals.github else 0,
        "partial": signals.partial,
    }
```

### 후처리 검증
```python
def validate_judge_output(out: JudgeOutput) -> None:
    assert 0 <= out.score <= 10000
    assert len(out.rationale) <= 280
    # PII leakage 검사: address, @handle, email 형식 정규식 매칭 시 거부
    if RE_ETH_ADDR.search(out.rationale): raise PiiLeakError("ETH address in rationale")
    if RE_NEAR_ACC.search(out.rationale): raise PiiLeakError("NEAR account in rationale")
    if RE_EMAIL.search(out.rationale):    raise PiiLeakError("email in rationale")
    if RE_URL.search(out.rationale):      raise PiiLeakError("URL in rationale")
```

### 결정성
- `temperature=0`, `top_p=1` 고정
- 동일 입력 → 동일 출력 (이상적)
- 비결정성이 있으면 최대 2회 재시도

### 에러
```python
class LlmStructurizeFailed(Exception): ...
class LlmJudgeFailed(Exception): ...
class PiiLeakError(Exception): ...
```

## Acceptance Criteria
- [ ] `uv run pytest tests/test_judge.py` 성공
- [ ] Mock LLM 응답으로 structurize → rules 생성
- [ ] Mock LLM 응답으로 judge → JudgeOutput
- [ ] 잘못된 JSON 3회 → LlmStructurizeFailed
- [ ] rationale에 ETH address 포함 → PiiLeakError
- [ ] 실제 NEAR AI Cloud 호출 (옵션 integration test)

## Test Cases
1. happy: "long-term holders of NEAR with > 500 days" → min_wallet_holding_days=500, required_token=["NEAR"]
2. happy: 기준 만족하는 signals → Eligible + score>5000
3. happy: 기준 미달 → Ineligible
4. edge: weights가 0.7+0.2 (합 0.9) → 재시도 후 실패 → LlmStructurizeFailed
5. edge: rationale에 "0xabcd..." 포함 → PiiLeakError
6. edge: LLM이 verdict=Eligible인데 score<5000 → 후처리 assert 실패 → 재시도
7. edge: partial=true signal → LLM이 rationale에 "limited data" 언급 가능

## References
- `planning/PRD.md` FR-TEE-6, FR-TEE-7
- `planning/ERD.md` §3.5, §3.6
- OpenAI structured outputs: https://platform.openai.com/docs/guides/structured-outputs

## Open Questions
1. DeepSeek-V3.1이 response_format json_object를 지원하는가? 확인 필요.
2. 모델 선택: DeepSeek-V3.1 vs Llama vs 작은 모델. 결정성/품질/비용 trade-off.
3. 한국어 Policy 지원? → MVP는 영어. 한국어 Policy는 구조화 단계에서 영어로 번역 후 진행.
4. Few-shot examples를 프롬프트에 포함해야 하는가? → 안정성을 위해 포함 권장 (iteration 2에서)
