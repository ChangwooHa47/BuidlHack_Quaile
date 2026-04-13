# TEE Evaluation Logic — LLM Judge Design

> 팀원 공유용 문서. TEE 안에서 투자자 페르소나를 심사하는 LLM 파이프라인의 기준과 프롬프트 구조를 정리합니다.
> 구현 위치: `tee/inference/` (Python FastAPI, tee-04 태스크)

---

## 1. 파이프라인 개요

```
Policy.natural_language
        │
        ▼
┌─────────────────────┐
│  Stage 1: Structurize│  LLM Call #1
│  자연어 → StructuredRules│
└─────────────────────┘
        │  (min thresholds + qualitative_prompt + weights)
        ▼
┌─────────────────���───┐
│  Stage 2: Judge     │  LLM Call #2
│  AggregatedSignal + │
│  StructuredRules    │
│  → verdict + score  │
│    + rationale      │
└─────────────────────┘
        │
        ▼
  AttestationPayload (서명 후 반환)
```

두 번의 LLM 호출로 분리하는 이유:
- **Stage 1** 결과(`StructuredRules`)는 Policy가 등록된 이후 캐싱 가능 → 반복 심사 시 재사용
- **Stage 2** 호출에는 투자자 데이터가 포함되어 개인화 필수

---

## 2. 입력 데이터 구성

### Stage 1 입력
```
{policy.natural_language}
```

### Stage 2 입력 (`anon_summary`)

투자자 신원을 특정할 수 없는 집계값만 포함. 개별 지갑 주소/잔액 원본은 절대 포함하지 않음.

```json
{
  "wallet_count_near": 2,
  "wallet_count_evm": 3,
  "avg_holding_days": 487,
  "max_holding_days": 710,
  "total_txs": 1240,
  "total_dao_votes": 8,
  "has_defi_tokens": true,
  "has_nft_history": false,
  "github_included": true,
  "github_contributions_last_year": 42,
  "github_account_age_days": 1200,
  "github_primary_languages": ["Rust", "TypeScript"],
  "partial_data": false,
  "self_intro_word_count": 87
}
```

> **프라이버시 경계**: `self_intro` 원문, 지갑 주소, GitHub 로그인은 절대 Stage 2 프롬프트에 포함하지 않는다.
> self_intro는 단어 수(`self_intro_word_count`)만 신호로 사용한다.

---

## 3. Stage 1 프롬프트 구조 (Structurize)

```
System:
You are an IDO policy analyst. Convert the foundation's natural-language investor
selection policy into structured evaluation rules. Output valid JSON only.

User:
Policy: "{natural_language}"

Output JSON schema:
{
  "min_wallet_holding_days": <integer|null>,
  "min_wallet_age_days": <integer|null>,
  "min_total_tx_count": <integer|null>,
  "min_dao_votes": <integer|null>,
  "min_github_contributions": <integer|null>,
  "required_token_holdings": [<string>, ...],
  "qualitative_prompt": "<string: concise instruction for the judge call>",
  "weights": {
    "quantitative": <float 0-1>,
    "qualitative": <float 0-1>
    // quantitative + qualitative must equal 1.0
  }
}

Rules:
- Only include thresholds explicitly mentioned or clearly implied by the policy.
- Leave unmentioned fields as null or [].
- qualitative_prompt must be ≤200 characters and must not instruct the LLM to reveal PII.
- weights reflect the balance between hard thresholds and holistic judgment.
```

### Stage 1 예시

**Input Policy**: "장기 보유 성향이 강한 홀더 대상. NEAR 생태계에 깊이 참여한 사람을 선호함."

**Expected StructuredRules**:
```json
{
  "min_wallet_holding_days": 180,
  "min_wallet_age_days": null,
  "min_total_tx_count": null,
  "min_dao_votes": null,
  "min_github_contributions": null,
  "required_token_holdings": ["NEAR"],
  "qualitative_prompt": "Prefer investors with deep NEAR ecosystem participation and long-term holding behavior.",
  "weights": { "quantitative": 0.6, "qualitative": 0.4 }
}
```

---

## 4. Stage 2 프롬프트 구조 (Judge)

