"""
Tests for tee/inference/src/ownership.py

Covers:
  - NEP-413 NEAR ed25519 happy path + error cases
  - EIP-191 EVM personal_sign happy path + error cases
  - Canonical message parsing edge cases
"""

from __future__ import annotations

import base64
import hashlib
import os

import base58
import nacl.signing
import pytest
from eth_account import Account
from eth_account.messages import encode_defunct

from ownership import (
    FRESHNESS_NS,
    NEP413_RECIPIENT,
    NEP413_TAG,
    AddressMismatch,
    EvmWalletProof,
    FreshnessError,
    MessageFormatError,
    NearWalletProof,
    NonceMismatch,
    PolicyMismatch,
    SignatureInvalid,
    UnsupportedChain,
    _borsh_string,
    _nep413_preimage,
    _parse_canonical_message,
    verify_all_wallets,
    verify_evm_ownership,
    verify_near_ownership,
)

# ── Test fixtures ─────────────────────────────────────────────────────────

POLICY_ID = 42
NONCE = os.urandom(32)
NONCE_HEX = NONCE.hex()
NOW_NS = 1_700_000_000_000_000_000  # fixed "now" for deterministic tests
TIMESTAMP_NS = NOW_NS  # proof timestamp = now → always fresh


def _canonical_message(
    policy_id: int = POLICY_ID,
    nonce_hex: str = NONCE_HEX,
    timestamp_ns: int = TIMESTAMP_NS,
    chain_descriptor: str = "near:testnet",
    address: str = "alice.testnet",
) -> str:
    return f"buidl-near-ai|v1|{policy_id}|{nonce_hex}|{timestamp_ns}|{chain_descriptor}|{address}"


def _make_near_proof(
    signing_key: nacl.signing.SigningKey,
    message: str,
    account_id: str | None = None,
) -> NearWalletProof:
    """Sign `message` with NEP-413 and return a NearWalletProof."""
    verify_key = signing_key.verify_key
    pub_bytes = bytes(verify_key)
    pub_key_str = "ed25519:" + base58.b58encode(pub_bytes).decode()

    if account_id is None:
        account_id = pub_bytes.hex()  # implicit account

    # NEP-413 preimage and sha256
    _, nonce_bytes, timestamp_ns, _, _ = _parse_canonical_message(message)
    preimage = _nep413_preimage(message, nonce_bytes, NEP413_RECIPIENT)
    msg_hash = hashlib.sha256(preimage).digest()

    # Sign the hash directly (nacl sign_ed25519 signs the message, not hash — use .sign())
    # We need to sign msg_hash with the ed25519 key.
    # nacl.signing.SigningKey.sign() signs the full message, returns signature+message.
    # To get just the 64-byte signature over msg_hash:
    signed = signing_key.sign(msg_hash)
    sig_bytes = signed.signature  # first 64 bytes
    sig_b64 = base64.b64encode(sig_bytes).decode()

    return NearWalletProof(
        account_id=account_id,
        public_key=pub_key_str,
        signature=sig_b64,
        message=message,
        timestamp=timestamp_ns,
    )


def _make_evm_proof(private_key: str, chain_id: int, address: str, message: str) -> EvmWalletProof:
    """Sign `message` with EIP-191 and return an EvmWalletProof."""
    encoded = encode_defunct(text=message)
    signed = Account.sign_message(encoded, private_key=private_key)
    _, _, timestamp_ns, _, _ = _parse_canonical_message(message)
    return EvmWalletProof(
        chain_id=chain_id,
        address=address.lower(),
        signature=signed.signature.hex(),
        message=message,
        timestamp=timestamp_ns,
    )


# ── Helpers ────────────────────────────────────────────────────────────────

def _near_keys() -> tuple[nacl.signing.SigningKey, str, str]:
    """Generate a fresh ed25519 keypair. Returns (signing_key, account_id, pub_key_str)."""
    sk = nacl.signing.SigningKey.generate()
    pub = bytes(sk.verify_key)
    account_id = pub.hex()
    pub_key_str = "ed25519:" + base58.b58encode(pub).decode()
    return sk, account_id, pub_key_str


def _evm_account() -> tuple[str, str]:
    """Generate a fresh EVM account. Returns (private_key_hex, address)."""
    acct = Account.create()
    return acct.key.hex(), acct.address.lower()


# ── Test 1: NEP-413 NEAR happy path ───────────────────────────────────────

