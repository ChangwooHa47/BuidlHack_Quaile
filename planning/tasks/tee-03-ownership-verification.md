---
id: tee-03-ownership-verification
status: done
sub: TEE
layer: tee
depends_on: [tee-01-persona-schema]
estimate: 1h
demo_step: "Subscribing.Review (입구)"
---

# 지갑 소유권 검증 (NEAR ed25519 + EVM EIP-191)

## Context
TEE가 Persona를 수신했을 때 가장 먼저 하는 일: **제출된 지갑들이 실제로 투자자의 것인지 재검증.**
클라이언트가 보낸 서명을 그냥 믿지 않고, TEE 내부에서 다시 검증.

PRD FR-TEE-2, FR-TEE-3
ERD §3.3 NearWalletProof, EvmWalletProof

## Files
- `tee/inference/src/ownership.py`
- `tee/inference/tests/test_ownership.py`

## Spec

### Canonical message 포맷
모든 proof의 `message` 필드는 다음 포맷을 따라야 함:
```
buidl-near-ai|v1|{policy_id}|{nonce_hex}|{timestamp_ns}|{chain_descriptor}|{address}
```

`chain_descriptor`:
- NEAR: `near:{network}` (예: `near:testnet`)
- EVM: `eip155:{chain_id}` (예: `eip155:1`)

예시:
```
buidl-near-ai|v1|42|0xabcd..ef|1712896800000000000|eip155:1|0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
```

`address`는 lowercase (EVM) 또는 account_id (NEAR).

### 사용 라이브러리 (명시)
- **NEP-413 ed25519 verify**: `cryptography` (stdlib에 가까운 선택) 또는 `PyNaCl`
  - 권장: `cryptography.hazmat.primitives.asymmetric.ed25519.Ed25519PublicKey.from_public_bytes(pub_bytes).verify(sig, msg_hash)`
  - 대안: `nacl.signing.VerifyKey(pub_bytes).verify(msg_hash, sig)` — 더 단순
- **public_key 파싱**: `ed25519:BASE58` → base58 decode (base58 라이브러리) → 32 bytes
- **base58**: `base58` 라이브러리 (PyPI)

### 검증 함수
```python
from nacl.signing import VerifyKey
from hashlib import sha256
import base58
import borsh_construct as bc  # NEP-413 borsh 구조체

def verify_near_ownership(proof: NearWalletProof, policy_id: int, expected_nonce: bytes) -> None:
    """Raises OwnershipError on failure."""
    # 1. message 파싱 + 필드 일치 확인 (policy_id, nonce, chain_descriptor=near:...)
    # 2. freshness: abs(now_ns - proof.timestamp) < 15 * 60 * 10**9
    # 3. public_key 파싱: "ed25519:BASE58" → prefix 확인 → base58 decode → 32 bytes
    pub_b58 = proof.public_key.removeprefix("ed25519:")
    pub_bytes = base58.b58decode(pub_b58)
    if len(pub_bytes) != 32:
        raise SignatureInvalid("pubkey length")
    # 4. signature 파싱: base64 → 64 bytes
    sig_bytes = base64.b64decode(proof.signature)
    if len(sig_bytes) != 64:
        raise SignatureInvalid("sig length")
    # 5. NEP-413 preimage: borsh({ tag, message, nonce, recipient, callback_url })
    nep413 = nep413_preimage(
        message=proof.message,
        nonce=expected_nonce,
        recipient="buidl-near-ai",
    )
    msg_hash = sha256(nep413).digest()
    # 6. ed25519 verify
    try:
        VerifyKey(pub_bytes).verify(msg_hash, sig_bytes)
    except Exception as e:
        raise SignatureInvalid(str(e))
    # 7. public_key → implicit account_id 매핑 확인 (또는 proof.account_id가 named이면 별도 RPC view_access_key_list 필요)
    #    MVP: named account면 RPC 조회 없이 proof.account_id를 신뢰 (pubkey가 그 계정에 속한지는 NEAR 측 wallet selector가 보장)

def nep413_preimage(message: str, nonce: bytes, recipient: str, callback_url: str | None = None) -> bytes:
    """NEP-413 borsh(struct) 생성."""
    tag = (2**31 + 413).to_bytes(4, "little")  # NEP-413 prefix — 실제 값은 NEP 문서 확인
    msg_bytes = message.encode("utf-8")
    cb_bytes = b"\x00" if callback_url is None else b"\x01" + _string(callback_url)
    return tag + _string(message) + nonce + _string(recipient) + cb_bytes

def _string(s: str) -> bytes:
    data = s.encode("utf-8")
    return len(data).to_bytes(4, "little") + data
```

