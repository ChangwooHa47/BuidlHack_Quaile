---
id: tee-02-inference-service
status: done
sub: TEE
layer: tee
depends_on: [tee-01-persona-schema]
estimate: 2h
demo_step: "Subscribing.Review"
---

# TEE Inference Service — Python FastAPI + NEAR AI Cloud 통합

## Context
투자자 Persona를 수신하고, 온체인 데이터 수집 + LLM 심사 + secp256k1 서명까지 수행하는 **TEE 안에서 동작할 서비스**.

**언어 결정**: Python (리서치 §9 결정). 이유:
- NEAR/EVM RPC 생태계 (py-near, web3.py, eth-account) 성숙
- nearai-cloud-verifier Python 경로 재사용 가능
- LLM 호출: `openai` SDK (NEAR AI Cloud는 OpenAI 호환)
- Borsh 직렬화: `borsh-construct` 또는 자체 구현

PRD: FR-TEE-1 ~ FR-TEE-12
research: `near-ai-tee-notes.md` §3~§5

## Files
- `tee/inference/pyproject.toml`
- `tee/inference/Dockerfile`                  — CVM 이미지
- `tee/inference/docker-compose.yml`          — mr_config 대응 manifest
- `tee/inference/src/main.py`                 — FastAPI 엔트리
- `tee/inference/src/config.py`
- `tee/inference/src/schemas.py`              — pydantic 모델 (tee/shared의 Rust와 1:1)
- `tee/inference/src/canonical.py`            — Borsh 직렬화 (Rust와 동일 포맷)
- `tee/inference/src/crypto.py`               — eth_account 서명
- `tee/inference/src/pipeline.py`             — 전체 심사 파이프라인
- `tee/inference/src/nearai_client.py`        — NEAR AI Cloud OpenAI client
- `tee/inference/src/ownership.py`            — EIP-191 / NEAR signature 검증
- `tee/inference/tests/test_pipeline.py`
- `tee/inference/tests/fixtures/sample_persona.json`

## Spec

### 엔드포인트
```
POST /v1/attest
Content-Type: application/json

Request body (JSON; schemas.PersonaSubmission):
{
  "near_account": "alice.testnet",
  "policy_id": 42,
  "wallets": {
    "near": [{ "account_id": "alice.testnet", "public_key": "ed25519:...", "signature": "...", "message": "...", "timestamp": ... }],
    "evm":  [{ "chain_id": 1, "address": "0x...", "signature": "0x...", "message": "...", "timestamp": ... }]
  },
  "self_intro": "...",
  "github_oauth_token": "gho_...",  // optional
  "nonce": "0x...",                 // 32 bytes hex
  "client_timestamp": 1712896800000000000
}

Response:
{
  "bundle": {
    "payload": { ... AttestationPayload ... },
    "payload_hash": "0x...",
    "signature_rs": "0x...",         // 64 bytes
    "signature_v": 0,
    "signing_key_id": 1,
    "tee_report": "<base64>"         // /v1/attestation/report에서 받은 intel_quote + nvidia_payload
  }
}
```

```
GET /v1/attestation/info
→ { signing_address: "0x...", key_id: 1, tee_report: ... }
```

```
GET /healthz
→ { status: "ok" }
```

### 파이프라인 (pipeline.py) v2

**v2 변경**:
- TEE 안에서의 `used_nonces` 체크 **제거**. nonce 중복은 `ido-escrow.contribute()`가 `used_nonces` 저장소로 처리. TEE가 체크해도 TOCTOU 발생해 의미 없음.
- `self_intro`는 LLM 옵션 A(NEAR AI Cloud)로 보낼 때 **TEE 경계를 확장**하는 의미로 사용. NFR-SEC-1과의 충돌은 아래 §LLM Trust Boundary에서 해결.