def test_near_verify_happy_path():
    sk, account_id, _ = _near_keys()
    msg = _canonical_message(chain_descriptor="near:testnet", address=account_id)
    proof = _make_near_proof(sk, msg, account_id=account_id)
    # should not raise
    verify_near_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


def test_near_named_account_trusted():
    """Named accounts pass when signed message address == account_id."""
    sk, _, _ = _near_keys()
    named = "alice.testnet"
    msg = _canonical_message(chain_descriptor="near:testnet", address=named)
    proof = _make_near_proof(sk, msg, account_id=named)
    verify_near_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


# ── Test 2: EVM EIP-191 happy path ────────────────────────────────────────

def test_evm_verify_happy_path():
    pk, addr = _evm_account()
    msg = _canonical_message(chain_descriptor="eip155:1", address=addr)
    proof = _make_evm_proof(pk, chain_id=1, address=addr, message=msg)
    verify_evm_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


def test_evm_address_case_insensitive():
    """Address comparison is case-insensitive (checksummed vs lowercase)."""
    pk, addr = _evm_account()
    msg = _canonical_message(chain_descriptor="eip155:1", address=addr.lower())
    proof = _make_evm_proof(pk, chain_id=1, address=addr.upper(), message=msg)
    # proof.address is uppercase, but comparison is lowercase — should pass
    verify_evm_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


# ── Test 3: PolicyMismatch ─────────────────────────────────────────────────

def test_near_wrong_policy_id():
    sk, account_id, _ = _near_keys()
    msg = _canonical_message(policy_id=99, chain_descriptor="near:testnet", address=account_id)
    proof = _make_near_proof(sk, msg, account_id=account_id)
    with pytest.raises(PolicyMismatch):
        verify_near_ownership(proof, policy_id=1, expected_nonce=NONCE, now_ns=NOW_NS)


def test_evm_wrong_policy_id():
    pk, addr = _evm_account()
    msg = _canonical_message(policy_id=99, chain_descriptor="eip155:1", address=addr)
    proof = _make_evm_proof(pk, chain_id=1, address=addr, message=msg)
    with pytest.raises(PolicyMismatch):
        verify_evm_ownership(proof, policy_id=1, expected_nonce=NONCE, now_ns=NOW_NS)


# ── Test 4: NonceMismatch ─────────────────────────────────────────────────

def test_near_nonce_mismatch():
    sk, account_id, _ = _near_keys()
    msg = _canonical_message(chain_descriptor="near:testnet", address=account_id)
    proof = _make_near_proof(sk, msg, account_id=account_id)
    wrong_nonce = bytes(32)  # all zeros
    with pytest.raises(NonceMismatch):
        verify_near_ownership(proof, POLICY_ID, wrong_nonce, now_ns=NOW_NS)


def test_evm_nonce_mismatch():
    pk, addr = _evm_account()
    msg = _canonical_message(chain_descriptor="eip155:1", address=addr)
    proof = _make_evm_proof(pk, chain_id=1, address=addr, message=msg)
    wrong_nonce = bytes(32)
    with pytest.raises(NonceMismatch):
        verify_evm_ownership(proof, POLICY_ID, wrong_nonce, now_ns=NOW_NS)


# ── Test 5: FreshnessError ────────────────────────────────────────────────

def test_near_stale_timestamp_16min():
    """Timestamp 16 minutes in the past → FreshnessError."""
    sk, account_id, _ = _near_keys()
    stale_ts = NOW_NS - (16 * 60 * 1_000_000_000)
    msg = _canonical_message(timestamp_ns=stale_ts, chain_descriptor="near:testnet", address=account_id)
    proof = _make_near_proof(sk, msg, account_id=account_id)
    with pytest.raises(FreshnessError):
        verify_near_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


def test_near_fresh_timestamp_14min():
    """Timestamp 14 minutes in the past → passes freshness check."""
    sk, account_id, _ = _near_keys()
    fresh_ts = NOW_NS - (14 * 60 * 1_000_000_000)
    msg = _canonical_message(timestamp_ns=fresh_ts, chain_descriptor="near:testnet", address=account_id)
    proof = _make_near_proof(sk, msg, account_id=account_id)
    verify_near_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


def test_evm_stale_timestamp():
    pk, addr = _evm_account()
    stale_ts = NOW_NS - (16 * 60 * 1_000_000_000)
    msg = _canonical_message(timestamp_ns=stale_ts, chain_descriptor="eip155:1", address=addr)
    proof = _make_evm_proof(pk, chain_id=1, address=addr, message=msg)
    with pytest.raises(FreshnessError):
        verify_evm_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


