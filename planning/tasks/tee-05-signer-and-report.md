---
id: tee-05-signer-and-report
status: todo
sub: TEE
layer: tee
depends_on: [tee-01-persona-schema, tee-04-llm-judge]
estimate: 1.5h
demo_step: "Subscribing.Review (출력)"
---

# TEE Signer + Attestation Report 첨부

## Context
Judge 결과를 `AttestationPayload`로 빌드 → Borsh 직렬화 → Keccak256 → secp256k1 ECDSA 서명 → TDX/NVIDIA Report 첨부 → 반환.

PRD FR-TEE-8, FR-TEE-9
ERD §3.6 AttestationPayload, AttestationBundle
research: `near-ai-tee-notes.md` §3, §4

## Files
- `tee/inference/src/sign/__init__.py`
- `tee/inference/src/sign/signer.py`
- `tee/inference/src/sign/report.py`
- `tee/inference/src/sign/canonical.py`  — Borsh 직렬화 (Rust와 동일)
- `tee/inference/tests/test_signer.py`
- `tee/inference/tests/fixtures/cross_verify_vector.json`

## Spec

### Borsh 직렬화 (canonical.py)
Rust `tee-shared::AttestationPayload`와 **바이트 수준 일치** 필수.

```python
import struct
from dataclasses import dataclass

def borsh_u8(v: int) -> bytes: return struct.pack("<B", v)
def borsh_u16(v: int) -> bytes: return struct.pack("<H", v)
def borsh_u32(v: int) -> bytes: return struct.pack("<I", v)
def borsh_u64(v: int) -> bytes: return struct.pack("<Q", v)

def borsh_string(s: str) -> bytes:
    data = s.encode("utf-8")
    return borsh_u32(len(data)) + data

def borsh_fixed_array(data: bytes, n: int) -> bytes:
    assert len(data) == n
    return data

def borsh_enum(variant_idx: int, *variant_data: bytes) -> bytes:
    return borsh_u8(variant_idx) + b"".join(variant_data)

def borsh_option_some(inner: bytes) -> bytes: return b"\x01" + inner
def borsh_option_none() -> bytes: return b"\x00"

def serialize_attestation_payload(p: AttestationPayload) -> bytes:
    # account_id = String(utf8, len prefix u32)
    # u64, u16 LE
    # enum variant = u8 discriminant
    return (
        borsh_string(p.subject)
        + borsh_u64(p.policy_id)
        + borsh_u8(0 if p.verdict == "Eligible" else 1)
        + borsh_u16(p.score)
        + borsh_u64(p.issued_at)
        + borsh_u64(p.expires_at)
        + borsh_fixed_array(p.nonce, 32)
        + serialize_evidence_summary(p.evidence_summary)
        + borsh_u8(p.payload_version)
    )
```

> **필수**: `tee-shared`의 Rust 구조체와 **필드 순서가 100% 동일**해야 한다. ERD §3.6과 `contract-02`/`tee-01` 스펙을 고정 SSOT로 사용.

### Signer (signer.py) — v2, public API 사용
```python
from eth_account import Account
from eth_hash.auto import keccak
from eth_keys.datatypes import PrivateKey

class TeeSigner:
    def __init__(self, privkey_hex: str, key_id: int):
        if privkey_hex.startswith("0x"):
            privkey_hex = privkey_hex[2:]
        self._priv = PrivateKey(bytes.fromhex(privkey_hex))
        self._key_id = key_id

    @property
    def address(self) -> str:
        return self._priv.public_key.to_checksum_address()  # "0x..."

    @property
    def address_bytes(self) -> bytes:
        return bytes.fromhex(self.address[2:])  # 20 bytes

    @property
    def key_id(self) -> int:
        return self._key_id

    def sign_payload(self, payload: AttestationPayload) -> AttestationBundle:
        """Returns on-chain bundle (no tee_report)."""
        data = serialize_attestation_payload(payload)
        payload_hash = keccak(data)  # 32 bytes
        # eth_keys sign_msg_hash: raw hash 서명 (EIP-191 prefix 없음)
        sig = self._priv.sign_msg_hash(payload_hash)
        r = sig.r.to_bytes(32, "big")
        s = sig.s.to_bytes(32, "big")
        v = sig.v  # 0 or 1 (eth_keys native)
        assert v in (0, 1), f"unexpected v={v}"
        return AttestationBundle(
            payload=payload,
            payload_hash=payload_hash,
            signature_rs=r + s,
            signature_v=v,
            signing_key_id=self._key_id,
        )
```