```python
async def process_persona(p: PersonaSubmission) -> AttestationBundle:
    # 1) freshness: abs(now_ns - p.client_timestamp) < 15 * 60 * 10**9
    # 2) ownership 검증 (ownership.py)
    #    - NEAR proofs: NEP-413 ed25519 verify
    #    - EVM proofs: EIP-191 personal_sign recover
    # 3) policy fetch: near_rpc.view(policy_registry, "get_policy", {"id": p.policy_id})
    #    - policy.status == Subscribing 확인
    #    - now < policy.sale_config.subscription_end 확인
    # 4) ingest (병렬):
    #    - NearIngestor.collect(near_proofs) -> List[NearWalletSignal]
    #    - EvmIngestor.collect(evm_proofs) -> (List[EvmWalletSignal], errors)
    #    - GithubIngestor.collect(token) -> Optional[GithubSignal]
    # 5) LLM 1차 (structurize): NEAR AI Cloud로 policy.natural_language 전송
    #    → StructuredRules
    # 6) LLM 2차 (judge): NEAR AI Cloud로 (rules + anon_signals + self_intro) 전송
    #    → Verdict + score + rationale
    # 7) PII leakage 검사 (rationale 후처리)
    # 8) evidence_summary 생성
    # 9) AttestationPayload 빌드
    #    - expires_at = policy.sale_config.subscription_end
    #    - nonce = p.nonce (클라이언트가 생성, 컨트랙트에서 중복 검사)
    # 10) payload_hash = keccak256(borsh_serialize(payload))
    # 11) signer.sign_payload(payload) → AttestationBundle
    # 12) fetch /v1/attestation/report?signing_address=..&nonce=payload_hash → tee_report
    # 13) wrapper로 감싼 AttestationBundleWithReport 반환
    # 14) persona 원본 (self_intro, oauth_token) 메모리 zero-out
```

### LLM Trust Boundary (v2)
**결정**: MVP는 **NEAR AI Cloud = TEE 경계의 일부**로 간주.

- 우리 CVM → NEAR AI Cloud CVM: TLS 채널 + NEAR AI Cloud의 remote attestation 검증 (`/v1/attestation/report`)
- self_intro가 우리 CVM을 떠나지만 **NEAR AI Cloud의 TEE 안**으로 들어감
- NFR-SEC-1 "원본이 TEE 밖으로 나가지 않는다"의 TEE는 **연합 TEE(우리 + NEAR AI Cloud)**로 재정의
- 이 결정은 PRD §5.1 NFR-SEC-1 comment로 문서화 필요 (iteration 3에서 반영)

**대안 (로드맵)**: 옵션 B로 전환 — self_intro를 처리할 작은 로컬 LLM을 우리 CVM에 embedding. 이 경우 NEAR AI Cloud는 structurize만 담당 (개인정보 없음).

### LLM 호출 (nearai_client.py)
```python
from openai import AsyncOpenAI

class NearAIClient:
    def __init__(self, api_key: str, base_url: str = "https://api.near.ai/v1"):
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self.model = "deepseek-ai/DeepSeek-V3.1"  # or config

    async def structurize(self, natural_language: str) -> StructuredRules:
        response = await self.client.chat.completions.create(
            model=self.model,
            temperature=0,
            messages=[
                {"role": "system", "content": STRUCTURE_PROMPT},
                {"role": "user", "content": natural_language},
            ],
            response_format={"type": "json_object"},
        )
        return StructuredRules.model_validate_json(response.choices[0].message.content)

    async def judge(self, rules: StructuredRules, signals: AggregatedSignal, self_intro: str) -> JudgeOutput:
        # ...
```

### 서명 (crypto.py) — v2: eth_keys 저수준 API
```python
from eth_keys.datatypes import PrivateKey
from eth_hash.auto import keccak

class TeeSigner:
    def __init__(self, privkey_hex: str):
        pk = privkey_hex[2:] if privkey_hex.startswith("0x") else privkey_hex
        self._priv = PrivateKey(bytes.fromhex(pk))

    @property
    def address(self) -> str:
        return self._priv.public_key.to_checksum_address()

    def sign_payload_hash(self, payload_hash: bytes) -> tuple[bytes, int]:
        """Raw sign — NOT EIP-191 prefixed. Returns (rs_64, v_0or1)."""
        assert len(payload_hash) == 32
        sig = self._priv.sign_msg_hash(payload_hash)
        rs = sig.r.to_bytes(32, "big") + sig.s.to_bytes(32, "big")
        v = sig.v  # 0 or 1 in eth_keys
        assert v in (0, 1)
        return rs, v
```

> **EIP-191 prefix 사용 안 함**: 컨트랙트가 raw `payload_hash`를 `env::ecrecover`에 직접 전달하므로, 여기도 raw hash에 서명해야 한다. `eth_account.Account.signHash()`는 내부적으로 EIP-191 prefix를 적용하므로 사용 금지. `eth_keys.PrivateKey.sign_msg_hash()`가 올바른 API.