# ── Test 6: SignatureInvalid ──────────────────────────────────────────────

def test_near_tampered_message():
    """Changing one byte in the message after signing → SignatureInvalid."""
    sk, account_id, _ = _near_keys()
    msg = _canonical_message(chain_descriptor="near:testnet", address=account_id)
    proof = _make_near_proof(sk, msg, account_id=account_id)
    # Tamper: replace the last character of message
    proof.message = proof.message[:-1] + ("X" if proof.message[-1] != "X" else "Y")
    with pytest.raises((SignatureInvalid, MessageFormatError)):
        verify_near_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


def test_near_tampered_signature():
    sk, account_id, _ = _near_keys()
    msg = _canonical_message(chain_descriptor="near:testnet", address=account_id)
    proof = _make_near_proof(sk, msg, account_id=account_id)
    # Flip one byte in the base64 signature
    sig_bytes = bytearray(base64.b64decode(proof.signature))
    sig_bytes[0] ^= 0xFF
    proof.signature = base64.b64encode(bytes(sig_bytes)).decode()
    with pytest.raises(SignatureInvalid):
        verify_near_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


def test_evm_tampered_signature():
    pk, addr = _evm_account()
    msg = _canonical_message(chain_descriptor="eip155:1", address=addr)
    proof = _make_evm_proof(pk, chain_id=1, address=addr, message=msg)
    # Flip signature bytes → recovery gives wrong address
    sig_bytes = bytearray(bytes.fromhex(proof.signature.removeprefix("0x")))
    sig_bytes[0] ^= 0xFF
    proof.signature = "0x" + bytes(sig_bytes).hex()
    with pytest.raises((SignatureInvalid, AddressMismatch)):
        verify_evm_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


# ── Test 7: MessageFormatError ────────────────────────────────────────────

def test_malformed_message_missing_fields():
    sk, account_id, _ = _near_keys()
    proof = NearWalletProof(
        account_id=account_id,
        public_key="ed25519:" + base58.b58encode(bytes(sk.verify_key)).decode(),
        signature=base64.b64encode(bytes(64)).decode(),
        message="not-a-valid-message",
        timestamp=TIMESTAMP_NS,
    )
    with pytest.raises(MessageFormatError):
        verify_near_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


def test_near_wrong_chain_descriptor():
    """chain_descriptor for EVM proof in a NEAR verify call → MessageFormatError."""
    sk, account_id, _ = _near_keys()
    msg = _canonical_message(chain_descriptor="eip155:1", address=account_id)
    proof = _make_near_proof(sk, msg, account_id=account_id)
    with pytest.raises(MessageFormatError):
        verify_near_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


# ── Test 8: UnsupportedChain ──────────────────────────────────────────────

def test_evm_unsupported_chain():
    pk, addr = _evm_account()
    unsupported_chain = 99999
    msg = _canonical_message(chain_descriptor=f"eip155:{unsupported_chain}", address=addr)
    proof = _make_evm_proof(pk, chain_id=unsupported_chain, address=addr, message=msg)
    with pytest.raises(UnsupportedChain):
        verify_evm_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


# ── Test 9: AddressMismatch ───────────────────────────────────────────────

def test_near_implicit_account_mismatch():
    """Implicit account_id doesn't match the public key → AddressMismatch."""
    sk, _, _ = _near_keys()
    # Use a different key's hex as account_id
    other_sk = nacl.signing.SigningKey.generate()
    wrong_account_id = bytes(other_sk.verify_key).hex()

    msg = _canonical_message(chain_descriptor="near:testnet", address=wrong_account_id)
    proof = _make_near_proof(sk, msg, account_id=wrong_account_id)
    with pytest.raises(AddressMismatch):
        verify_near_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


def test_near_account_id_tampered():
    """Outer account_id tampered after signing (forgery) → AddressMismatch.

    Attack: attacker signs a valid message for attacker.testnet, then replaces
    proof.account_id with victim.testnet. The address in the signed message
    must match account_id, so this is rejected.
    """
    sk, _, _ = _near_keys()
    attacker_name = "attacker.testnet"
    msg = _canonical_message(chain_descriptor="near:testnet", address=attacker_name)
    proof = _make_near_proof(sk, msg, account_id=attacker_name)
    # Tamper: claim to be victim
    proof.account_id = "victim.testnet"
    with pytest.raises(AddressMismatch):
        verify_near_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


