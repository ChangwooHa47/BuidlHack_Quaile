from __future__ import annotations

import struct

from eth_hash.auto import keccak

from schemas import AttestationPayloadModel, CriteriaResultsModel


def borsh_u8(v: int) -> bytes:
    return struct.pack("<B", v)


def borsh_u16(v: int) -> bytes:
    return struct.pack("<H", v)


def borsh_u32(v: int) -> bytes:
    return struct.pack("<I", v)


def borsh_u64(v: int) -> bytes:
    return struct.pack("<Q", v)


def borsh_bool(v: bool) -> bytes:
    return b"\x01" if v else b"\x00"


def borsh_string(s: str) -> bytes:
    data = s.encode("utf-8")
    return borsh_u32(len(data)) + data


def borsh_fixed_array(data: bytes, n: int) -> bytes:
    if len(data) != n:
        raise ValueError(f"fixed array length mismatch: expected {n}, got {len(data)}")
    return data


def serialize_criteria_results(cr: CriteriaResultsModel) -> bytes:
    # [bool; 10] (fixed-size, no length prefix) + u8(count)
    buf = b""
    for r in cr.results:
        buf += borsh_bool(r)
    buf += borsh_u8(cr.count)
    return buf


def serialize_attestation_payload(payload: AttestationPayloadModel) -> bytes:
    # Field order must match Rust AttestationPayload exactly:
    # subject, policy_id, verdict, issued_at, expires_at, nonce, criteria_results, payload_version
    return (
        borsh_string(payload.subject)
        + borsh_u64(payload.policy_id)
        + borsh_u8(0 if payload.verdict == "Eligible" else 1)
        + borsh_u64(payload.issued_at)
        + borsh_u64(payload.expires_at)
        + borsh_fixed_array(payload.nonce, 32)
        + serialize_criteria_results(payload.criteria_results)
        + borsh_u8(payload.payload_version)
    )


def payload_hash(payload: AttestationPayloadModel) -> bytes:
    return keccak(serialize_attestation_payload(payload))
