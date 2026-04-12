# NEAR AI Cloud TEE — Research Notes

> 2026-04-12, iteration 1
> Source of truth: `docs.near.ai`, `github.com/nearai/private-ml-sdk`, `github.com/nearai/nearai-cloud-verifier`, `github.com/near-examples/nearai-cloud-verification-example`
> **이 노트는 PRD §4.4 / §5.1, ERD §3.6, contract-02, tee-02 태스크의 근거가 된다.**

---

## 1. TL;DR

- NEAR AI Cloud는 **Intel TDX + NVIDIA GPU TEE** 조합으로 LLM을 confidential하게 실행한다
- 추론 API는 **OpenAI 호환** (`/v1/chat/completions` 등) — Python/TS SDK 제공
- **Attestation 엔드포인트**: `GET /v1/attestation/report` — Intel TDX + NVIDIA NRAS 증명을 반환
- 서명 키는 **secp256k1 ECDSA** (Ethereum 스타일). `signing_address`는 `0x...` 20-byte 주소
- TDX `report_data`에 `signing_address + nonce`가 바인딩되어, "이 키가 정말 이 TEE 안에서 생성됐다"를 증명
- 클라이언트는 **TDX quote를 `dcap-qvl`로 검증**하고, **NVIDIA JWT를 NRAS로 검증**해서 TEE 환경을 신뢰한다

---

## 2. 아키텍처 (레이어)

```
┌──────────────────────────────────────────────────┐
│ Client (Python/TS SDK 또는 OpenAI-compatible)    │
│  - nonce 생성                                      │
│  - /v1/attestation/report 호출                    │
│  - TDX quote + NVIDIA JWT 검증                    │
│  - 검증 통과 시에만 prompt 전송                    │
└──────────────────────────────────────────────────┘
                       │
                       │ TLS (binding to TEE attestation)
                       ▼
┌──────────────────────────────────────────────────┐
│ Private LLM Node (Intel TDX CVM)                  │
│  - TLS 종단이 TEE 내부                             │
│  - 추론 = NVIDIA GPU TEE에서 실행                  │
│  - 모델 가중치 하드웨어 격리                         │
│  - 서명 키(secp256k1)는 CVM 생성 시 내부에서 생성     │
│  - report_data = keccak256(signing_addr || nonce) │
└──────────────────────────────────────────────────┘
```

---

## 3. Attestation API

### 3.1 요청

```
GET /v1/attestation/report?include_tls_fingerprint=true&signing_address={addr}&nonce={nonce_hex}
```

- `signing_address`: 0x-prefixed Ethereum 20-byte address (checksum)
- `nonce`: 클라이언트가 생성하는 fresh 값 (hex)
- `include_tls_fingerprint`: `true`면 TLS 채널과 attestation을 바인딩

### 3.2 응답 (관측된 구조)

```json
{
  "signing_address": "0x...",
  "intel_quote": "<hex-encoded Intel TDX quote>",
  "model_attestations": [
    {
      "signing_address": "0x...",
      "intel_quote": "<hex>"
    }
  ],
  "nvidia_payload": ["JWT", "<token_string>"]
}
```

- `intel_quote`: TDX Quote v4/v5. `dcap-qvl`로 검증 가능
- `model_attestations`: 모델별 키 (model_attestations[i].signing_address)
- `nvidia_payload`: NVIDIA NRAS로 보낼 JWT. `jose` 라이브러리로 디코딩

### 3.3 검증 순서 (클라이언트 쪽)

1. Generate fresh `nonce`, compute expected `signing_address` (알려진 값이면 기대값과 비교)
2. GET `/v1/attestation/report?...`
3. `intel_quote`를 `dcap-qvl`로 TDX verify → `report_data` 추출
4. `report_data == keccak256(signing_address || nonce)` 확인 (정확한 포맷은 SDK 내부 참조 필요)
5. TDX quote의 `mr_td`, `mr_config` 측정값이 기대값(재단이 배포한 Docker compose 해시)과 일치하는지 확인
6. `nvidia_payload` JWT를 NVIDIA NRAS에 POST → "이 GPU가 confidential 모드로 실행 중"임을 검증
7. 검증 전부 통과 시에만 이 `signing_address`를 신뢰