```
System:
You are a neutral investor evaluation judge for an IDO. Your task is to assess
whether an anonymous investor meets a foundation's criteria. You will receive
aggregated on-chain and off-chain signals — no personally identifiable information.

You must output valid JSON only with exactly these fields:
{
  "verdict": "Eligible" | "Ineligible",
  "score": <integer 0-10000>,  // basis points: 10000 = perfect match
  "rationale": "<string ≤280 chars>"
}

Rules:
- score 8000+ → Eligible (unless a hard threshold is violated)
- Hard threshold violations → Ineligible regardless of score
- rationale must not contain wallet addresses, GitHub usernames, email, or
  verbatim excerpts from any self-introduction text.
- Be consistent: same signals should produce the same verdict.

User:
Evaluation criteria:
{structured_rules_json}

Investor anonymous signal:
{anon_summary_json}
```

---

## 5. 정량 판단 로직 (Pre-LLM 하드 체크)

Stage 2 LLM 호출 전에 Python 코드에서 하드 임계값을 먼저 검사한다.
LLM에게 맡기면 비결정적이기 때문.

```python
def check_hard_thresholds(rules: StructuredRules, signal: AggregatedSignal) -> bool:
    if rules.min_wallet_holding_days:
        avg = compute_avg_holding_days(signal)
        if avg < rules.min_wallet_holding_days:
            return False  # → Ineligible (hard fail)
    if rules.min_dao_votes:
        total = sum(len(w.dao_votes) for w in signal.near)
        if total < rules.min_dao_votes:
            return False
    # ... (min_total_tx_count, min_github_contributions 등)
    return True
```

하드 체크 실패 시: `verdict = Ineligible, score = 0, rationale = "Quantitative threshold not met."` 고정 반환. LLM 호출 생략.

---

## 6. PII 필터 (서명 전 최종 검사)

`rationale`은 TEE 서명 전에 PII 필터를 통과해야 한다.

```python
PII_PATTERNS = [
    r'\b0x[0-9a-fA-F]{40}\b',          # EVM address
    r'\b[a-z0-9_\-]{2,64}\.near\b',    # NEAR account
    r'\b[a-z0-9\-]+\.testnet\b',        # testnet account
    r'github\.com/[^\s]+',              # GitHub URL
    r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',  # email
]

def is_pii_clean(rationale: str, self_intro: str) -> bool:
    for pattern in PII_PATTERNS:
        if re.search(pattern, rationale):
            return False
    # substring match against self_intro words (>= 4 chars)
    for word in self_intro.split():
        if len(word) >= 4 and word.lower() in rationale.lower():
            return False
    return True
```

필터 실패 시: rationale을 `"Evaluation complete."` 고정 문자열로 교체 후 서명.

---

## 7. LLM 모델 설정

| 항목 | 값 |
|------|-----|
| Endpoint | NEAR AI Cloud OpenAI-compatible API |
| Model | `meta-llama/Llama-3.3-70B-Instruct` (또는 동급 최신) |
| Temperature | `0.0` (결정적 출력) |
| Max tokens (Stage 1) | 512 |
| Max tokens (Stage 2) | 256 |
| Retry | 최대 3회 (지수 백오프) |
| Remote attestation | Stage 2 호출 전 `/v1/attestation/report`로 NEAR AI Cloud CVM 원격 증명 |

> **신뢰 경계**: `self_intro`, `github_oauth_token` 등 민감 데이터는 NEAR AI Cloud CVM이 원격 증명(remote attestation)을 통과한 이후에만 전송한다. 상세는 `planning/research/near-ai-tee-notes.md` §5 참조.

---

## 8. 미확정 사항 (TODO — 구현 중 결정)

- [ ] Stage 1 결과 캐싱 전략 (Policy 등록 시 1회 실행 vs 매 심사 시)
- [ ] `anon_summary`에 `self_intro_word_count` 외 텍스트 시그널 추가 여부
- [ ] Score 정규화 방식 (quantitative partial score + qualitative score 합산 공식)
- [ ] LLM 모델 버전 고정 방법 (model hash? 버전 핀)