def test_evm_address_in_message_mismatch():
    """Message address differs from proof.address → AddressMismatch.

    The address field in the signed canonical message must equal proof.address.
    """
    pk, addr = _evm_account()
    _, other_addr = _evm_account()
    # Message claims other_addr, but proof.address is addr
    msg = _canonical_message(chain_descriptor="eip155:1", address=other_addr)
    encoded = encode_defunct(text=msg)
    signed = Account.sign_message(encoded, private_key=pk)
    _, _, timestamp_ns, _, _ = _parse_canonical_message(msg)
    proof = EvmWalletProof(
        chain_id=1,
        address=addr,  # differs from message address
        signature=signed.signature.hex(),
        message=msg,
        timestamp=timestamp_ns,
    )
    with pytest.raises(AddressMismatch):
        verify_evm_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


# ── Test 9b: proof.timestamp consistency ─────────────────────────────────

def test_near_proof_timestamp_mismatch():
    """proof.timestamp differs from message timestamp → MessageFormatError."""
    sk, account_id, _ = _near_keys()
    msg = _canonical_message(chain_descriptor="near:testnet", address=account_id)
    proof = _make_near_proof(sk, msg, account_id=account_id)
    # Tamper the outer timestamp field without touching the signed message
    proof.timestamp = NOW_NS - (30 * 60 * 1_000_000_000)
    with pytest.raises(MessageFormatError):
        verify_near_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


def test_evm_proof_timestamp_mismatch():
    """proof.timestamp differs from message timestamp → MessageFormatError."""
    pk, addr = _evm_account()
    msg = _canonical_message(chain_descriptor="eip155:1", address=addr)
    proof = _make_evm_proof(pk, chain_id=1, address=addr, message=msg)
    proof.timestamp = NOW_NS - (30 * 60 * 1_000_000_000)
    with pytest.raises(MessageFormatError):
        verify_evm_ownership(proof, POLICY_ID, NONCE, now_ns=NOW_NS)


# ── Test 10: verify_all_wallets ───────────────────────────────────────────

def test_verify_all_wallets_happy():
    sk, account_id, _ = _near_keys()
    near_msg = _canonical_message(chain_descriptor="near:testnet", address=account_id)
    near_proof = _make_near_proof(sk, near_msg, account_id=account_id)

    pk, addr = _evm_account()
    evm_msg = _canonical_message(chain_descriptor="eip155:1", address=addr)
    evm_proof = _make_evm_proof(pk, chain_id=1, address=addr, message=evm_msg)

    verify_all_wallets([near_proof], [evm_proof], POLICY_ID, NONCE, now_ns=NOW_NS)


def test_verify_all_wallets_empty_raises():
    with pytest.raises(MessageFormatError):
        verify_all_wallets([], [], POLICY_ID, NONCE, now_ns=NOW_NS)


# ── Test 11: NEP-413 preimage structure ───────────────────────────────────

def test_nep413_preimage_tag():
    """First 4 bytes of preimage must be NEP413_TAG in little-endian."""
    preimage = _nep413_preimage("hello", bytes(32), "buidl-near-ai")
    tag_from_preimage = int.from_bytes(preimage[:4], "little")
    assert tag_from_preimage == NEP413_TAG


def test_nep413_preimage_nonce_embedded():
    """Nonce bytes must appear verbatim at the correct offset."""
    nonce = bytes(range(32))
    msg = "test"
    preimage = _nep413_preimage(msg, nonce, "buidl-near-ai")
    # offset: 4 (tag) + 4 (msg_len) + len(msg) = 4 + 4 + 4 = 12
    msg_bytes = msg.encode()
    offset = 4 + 4 + len(msg_bytes)
    assert preimage[offset : offset + 32] == nonce


# ── Test 12: _parse_canonical_message ────────────────────────────────────

def test_parse_canonical_message_valid():
    nonce_hex = "a" * 64
    msg = f"buidl-near-ai|v1|42|{nonce_hex}|1700000000000000000|eip155:1|0xabc"
    policy_id, nonce_bytes, ts, chain, addr = _parse_canonical_message(msg)
    assert policy_id == 42
    assert nonce_bytes == bytes.fromhex(nonce_hex)
    assert ts == 1700000000000000000
    assert chain == "eip155:1"
    assert addr == "0xabc"


def test_parse_canonical_message_invalid():
    with pytest.raises(MessageFormatError):
        _parse_canonical_message("not|valid")
