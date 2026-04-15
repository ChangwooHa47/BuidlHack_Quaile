# TEE report wrapper fix note

## 요약

`tee_report`는 TDX/NVIDIA attestation report blob이다.

이 값은 on-chain `AttestationBundle`에 포함하지 않는다. 컨트랙트와 프론트/백엔드의 일반 contribute flow에서 다룰 핵심 필드도 아니다.

`tee_report`는 TEE report를 off-chain에서 검증하거나 운영자가 signing address를 신뢰 등록할 때 사용하는 별도 wrapper 필드다.

## 결정

v2 구조는 다음과 같이 고정한다.

```rust
pub struct AttestationBundle {
    pub payload: AttestationPayload,
    pub payload_hash: Hash32,
    pub signature_rs: [u8; 64],
    pub signature_v: u8,
    pub signing_key_id: u32,
}

pub struct AttestationBundleWithReport {
    pub bundle: AttestationBundle,
    pub tee_report: Vec<u8>,
}
```

즉 `tee_report`는 `AttestationBundle`에서 제거한다.

## HTTP 응답 shape

TEE `/v1/attest` 응답은 wrapper다.

```json
{
  "bundle": {
    "payload": { "...": "AttestationPayload" },
    "payload_hash": "0x...",
    "signature_rs": "0x...",
    "signature_v": 0,
    "signing_key_id": 1
  },
  "tee_report": "<base64>"
}
```

`tee_report`는 wrapper top-level에만 존재한다. `bundle` 내부에 넣지 않는다.

## Contract call shape

`ido-escrow.contribute()`에는 wrapper 전체가 아니라 `bundle`만 전달한다.

```json
{
  "policy_id": 1,
  "bundle": {
    "payload": { "...": "AttestationPayload" },
    "payload_hash": "0x...",
    "signature_rs": "0x...",
    "signature_v": 0,
    "signing_key_id": 1
  }
}
```

`tee_report`는 contract call에 포함하지 않는다.

## 왜 분리하는가

- `tee_report`는 수 KB에서 수 MB까지 커질 수 있는 opaque blob이다.
- 컨트랙트는 report를 직접 검증하지 않는다.
- MVP 구조에서는 off-chain verifier가 report를 검증하고, 통과한 signing address만 `attestation-verifier`에 등록한다.
- 컨트랙트는 등록된 signing address가 `payload_hash`에 서명했는지만 검증한다.

## 관련 주의

- `tee_report`를 on-chain `AttestationBundle`에 다시 추가하면 안 된다.
- `tee_report`를 Borsh payload hash preimage에 포함하면 안 된다.
- `tee_report`를 `ido-escrow.contribute()` 인자로 전달하면 안 된다.
- TEE HTTP 응답 예시에서 `tee_report`가 `bundle` 내부에 들어가 있다면 stale 문서/예시로 간주한다.