### 3.4 온체인 검증 시 간소화 옵션 (MVP)

**완전한 TDX quote 검증은 wasm 환경에서 무거움** (ASN.1 파싱, PCCS 체크, Intel 인증서 체인 등). MVP는:

- **옵션 A (권장)**: 컨트랙트는 단순히 `signing_address`에 대한 ECDSA 서명만 검증. TDX quote의 하드웨어 신뢰는 **off-chain verifier**(프론트 또는 재단 운영 서버)가 먼저 검증하고, 통과한 `signing_address`를 owner가 `attestation-verifier`에 등록한다.
- **옵션 B (로드맵)**: `dcap-qvl`을 wasm 포팅하거나 light client 패턴으로 온체인 TDX 검증.

> MVP는 **옵션 A**로 간다. PRD §7 리스크 참조.

---

## 4. 서명 알고리즘 결정: **secp256k1 ECDSA (Ethereum-style)**

### 근거
- `nearai-cloud-verifier` Python: `eth-account` 사용
- `nearai-cloud-verifier` TS: `ethers` 사용
- 응답의 `signing_address`가 `0x...` 20-byte Ethereum 주소

### NEAR 컨트랙트 영향
- NEAR SDK의 `env::ed25519_verify`로는 **불가능**
- NEAR SDK는 `env::ecrecover(hash: [u8;32], sig: [u8;64], v: u8, malleability_flag: bool) -> Option<[u8;64]>` 제공 — secp256k1 복원
- 흐름:
  1. `payload_hash = keccak256(borsh_serialize(payload))`
  2. `ecrecover(payload_hash, sig[0..64], sig[64], true)` → 64바이트 uncompressed pubkey
  3. `address = keccak256(pubkey)[12..32]` (마지막 20바이트)
  4. `address == stored_signing_address` 이면 유효

### 이 발견이 바꾸는 것
- **ERD §3.6** `AttestationBundle`:
  - `signature: Vec<u8>` → **`[u8; 65]`** (r||s||v)
  - `tee_pubkey_id: u32` 유지 + **`signing_address: [u8; 20]`** 추가 (또는 pubkey_id 대신 address를 직접)
- **contract-02-attestation-verifier**:
  - 저장: `signing_addresses: LookupMap<u32, [u8; 20]>` (키 인덱스 → address)
  - 검증: `env::ecrecover` + address 비교

---

## 5. 추론 API (OpenAI 호환)

```
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer <api_key>   # 인증 방식은 추가 확인 필요

{
  "model": "deepseek-ai/DeepSeek-V3.1",
  "messages": [{"role": "user", "content": "..."}],
  "temperature": 0
}
```

- 응답은 OpenAI chat completion 포맷
- **핵심**: 응답 자체가 TEE 서명을 포함하는지, 아니면 `/v1/attestation/report`를 별도로 호출해서 검증해야 하는지는 추가 확인 필요. 현재로서는 **별도 호출 모델**로 가정.
- **chat 서명**: `getChatMessageSignature(chatId, modelId)` 같은 SDK 함수가 있음 → 구체 엔드포인트는 아직 확인 못함 (로드맵)

### MVP 구현 전략

- 우리 TEE 추론 노드는 **NEAR AI Cloud를 LLM 추론의 BLACK BOX로 사용**하지 않는다.
- 대신: **자체 TEE 환경**(CVM 또는 nearai/private-ml-sdk 기반)을 띄우고, 그 안에서
  - 데이터 수집 (RPC 호출)
  - OpenAI 호환 API로 NEAR AI Cloud 호출 (또는 TEE 내부에 embedding된 모델)
  - AttestationPayload 생성 + secp256k1 서명
- 왜: 우리가 서명해야 할 것은 **LLM 출력이 아니라 "심사 결과 + 증거 요약"** 이고, 이건 우리 TEE가 관장해야 함
- NEAR AI Cloud의 역할: **LLM 추론 엔진** (optional). 원격 추론 대신 TEE 내부에 작은 모델을 동봉하는 옵션도 있음.