### Borsh 직렬화 (canonical.py)
- Rust의 `tee-shared` crate와 바이트 수준 일치가 최우선
- Python에는 성숙한 borsh 라이브러리 없음 → 옵션:
  - **옵션 1**: `borsh-construct` 라이브러리 사용
  - **옵션 2**: 수동 구현 (u8/u16/u32/u64 LE, 문자열 = len(u32 LE) + bytes, Option = tag(u8) + value, enum = tag(u8) + data, struct = 필드 순서)
- **MVP: 옵션 2**. 스키마가 고정되어 있고, 수동 구현이 의존성 최소

### EIP-191 소유권 검증 (ownership.py)
> **이 구현은 `tee-03-ownership-verification.md`에서 본격 정의.** 여기서는 pipeline 레벨에서 호출만 한다.
> Canonical message는 v2 포맷: `buidl-near-ai|v1|{policy_id}|{nonce_hex}|{ts_ns}|{chain_descriptor}|{address}`
> Freshness는 ±15분. 자세한 스펙은 `tee-03-ownership-verification.md` 참조.

### Dockerfile / docker-compose
```dockerfile
FROM python:3.11-slim
RUN pip install uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen
COPY src ./src
CMD ["uv", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

`docker-compose.yml`이 `mr_config` 측정 대상 — **바이트가 고정되어야 함**. 마운트/ENV 변경이 측정값을 바꿈.

### 환경 변수 (config.py)
```
NEAR_AI_API_KEY             # NEAR AI Cloud
NEAR_AI_BASE_URL
NEAR_AI_MODEL               # default: deepseek-ai/DeepSeek-V3.1
TEE_SIGNER_PRIVKEY          # secp256k1 hex. CVM 내부 생성 권장
NEAR_RPC_URL                # testnet
EVM_RPCS_JSON               # {"1": "...", "8453": "...", ...}
POLICY_REGISTRY_ACCOUNT     # e.g. "policy.buidlnear.testnet"
IDO_ESCROW_ACCOUNT
```

## Acceptance Criteria
- [ ] `uv run pytest` 성공
- [ ] `docker build` 성공 + `docker-compose up`으로 기동
- [ ] GET `/healthz` 200
- [ ] GET `/v1/attestation/info` signing_address 반환
- [ ] POST `/v1/attest`: mock Persona → mock signal → mock LLM → bundle 반환 (end-to-end with mocks)
- [ ] `borsh-serialize(payload)`의 바이트가 Rust `tee-shared`와 동일 (test vector로 검증)
- [ ] `eth_account`로 서명 → `env::ecrecover` 시뮬레이션 (Python)에서 address 복원 일치

## Test Cases
1. happy: mock persona → mock pipeline → bundle with valid signature
2. happy: Rust tee-shared로 만든 payload_hash와 Python 구현이 동일
3. edge: client_timestamp가 30분 전 → 거부 (freshness)
4. edge: EVM signature 변조 → ownership 실패
5. edge: NEAR AI Cloud 호출 실패 → retry → 최종 500
6. edge: GitHub token 없을 때 → github_included=false로 진행
7. edge: 한 체인 RPC 실패 → partial=true로 진행

## Open Questions (후속 iteration)
1. `/v1/attest` 호출자 인증 (클라이언트 측): 필요? → MVP는 open (policy_id + nonce로 충분)
2. Rate limit: 한 IP당 분당 N건? → 데모는 필요 없음
3. TEE signer privkey 주입: CVM 내부 생성 vs env 주입 → 생성 패턴(최초 기동 시 생성 + attestation에 포함)
4. 로그 레벨: 개인정보 마스킹 정책 → self_intro, oauth token, signature 원본 로그 금지
5. `openai` SDK가 내부에서 stream=false로 동작하는지 확인
6. NEAR AI API key 발급 방법 (리서치 후속)

## References
- `planning/research/near-ai-tee-notes.md`
- `planning/ERD.md` §3.3, §3.4, §3.6
- `planning/PRD.md` FR-TEE-*, NFR-SEC-*
- eth_account docs: https://eth-account.readthedocs.io/
- OpenAI Python SDK: https://github.com/openai/openai-python
- NEAR AI Cloud blog (OpenAI compat): https://near.ai/blog/introducing-near-ai-cloud-private-chat