**Wrapper 생성은 호출 측 (pipeline.py)에서**:
```python
# pipeline.py
async def sign_and_attach(
    payload: AttestationPayload,
    signer: TeeSigner,
    report_client: AttestationReportClient,
) -> AttestationBundleWithReport:
    bundle = signer.sign_payload(payload)
    tee_report = await report_client.fetch_report(
        signing_address=signer.address,
        nonce_hex=bundle.payload_hash.hex(),
    )
    return AttestationBundleWithReport(bundle=bundle, tee_report=tee_report)
```

> **왜 `eth_keys`를 쓰는가**: `eth_account.Account.signHash()`는 EIP-191 prefix를 적용한다 (`\x19Ethereum Signed Message:\n32` + hash). 우리는 raw hash에 서명해야 하므로 prefix가 없는 저수준 API(`eth_keys.PrivateKey.sign_msg_hash`)가 필요하다.
> 컨트랙트 쪽 `env::ecrecover`도 raw hash를 받으므로 여기에 맞춘다.

### Key 관리
- **MVP**: privkey는 env `TEE_SIGNER_PRIVKEY`로 주입. CVM 최초 기동 시 자동 생성 로직은 로드맵.
- **로드맵**: CVM 내부에서 `secrets.token_bytes(32)` 생성 + `/v1/attestation/report?signing_address={derived}`로 TDX binding

### Attestation Report 첨부 (report.py)
```python
import httpx

class AttestationReportClient:
    def __init__(self, base_url: str = "https://api.near.ai", model: str = "deepseek-ai/DeepSeek-V3.1"):
        self.base = base_url
        self.model = model

    async def fetch_report(self, signing_address: str, nonce_hex: str) -> bytes:
        """Fetch /v1/attestation/report.

        nonce_hex는 payload_hash.hex() — MVP는 Mode A (no TLS binding).
        TDX report_data는 nearai-cloud-verifier 규격에 따라:
            report_data[0..32]  = signing_address_bytes(20) + zero_pad(12)
            report_data[32..64] = nonce(32)
        """
        async with httpx.AsyncClient() as c:
            r = await c.get(
                f"{self.base}/v1/attestation/report",
                params={
                    "model": self.model,
                    "signing_address": signing_address,
                    "nonce": nonce_hex,
                    "signing_algo": "ecdsa",     # secp256k1 (컨트랙트와 호환)
                    # MVP: Mode A. TLS binding은 로드맵.
                    # "include_tls_fingerprint": "true",
                },
                timeout=30.0,
            )
            r.raise_for_status()
            return r.content  # JSON bytes: {signing_address, intel_quote, model_attestations, nvidia_payload}
```

### TDX report_data 인코딩 (MVP Mode A)
```
report_data (64 bytes) = signing_address_padded32 || nonce(32)
  signing_address_padded32 = address_bytes(20) + b'\x00' * 12  (right zero-pad)
  nonce                    = payload_hash (keccak256 of Borsh-serialized payload)
```

**왜 nonce = payload_hash**: TEE attestation이 "이 signing_address가 이 payload를 서명했다"를 하드웨어 수준에서 증명한다. 단일 리포트로 키 생존성 + 페이로드 바인딩을 모두 해결.