---

## 6. 배포 모델 옵션

### 옵션 A: NEAR AI Cloud의 Private Inference를 사용 (LLM만 위탁)
- 우리 코드: 독립 CVM (Intel TDX) — 데이터 수집, 서명, 엔드포인트 노출
- LLM 호출: `openai` SDK로 NEAR AI Cloud `/v1/chat/completions` 호출
- 장점: 모델 업데이트/운영 위탁
- 단점: LLM 호출 내용을 cloud로 보내야 함 (우리 CVM → NEAR AI Cloud 네트워크 경로가 TEE 간 attestation으로 연결돼야 함)

### 옵션 B: `private-ml-sdk`로 우리만의 Confidential VM에서 self-host
- 우리 코드 + 모델 가중치를 하나의 CVM 이미지로 패키징
- 장점: 단일 TEE 내부 완결, 외부 의존 최소
- 단점: 모델 운영 부담, 큰 모델은 GPU TEE 인프라 필요

### MVP 선택: **옵션 A 우선, 옵션 B는 폴백**
- 데모 단계에서는 NEAR AI Cloud의 기존 모델 사용
- 인프라 배치는 `private-ml-sdk` 구조 참고하되 자체 CVM 운영

---

## 7. 인증 / API Key 관리

- 아직 명확한 공식 문서 접근 불가 (403 다수). 추정:
  - NEAR AI Cloud는 API 키 기반 가능성 높음 (OpenAI 호환 = Authorization: Bearer)
  - API 키는 TEE 내부 env로 주입되어야 하며, 외부로 유출되면 안 됨
- **후속 리서치 필요**: NEAR AI Cloud 대시보드에서 API 키 발급 방법, rate limit, 가격

---

## 8. Remaining Open Questions (후속 iteration에서 해결)

1. ❓ NEAR AI Cloud API key 발급/관리 방법 (dashboard URL?)
2. ❓ Chat completion 응답에 자체 서명이 포함되는가, 아니면 항상 `/v1/attestation/report` 별도 호출인가?
3. ❓ `dcap-qvl`의 wasm 포팅 가능성 (옵션 B 로드맵)
4. ❓ NVIDIA NRAS JWT 검증의 온체인 대체 방법
5. ❓ Rate limit + 가격 (데모 비용 산정)
6. ❓ `getChatMessageSignature`의 정확한 API 경로와 응답 포맷
7. ❓ NEAR AI Cloud를 경유할 때 우리 CVM과 cloud TEE 간의 "TEE-to-TEE" attestation 체인을 만드는 방법 (nested remote attestation)
8. ✅ **[CLOSED in iteration 4]** `report_data` 필드에 signing_address + nonce가 정확히 어떻게 인코딩되는가 — §11 참조

---

## 9. 설계 확정사항 (이 리서치 결과로)

1. **서명: secp256k1 ECDSA** (Ethereum style)
2. **온체인 검증: `env::ecrecover` + address 비교** (옵션 A)
3. **TDX/NVIDIA 하드웨어 검증은 off-chain**이고, 통과한 주소만 owner가 `set_tee_pubkey`로 등록
4. **추론 언어/런타임**: Python 3.10+ 또는 TypeScript 20+ (`nearai-cloud-verifier`와 동일). MVP는 **Python** (RPC 클라이언트 생태계 성숙)
5. **NEAR AI Cloud 사용 모델**: 옵션 A (LLM 위탁), 폴백으로 옵션 B
6. **Attestation 바인딩**: PRD §4.4 FR-TEE-8/9에 "nonce + signing_address가 TDX report_data에 바인딩"이라는 요건 추가해야 함
7. **payload canonicalization**: Borsh 유지 (컨트랙트와 동일)

---

## 11. TDX `report_data` 정확한 인코딩 (iteration 4)

