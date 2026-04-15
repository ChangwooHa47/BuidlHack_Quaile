# TEE / contract JSON wire format fix note

## 요약

`tee-02`는 TEE HTTP 응답에서 byte 필드를 사람이 읽기 쉬운 JSON string으로 표현한다.

```json
{
  "payload_hash": "0x...",
  "signature_rs": "0x...",
  "payload": {
    "nonce": "0x..."
  }
}
```

하지만 현재 Rust contract integration test는 같은 byte 필드를 JSON array of u8로 넘긴다.

```json
{
  "payload_hash": [36, 237, 24, 39],
  "signature_rs": [171, 205],
  "payload": {
    "nonce": [17, 17]
  }
}
```

두 표현은 같은 bytes를 나타내지만, 프론트/백엔드가 TEE 응답의 `bundle`을 그대로 contract call에 전달하면 깨질 수 있다.

## 확인된 사실

### 1. TEE HTTP JSON은 hex/base64 string을 사용한다

Python TEE의 Pydantic model은 byte 필드를 명시적으로 string으로 직렬화한다.

```text
payload_hash  -> "0x..." hex string
signature_rs  -> "0x..." hex string
payload.nonce -> "0x..." hex string
tee_report    -> base64 string
```

이는 HTTP 프로토콜이 자동 변환한 것이 아니라, TEE API의 JSON 표현이다.

### 2. Rust 내부 타입은 bytes다

Rust shared type은 byte 값을 고정 길이 배열로 가진다.

```rust
pub type Hash32 = [u8; 32];
pub type Nonce = [u8; 32];

pub struct AttestationBundle {
    pub payload: AttestationPayload,
    pub payload_hash: Hash32,
    pub signature_rs: [u8; 64],
    pub signature_v: u8,
    pub signing_key_id: u32,
}
```

이 타입은 Borsh/canonical hash의 기준이다. 내부 bytes와 Borsh layout은 바꾸면 안 된다.

### 3. contract JSON args의 array 표현은 구현 결과다

현재 Rust integration test는 `payload_hash`, `signature_rs`, `nonce`를 JSON array로 넘긴다. 이는 Rust serde 기본 표현과 맞지만, planning 문서에서 `payload_hash` contract call JSON을 반드시 array로 쓰라고 직접 고정한 것은 확인되지 않았다.

반대로 `tee-02` 문서는 HTTP JSON 예시에서 `payload_hash`와 `signature_rs`를 `"0x..."`로 명시한다.

## 결정

외부 JSON wire format은 hex string으로 통일한다.

이 결정은 TEE HTTP 응답, 프론트/백엔드 처리, contract call JSON args에 모두 적용한다.

```text
TEE -> frontend/backend:
  payload_hash   = "0x..."
  signature_rs   = "0x..."
  payload.nonce  = "0x..."

frontend/backend -> contract call:
  payload_hash   = "0x..."
  signature_rs   = "0x..."
  payload.nonce  = "0x..."

Rust contract internal/Borsh:
  payload_hash   = [u8; 32]
  signature_rs   = [u8; 64]
  payload.nonce  = [u8; 32]
```

Rust serde layer가 `"0x..."`를 내부 `[u8; N]`으로 파싱한다. Borsh layout과 내부 Rust type은 그대로 유지한다.

```text
외부 JSON wire format은 hex string으로 통일한다.
Rust 내부 타입과 Borsh layout은 [u8; N] bytes로 유지한다.
serde JSON input/output layer에서만 hex를 처리한다.
```

권장 wire format:

```text
payload.nonce  : "0x" + 64 hex chars
payload_hash   : "0x" + 64 hex chars
signature_rs   : "0x" + 128 hex chars
```

가능하면 Rust deserializer는 transition 기간 동안 기존 array of u8도 함께 받아야 한다. 그러면 기존 integration test와 도구를 단계적으로 전환할 수 있다.

## 수정 대상

Rust 코드는 소유자 확인 후 수정한다. 당장 이 fix note에서는 Rust 파일을 수정하지 않는다.

적용 대상:

```text
tee/shared/src/attestation.rs
tee/shared/src/persona.rs
tee/shared/src/signal.rs
tee/shared/tests/roundtrip.rs
tests/integration/tests/test_escrow_contribute.rs
tee/inference/tests/test_pipeline.py
```

프론트/스크립트에서 contract call을 만드는 경우 동일한 hex string wire format을 그대로 사용한다.

```text
scripts/e2e/*
frontend/src/lib/near/*
```

## 검증 기준

수정 후 최소 검증:

```bash
cargo test -p tee-shared
cargo test -p tee-shared --no-default-features --features contract
uv run pytest
```

추가로 다음 JSON roundtrip을 테스트해야 한다.

```text
TEE response JSON with "0x..." fields
  -> Rust AttestationBundle deserialize
  -> internal bytes are [u8; N]
  -> Borsh payload_hash is unchanged
```

## 주의

- Borsh serialization bytes를 바꾸면 안 된다.
- `payload_hash == keccak256(borsh_serialize(payload))`는 그대로 유지되어야 한다.
