"""Cross-language Borsh golden vector tests.

Verifies that Python canonical serialization produces byte-for-byte identical
output to the Rust tee-shared crate, ensuring Borsh layout consistency.
"""

from canonical import payload_hash, serialize_attestation_payload
from schemas import AttestationPayloadModel, CriteriaResultsModel

# Must match tee/shared/tests/roundtrip.rs golden_dummy_payload()
GOLDEN_PAYLOAD = AttestationPayloadModel(
    subject="alice.testnet",
    policy_id=1,
    verdict="Eligible",
    issued_at=1_700_000_000_000_000_000,
    expires_at=1_700_003_600_000_000_000,
    nonce=bytes([0x42] * 32),
    criteria_results=CriteriaResultsModel(
        results=[True] * 10,
        count=6,
    ),
    payload_version=2,
)

# This value must match GOLDEN_PAYLOAD_HASH in tee/shared/tests/roundtrip.rs
GOLDEN_HASH_HEX = "d74ee78fe3ae2d969539ea3386a0c1e436b994076771cc45b1dcee754ed97691"


def test_golden_vector_matches_rust():
    h = payload_hash(GOLDEN_PAYLOAD)
    assert h.hex() == GOLDEN_HASH_HEX, (
        f"Python payload_hash diverged from Rust golden vector.\n"
        f"Expected: {GOLDEN_HASH_HEX}\n"
        f"Got:      {h.hex()}"
    )


def test_serialize_deterministic():
    b1 = serialize_attestation_payload(GOLDEN_PAYLOAD)
    b2 = serialize_attestation_payload(GOLDEN_PAYLOAD)
    assert b1 == b2


def test_criteria_results_no_length_prefix():
    """CriteriaResults is a fixed [bool; 10] + u8. No length prefix."""
    raw = serialize_attestation_payload(GOLDEN_PAYLOAD)
    # Find the criteria_results segment: after nonce (32 bytes)
    # subject borsh_string: 4 + 13 = 17 bytes
    # policy_id u64: 8 bytes
    # verdict u8: 1 byte
    # issued_at u64: 8 bytes
    # expires_at u64: 8 bytes
    # nonce [u8; 32]: 32 bytes
    # Total before criteria_results: 17 + 8 + 1 + 8 + 8 + 32 = 74
    criteria_start = 74
    # criteria_results: [bool; 10] = 10 bytes + count u8 = 1 byte = 11 bytes
    criteria_bytes = raw[criteria_start : criteria_start + 11]
    assert len(criteria_bytes) == 11
    # All 10 bools should be 0x01 (True)
    for i in range(10):
        assert criteria_bytes[i] == 0x01, f"criteria[{i}] should be True (0x01)"
    # count = 6
    assert criteria_bytes[10] == 6
    # payload_version = 2
    assert raw[criteria_start + 11] == 2


def test_verdict_variant_index():
    """Eligible=0, Ineligible=1 in both Rust and Python."""
    raw = serialize_attestation_payload(GOLDEN_PAYLOAD)
    # verdict is at offset 17 + 8 = 25
    verdict_offset = 17 + 8  # after subject + policy_id
    assert raw[verdict_offset] == 0, "Eligible should be variant index 0"