> **주의**: NEP-413의 정확한 `tag` 값은 [NEP 문서](https://github.com/near/NEPs/blob/master/neps/nep-0413.md)를 확인해야 한다. 위 의사코드의 `tag` 계산은 placeholder — 실제 구현 시 반드시 검증.

def verify_evm_ownership(proof: EvmWalletProof, policy_id: int, expected_nonce: bytes) -> None:
    # 1. message 파싱 + 필드 일치
    # 2. freshness
    # 3. eth_account.messages.encode_defunct(text=proof.message)
    # 4. Account.recover_message(encoded, signature=proof.signature) → address
    # 5. recovered.lower() == proof.address.lower()
    # 6. chain_id가 SUPPORTED_CHAINS에 있음
```

### NEP-413 (NEAR 서명 표준)
NEAR 지갑이 임의 메시지에 서명하려면 NEP-413 규격을 따라야 함:
```
tag = [0x41, 0x55, 0x54, 0x48]  // "AUTH" magic
msg_bytes = borsh({
  tag: tag,
  message: string,
  nonce: [u8;32],
  recipient: string,   // "buidl-near-ai"
  callback_url: Option<string>,
})
hash = sha256(msg_bytes)
signature = ed25519_sign(privkey, hash)
```

TEE 검증은 이 과정을 역으로 수행.

### 에러
```python
class OwnershipError(Exception): ...
class MessageFormatError(OwnershipError): ...
class FreshnessError(OwnershipError): ...
class SignatureInvalid(OwnershipError): ...
class AddressMismatch(OwnershipError): ...
class UnsupportedChain(OwnershipError): ...
class NonceMismatch(OwnershipError): ...
class PolicyMismatch(OwnershipError): ...
```

## Acceptance Criteria
- [ ] `uv run pytest tests/test_ownership.py` 성공
- [ ] NEAR NEP-413 round-trip: 테스트 키로 서명 → verify 성공
- [ ] EVM EIP-191 round-trip: eth_account로 서명 → verify 성공
- [ ] 메시지 1바이트 변조 → SignatureInvalid
- [ ] signature 변조 → SignatureInvalid 또는 AddressMismatch
- [ ] timestamp 16분 전 → FreshnessError (경계값)
- [ ] timestamp 14분 전 → 통과 (경계값)
- [ ] nonce 불일치 → NonceMismatch

## Test Cases
1. happy (near): NEP-413 서명 생성 → verify 성공
2. happy (evm): EIP-191 서명 생성 → verify 성공
3. edge: message에 policy_id 다름 → PolicyMismatch
4. edge: message에 chain 미포함 → MessageFormatError
5. edge: timestamp 1시간 전 → FreshnessError
6. edge: EVM address 대소문자 틀림 → 정규화 후 일치 (성공)
7. edge: 지원 안 하는 chain_id → UnsupportedChain
8. edge: NEAR public_key와 account_id 불일치 → AddressMismatch

## References
- NEP-413: https://github.com/near/NEPs/blob/master/neps/nep-0413.md
- EIP-191: https://eips.ethereum.org/EIPS/eip-191
- eth_account: https://eth-account.readthedocs.io/en/stable/eth_account.messages.html
- `planning/ERD.md` §3.3

## Open Questions
1. NEP-413 recipient 필드 값 → `"buidl-near-ai"` 고정 or policy account?
2. NEAR 지갑이 LedgerHQ 등 하드월렛일 때 NEP-413 지원 여부
3. EIP-712 (structured typed data)를 대신 쓸 수 있는가? → MVP는 EIP-191 (더 간단)
