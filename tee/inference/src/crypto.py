from __future__ import annotations

from eth_hash.auto import keccak
from eth_keys.datatypes import PrivateKey, Signature

from canonical import payload_hash as compute_payload_hash
from schemas import AttestationBundleModel, AttestationPayloadModel


class TeeSigner:
    def __init__(self, privkey_hex: str, key_id: int):
        if not privkey_hex:
            raise ValueError("TEE_SIGNER_PRIVKEY is required")
        pk = privkey_hex[2:] if privkey_hex.startswith("0x") else privkey_hex
        self._priv = PrivateKey(bytes.fromhex(pk))
        self._key_id = key_id

    @property
    def address(self) -> str:
        return self._priv.public_key.to_checksum_address()

    @property
    def key_id(self) -> int:
        return self._key_id

    def sign_payload_hash(self, digest: bytes) -> tuple[bytes, int]:
        if len(digest) != 32:
            raise ValueError("payload_hash must be 32 bytes")
        sig = self._priv.sign_msg_hash(digest)
        rs = sig.r.to_bytes(32, "big") + sig.s.to_bytes(32, "big")
        v = sig.v
        if v not in (0, 1):
            raise AssertionError(f"unexpected v={v}")
        return rs, v

    def sign_payload(self, payload: AttestationPayloadModel) -> AttestationBundleModel:
        digest = compute_payload_hash(payload)
        signature_rs, signature_v = self.sign_payload_hash(digest)
        return AttestationBundleModel(
            payload=payload,
            payload_hash=digest,
            signature_rs=signature_rs,
            signature_v=signature_v,
            signing_key_id=self._key_id,
        )


def recover_address_from_rs_v(
    payload_hash_bytes: bytes, signature_rs: bytes, signature_v: int
) -> str:
    if len(payload_hash_bytes) != 32:
        raise ValueError("payload_hash must be 32 bytes")
    if len(signature_rs) != 64:
        raise ValueError("signature_rs must be 64 bytes")
    if signature_v not in (0, 1):
        raise ValueError("signature_v must be 0 or 1")
    signature = Signature(signature_rs + bytes([signature_v]))
    pubkey = signature.recover_public_key_from_msg_hash(payload_hash_bytes)
    return pubkey.to_checksum_address()


def keccak256(data: bytes) -> bytes:
    return keccak(data)