### Off-chain verifier 검증 플로우 (클라이언트/재단)
```python
# 1. fetch report
report = await client.fetch_report(signing_address, payload_hash.hex())
parsed = json.loads(report)

# 2. TDX quote 검증
intel_quote_bytes = bytes.fromhex(parsed["intel_quote"])
await dcap_qvl.get_collateral_and_verify(intel_quote_bytes)

# 3. report_data 추출 + 검증
td10 = result["report"]["TD10"]
report_data_hex = td10["report_data"]
report_data = bytes.fromhex(report_data_hex)

# Mode A
expected_addr_32 = bytes.fromhex(signing_address[2:]) + b'\x00' * 12
assert report_data[0:32] == expected_addr_32, "signing address mismatch"
assert report_data[32:64] == bytes.fromhex(payload_hash.hex()), "nonce mismatch"

# 4. NVIDIA NRAS JWT 검증 (GPU attestation)
jwt_payload = parsed["nvidia_payload"][1]
# → NRAS로 POST → 200 OK 확인

# 5. mr_config 측정값 == 배포한 Docker compose hash
assert td10["mr_config_id"] == expected_mr_config
```

> **MVP**: 컨트랙트는 report 검증 안 함 (off-chain). contract-02에서 결정.
> 클라이언트는 위 플로우를 실행해 통과한 signing_address만 owner가 set_tee_pubkey로 등록.

### 파이프라인 연결
위 §Wrapper 생성 블록 참조. `sign_and_attach()`는 `AttestationBundleWithReport`를 반환하며, 이것이 `/v1/attest` 응답 body가 된다.
클라이언트(데모 스크립트)는 `.bundle` 필드만 꺼내서 `ido-escrow.contribute()`에 전달한다.

## Acceptance Criteria
- [ ] `uv run pytest tests/test_signer.py` 성공
- [ ] Python으로 서명 + ecrecover(Python 시뮬레이션)로 address 복원 일치
- [ ] Borsh 바이트가 Rust tee-shared와 일치 (cross-verify fixture)
- [ ] fixture: Python signer + Rust verifier crate 테스트로 round-trip 성공
- [ ] v는 항상 0 또는 1
- [ ] fetch_report는 real API 호출 또는 mock 서버로 검증

## Test Cases
1. happy: 고정 privkey로 payload 서명 → ecrecover → address 일치
2. happy: 고정 fixture로 Borsh 직렬화 → 예상 hex와 일치
3. happy: report fetch 200 → bytes 반환
4. edge: payload.rationale에 multi-byte UTF-8 포함 → len prefix 정확
5. edge: v=2 들어옴 → AssertionError (내부 버그)
6. edge: report API 500 → retry → 실패 시 빈 bytes + 경고 로그 (MVP는 허용)
7. edge: payload 변조 후 서명 → recovered address 다름 (시뮬레이션)

## Cross-verify fixture 생성
- Rust 쪽에서 hard-coded Policy + Payload 예시를 직렬화해서 hex 덤프
- Python 쪽에서 동일 필드 직렬화해서 비교
- CI에서 매 PR마다 이 비교가 실행되어야 함 (regression 방지)

## References
- `planning/research/near-ai-tee-notes.md` §3, §4
- Borsh spec: https://github.com/near/borsh
- eth_account: https://eth-account.readthedocs.io/
- `planning/ERD.md` §3.6
- `planning/tasks/contract-02-attestation-verifier.md` (동일 포맷 사용)

## Open Questions
1. `/v1/attestation/report` 호출에 API key 필요한가? (CVM에서 직접 호출 시)
2. ✅ **[CLOSED iteration 4]** TDX report_data 정확한 인코딩: `address_bytes(20) + zero_pad(12) || nonce(32)` (Mode A, raw concat, no hash). 출처: nearai-cloud-verifier/py/model_verifier.py `check_report_data()`. 상세는 `planning/research/near-ai-tee-notes.md` §11.
3. signing_address의 checksum 포맷 (EIP-55)이 사용되는가? → contract-02는 raw `[u8;20]` 저장이므로 checksum 여부 무관. 단, API 응답의 `signing_address` 문자열은 checksum 포맷일 가능성 — Python에서 `.lower()` 후 hex decode 하면 안전.
