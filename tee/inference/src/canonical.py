from __future__ import annotations

import struct

from eth_hash.auto import keccak

from schemas import AttestationPayloadModel, EvidenceSummaryModel


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


def serialize_evidence_summary(summary: EvidenceSummaryModel) -> bytes:
    return (
        borsh_u8(summary.wallet_count_near)
        + borsh_u8(summary.wallet_count_evm)
        + borsh_u32(summary.avg_holding_days)
        + borsh_u32(summary.total_dao_votes)
        + borsh_bool(summary.github_included)
        + borsh_string(summary.rationale)
    )


def serialize_attestation_payload(payload: AttestationPayloadModel) -> bytes:
    return (
        borsh_string(payload.subject)
        + borsh_u64(payload.policy_id)
        + borsh_u8(0 if payload.verdict == "Eligible" else 1)
        + borsh_u16(payload.score)
        + borsh_u64(payload.issued_at)
        + borsh_u64(payload.expires_at)
        + borsh_fixed_array(payload.nonce, 32)
        + serialize_evidence_summary(payload.evidence_summary)
        + borsh_u8(payload.payload_version)
    )


def payload_hash(payload: AttestationPayloadModel) -> bytes:
    return keccak(serialize_attestation_payload(payload))