> 출처: [nearai/nearai-cloud-verifier/py/model_verifier.py](https://github.com/nearai/nearai-cloud-verifier) — `check_report_data()` 함수.

TDX quote의 `report_data`는 **64 bytes** 고정 크기이며, 두 가지 모드가 있다.

### Mode A: 표준 (no TLS fingerprint)

```
report_data[0..32]  = signing_address_padded32
report_data[32..64] = raw_nonce (32 bytes)
```

`signing_address_padded32` 생성 공식:
- secp256k1 서명 키의 Ethereum address (20 bytes) + **오른쪽 0-pad 12 bytes** = 32 bytes
- Python: `addr_bytes.ljust(32, b'\x00')` 또는 `addr_bytes + b'\x00' * 12`
- keccak 없음. hash 없음. **raw concat**.

### Mode B: TLS binding (`include_tls_fingerprint=true`)

```
report_data[0..32]  = sha256(signing_address_bytes(20) || tls_cert_fingerprint_bytes)
report_data[32..64] = raw_nonce (32 bytes)
```

- TLS 인증서와 서명 키를 함께 바인딩해서 "이 TEE의 TLS 채널과 이 키가 동일 CVM 내부에서 생성됨"을 증명
- MVP는 Mode A로 충분

### Verifier 측 검증 순서

```python
# 1. nonce 일치
assert report_data[32:64] == raw_nonce_bytes

# 2. signing_address 일치
if tls_fingerprint:
    expected = sha256(signing_addr_bytes_20 + tls_fp_bytes).digest()
else:
    expected = signing_addr_bytes_20 + b'\x00' * 12
assert report_data[0:32] == expected
```

### 우리 구현에 주는 영향

**tee-05 (Signer + Report 첨부)**:
- 클라이언트(투자자)가 TEE에 Persona 제출 시 `nonce`는 **payload.nonce (32 bytes)** 를 그대로 사용한다고 가정했음.
- 하지만 위 스펙에 따르면 `/v1/attestation/report?nonce=...`로 전달되는 nonce는 **클라이언트가 매번 생성**하는 값이고, TEE가 이것을 `report_data[32..64]`에 박아서 서명한다.
- 우리 경우 적절한 nonce 전략:
  - **옵션 1**: `nonce = payload_hash` → attestation이 "이 payload를 바로 이 signing_address가 생성함"을 증명. 페이로드와 리포트가 강결합.
  - **옵션 2**: `nonce = randomly generated`, payload에 nonce를 별도 보관 → TEE 리포트는 "이 signing_address가 살아있음"만 증명하고 payload 바인딩은 payload_hash 서명 자체로 처리
- **MVP 선택**: **옵션 1** — `nonce = payload_hash`. TEE가 `/v1/attestation/report?nonce={payload_hash_hex}&signing_address={addr}` 호출. 단일 검증으로 "key 살아있음 + 이 페이로드 서명 바인딩" 둘 다 해결.
- `tee-05 sign_and_attach()`는 이미 이 방식으로 구현돼 있음 (line 127: `nonce_hex=bundle.payload_hash.hex()`). 설계가 일치 ✅

### signing_algo 쿼리 파라미터

`/v1/attestation/report?signing_algo=ecdsa` — 기본값 `ecdsa` (secp256k1). `ed25519`도 지정 가능하지만, Ethereum-compatible ecrecover를 사용하는 우리 컨트랙트는 `ecdsa`로 고정.

## 10. 문서 출처

- [NEAR AI Cloud - Private Inference docs](https://docs.near.ai/cloud/private-inference/) (403, 향후 재시도)
- [NEAR AI Cloud Introduction blog](https://near.ai/blog/introducing-near-ai-cloud-private-chat)
- [NEAR AI TEE Infrastructure blog](https://near.ai/blog/building-next-gen-near-ai-infrastructure-with-tees)
- [nearai/private-ml-sdk](https://github.com/nearai/private-ml-sdk)
- [nearai/nearai-cloud-verifier](https://github.com/nearai/nearai-cloud-verifier)
- [near-examples/nearai-cloud-verification-example](https://github.com/near-examples/nearai-cloud-verification-example)

---

**다음 iteration에서 해야 할 것**:
- Open Questions §8의 1, 2, 8 해결 (SDK 소스 직접 fetch)
- contract-02 태스크의 Spec을 secp256k1/ecrecover 기반으로 전면 재작성
- tee-02 태스크의 언어 = Python 확정, SDK 버전 명시
