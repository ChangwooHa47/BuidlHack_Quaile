"""
Wallet ownership verification for the Buidl-NEAR AI TEE.

Verifies that wallet proofs in a Persona were actually signed by the
respective private keys, before any data ingestion or LLM evaluation.

Supported proof types:
  - NEAR: NEP-413 ed25519 message signing
  - EVM:  EIP-191 personal_sign (eth_account)

References:
  - NEP-413: https://github.com/near/NEPs/blob/master/neps/nep-0413.md
  - EIP-191: https://eips.ethereum.org/EIPS/eip-191
  - ERD §3.3: NearWalletProof, EvmWalletProof canonical message format
"""

from __future__ import annotations

import base64
import hashlib
import re
import time
from dataclasses import dataclass
from typing import Optional

import base58
import httpx
import nacl.signing
from eth_account import Account
from eth_account.messages import encode_defunct

# ── Constants ─────────────────────────────────────────────────────────────

# Canonical message prefix (ERD v2 unified format)
CANONICAL_PREFIX = "buidl-near-ai"
SCHEMA_VERSION = "v1"

# Freshness window: ±15 minutes in nanoseconds
FRESHNESS_NS: int = 15 * 60 * 1_000_000_000

# NEP-413 tag: 2^31 + 413
NEP413_TAG: int = 2**31 + 413

# Recipient used in NEP-413 preimage (fixed for MVP)
NEP413_RECIPIENT = "buidl-near-ai"

# Supported EVM chain IDs (mainnet + common testnets)
SUPPORTED_EVM_CHAINS: frozenset[int] = frozenset(
    {
        1,  # Ethereum mainnet
        8453,  # Base
        42161,  # Arbitrum One
        10,  # Optimism
        137,  # Polygon
        56,  # BSC
        # testnets
        11155111,  # Sepolia
        84532,  # Base Sepolia
        421614,  # Arbitrum Sepolia
        11155420,  # OP Sepolia
        80001,  # Mumbai (Polygon testnet)
        97,  # BSC testnet
    }
)

# Canonical message regex
# buidl-near-ai|v1|{policy_id}|{nonce_hex}|{timestamp_ns}|{chain_descriptor}|{address}
_CANONICAL_RE = re.compile(
    r"^buidl-near-ai\|v1\|(\d+)\|([0-9a-f]{64})\|(\d+)\|([\w:]+)\|([^|]+)$"
)

# ── Errors ─────────────────────────────────────────────────────────────────


class OwnershipError(Exception):
    """Base class for all wallet ownership verification errors."""


class MessageFormatError(OwnershipError):
    """Canonical message does not match the required format."""


class FreshnessError(OwnershipError):
    """Proof timestamp is outside the ±15-minute freshness window."""


class SignatureInvalid(OwnershipError):
    """Cryptographic signature verification failed."""


class AddressMismatch(OwnershipError):
    """Recovered signer address does not match the claimed address."""


class UnsupportedChain(OwnershipError):
    """chain_id is not in SUPPORTED_EVM_CHAINS."""


class NonceMismatch(OwnershipError):
    """Nonce in message does not match the expected Persona nonce."""


class PolicyMismatch(OwnershipError):
    """policy_id in message does not match the expected policy."""


# ── Data classes (mirror tee/shared Rust types) ────────────────────────────


@dataclass
class NearWalletProof:
    account_id: str
    public_key: str  # "ed25519:<base58>"
    signature: str  # base64-encoded 64-byte ed25519 sig
    message: str  # canonical message
    timestamp: int  # nanoseconds


@dataclass
class EvmWalletProof:
    chain_id: int
    address: str  # "0x..." lowercase
    signature: str  # "0x..." hex, EIP-191 personal_sign
    message: str  # canonical message
    timestamp: int  # nanoseconds


# ── Internal helpers ───────────────────────────────────────────────────────


def _now_ns() -> int:
    return time.time_ns()


def _borsh_string(s: str) -> bytes:
    """Borsh-encode a UTF-8 string: u32_le(len) + bytes."""
    data = s.encode("utf-8")
    return len(data).to_bytes(4, "little") + data


def _nep413_preimage(
    message: str,
    nonce: bytes,
    recipient: str,
    callback_url: Optional[str] = None,
) -> bytes:
    """
    Build the NEP-413 signed payload (before sha256).

    Layout:
      u32_le(NEP413_TAG) || borsh(message) || nonce[32] ||
      borsh(recipient) || option_borsh(callback_url)

    The sha256 of this preimage is what gets ed25519-signed by the NEAR wallet.
    """
    assert len(nonce) == 32, f"nonce must be 32 bytes, got {len(nonce)}"

    tag_bytes = NEP413_TAG.to_bytes(4, "little")
    cb_bytes = (
        b"\x00" if callback_url is None else b"\x01" + _borsh_string(callback_url)
    )

    return (
        tag_bytes + _borsh_string(message) + nonce + _borsh_string(recipient) + cb_bytes
    )


def _parse_canonical_message(message: str) -> tuple[int, bytes, int, str, str]:
    """
    Parse a canonical wallet proof message.

    Returns (policy_id, nonce_bytes, timestamp_ns, chain_descriptor, address).
    Raises MessageFormatError if format does not match.
    """
    m = _CANONICAL_RE.match(message)
    if not m:
        raise MessageFormatError(
            f"Message does not match canonical format: {message!r}"
        )
    policy_id = int(m.group(1))
    nonce_bytes = bytes.fromhex(m.group(2))
    timestamp_ns = int(m.group(3))
    chain_descriptor = m.group(4)
    address = m.group(5)
    return policy_id, nonce_bytes, timestamp_ns, chain_descriptor, address


def _check_freshness(timestamp_ns: int, now_ns: Optional[int] = None) -> None:
    """Raise FreshnessError if |now - timestamp| > FRESHNESS_NS."""
    if now_ns is None:
        now_ns = _now_ns()
    delta = abs(now_ns - timestamp_ns)
    if delta > FRESHNESS_NS:
        raise FreshnessError(
            f"Proof timestamp is {delta / 1e9:.1f}s away from TEE clock "
            f"(max {FRESHNESS_NS / 1e9:.0f}s)"
        )


async def _check_near_key_registered(
    account_id: str,
    public_key: str,
    rpc_url: str,
) -> None:
    """
    Verify that public_key is a registered active access key for account_id
    via NEAR JSON-RPC view_access_key.

    Raises SignatureInvalid if the key is not found or the RPC call fails.
    """
    payload = {
        "jsonrpc": "2.0",
        "id": "tee-ownership",
        "method": "query",
        "params": {
            "request_type": "view_access_key",
            "finality": "final",
            "account_id": account_id,
            "public_key": public_key,
        },
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(rpc_url, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        raise SignatureInvalid(f"NEAR RPC request failed: {exc}") from exc
    except Exception as exc:
        raise SignatureInvalid(f"NEAR RPC unexpected error: {exc}") from exc

    if "error" in data or "result" not in data:
        raise SignatureInvalid(
            f"Public key {public_key!r} is not a registered access key "
            f"for account {account_id!r}"
        )

    permission = data["result"].get("permission")
    if permission != "FullAccess":
        raise SignatureInvalid(
            f"Public key {public_key!r} for account {account_id!r} "
            f"has permission {permission!r}, but FullAccess is required "
            "for ownership proof"
        )


# ── Public API ─────────────────────────────────────────────────────────────


async def verify_near_ownership(
    proof: NearWalletProof,
    policy_id: int,
    expected_nonce: bytes,
    now_ns: Optional[int] = None,
    near_rpc_url: Optional[str] = None,
) -> None:
    """
    Verify a NEAR wallet ownership proof via NEP-413 ed25519 signing.

    Steps:
      1. Parse and validate canonical message format
      2. Check policy_id and nonce match
      3. Check freshness (±15 min); verify proof.timestamp matches message timestamp
      4. Verify chain_descriptor is a NEAR chain
      5. Decode ed25519 public key from "ed25519:<base58>"
      6. Decode base64 signature
      7. Verify ed25519(sha256(nep413_preimage)) against signature
      8. Verify account_id matches address in signed message
      9. For implicit accounts (64 hex chars): verify account_id == hex(pubkey)
      10. For named accounts: verify public_key is registered on-chain via NEAR RPC

    For named accounts, near_rpc_url is required. Without it the call raises
    SignatureInvalid (fail closed — no silent acceptance of unverifiable claims).

    Raises: MessageFormatError, PolicyMismatch, NonceMismatch, FreshnessError,
            SignatureInvalid, AddressMismatch
    """
    # 1. Parse message
    msg_policy_id, nonce_bytes, timestamp_ns, chain_descriptor, msg_address = (
        _parse_canonical_message(proof.message)
    )

    # 2. policy_id and nonce
    if msg_policy_id != policy_id:
        raise PolicyMismatch(
            f"Message policy_id {msg_policy_id} != expected {policy_id}"
        )
    if nonce_bytes != expected_nonce:
        raise NonceMismatch("Nonce in message does not match expected nonce")

    # 3. Freshness
    _check_freshness(timestamp_ns, now_ns)

    # 3b. proof.timestamp must equal the timestamp embedded in the signed message
    if proof.timestamp != timestamp_ns:
        raise MessageFormatError(
            f"proof.timestamp {proof.timestamp} != message timestamp {timestamp_ns}"
        )

    # 4. Chain descriptor must start with "near:"
    if not chain_descriptor.startswith("near:"):
        raise MessageFormatError(
            f"Expected 'near:...' chain_descriptor, got {chain_descriptor!r}"
        )

    # 5. Decode public key: "ed25519:<base58>" → 32 bytes
    if not proof.public_key.startswith("ed25519:"):
        raise SignatureInvalid("public_key must start with 'ed25519:'")
    try:
        pub_bytes = base58.b58decode(proof.public_key.removeprefix("ed25519:"))
    except Exception as exc:
        raise SignatureInvalid(f"base58 decode failed: {exc}") from exc
    if len(pub_bytes) != 32:
        raise SignatureInvalid(f"ed25519 pubkey must be 32 bytes, got {len(pub_bytes)}")

    # 6. Decode signature: base64 → 64 bytes
    try:
        sig_bytes = base64.b64decode(proof.signature)
    except Exception as exc:
        raise SignatureInvalid(f"base64 decode failed: {exc}") from exc
    if len(sig_bytes) != 64:
        raise SignatureInvalid(f"ed25519 sig must be 64 bytes, got {len(sig_bytes)}")

    # 7. Verify ed25519(sha256(nep413_preimage))
    preimage = _nep413_preimage(
        message=proof.message,
        nonce=nonce_bytes,
        recipient=NEP413_RECIPIENT,
    )
    msg_hash = hashlib.sha256(preimage).digest()
    try:
        nacl.signing.VerifyKey(pub_bytes).verify(msg_hash, sig_bytes)
    except nacl.exceptions.BadSignatureError as exc:
        raise SignatureInvalid(f"ed25519 verification failed: {exc}") from exc

    # 8. account_id must match the address field in the signed message.
    #    Prevents tampering with the outer account_id after signing.
    if msg_address != proof.account_id:
        raise AddressMismatch(
            f"Message address {msg_address!r} != account_id {proof.account_id!r}"
        )

    # 9. For implicit accounts (64 hex chars): verify account_id == hex(pubkey).
    is_implicit = len(proof.account_id) == 64 and all(
        c in "0123456789abcdef" for c in proof.account_id.lower()
    )
    if is_implicit and proof.account_id.lower() != pub_bytes.hex():
        raise AddressMismatch(
            f"Implicit account_id {proof.account_id!r} "
            f"does not match pubkey hex {pub_bytes.hex()!r}"
        )

    # 10. For named accounts: verify the public key is registered on-chain.
    #     Without this check, any ed25519 key can forge ownership of any named account
    #     by signing a message that includes the victim's account_id.
    if not is_implicit:
        if near_rpc_url is None:
            raise SignatureInvalid(
                "near_rpc_url is required to verify named NEAR account key registration"
            )
        await _check_near_key_registered(
            proof.account_id, proof.public_key, near_rpc_url
        )


def verify_evm_ownership(
    proof: EvmWalletProof,
    policy_id: int,
    expected_nonce: bytes,
    now_ns: Optional[int] = None,
) -> None:
    """
    Verify an EVM wallet ownership proof via EIP-191 personal_sign.

    Steps:
      1. Parse and validate canonical message format
      2. Check policy_id and nonce match
      3. Check freshness (±15 min)
      4. Check chain_id is in SUPPORTED_EVM_CHAINS
      5. Verify chain_descriptor matches proof.chain_id
      6. Recover signer address from EIP-191 signature
      7. Compare (lowercase) recovered address with proof.address

    Raises: MessageFormatError, PolicyMismatch, NonceMismatch, FreshnessError,
            UnsupportedChain, SignatureInvalid, AddressMismatch
    """
    # 1. Parse message
    msg_policy_id, nonce_bytes, timestamp_ns, chain_descriptor, msg_address = (
        _parse_canonical_message(proof.message)
    )

    # 2. policy_id and nonce
    if msg_policy_id != policy_id:
        raise PolicyMismatch(
            f"Message policy_id {msg_policy_id} != expected {policy_id}"
        )
    if nonce_bytes != expected_nonce:
        raise NonceMismatch("Nonce in message does not match expected nonce")

    # 3. Freshness
    _check_freshness(timestamp_ns, now_ns)

    # 3b. proof.timestamp must equal the timestamp embedded in the signed message
    if proof.timestamp != timestamp_ns:
        raise MessageFormatError(
            f"proof.timestamp {proof.timestamp} != message timestamp {timestamp_ns}"
        )

    # 4. Supported chain
    if proof.chain_id not in SUPPORTED_EVM_CHAINS:
        raise UnsupportedChain(f"chain_id {proof.chain_id} is not supported")

    # 5. chain_descriptor must match chain_id
    expected_descriptor = f"eip155:{proof.chain_id}"
    if chain_descriptor != expected_descriptor:
        raise MessageFormatError(
            f"chain_descriptor {chain_descriptor!r} != expected {expected_descriptor!r}"
        )

    # 5b. Address in the signed message must match the claimed proof.address.
    #     Prevents tampering with the outer address field after signing.
    if msg_address.lower() != proof.address.lower():
        raise AddressMismatch(
            f"Message address {msg_address!r} != proof.address {proof.address!r}"
        )

    # 6. Recover signer from EIP-191 signature
    try:
        encoded = encode_defunct(text=proof.message)
        recovered = Account.recover_message(encoded, signature=proof.signature)
    except Exception as exc:
        raise SignatureInvalid(f"EIP-191 recovery failed: {exc}") from exc

    # 7. Compare addresses (case-insensitive)
    if recovered.lower() != proof.address.lower():
        raise AddressMismatch(
            f"Recovered {recovered.lower()!r} != claimed {proof.address.lower()!r}"
        )


async def verify_all_wallets(
    near_proofs: list[NearWalletProof],
    evm_proofs: list[EvmWalletProof],
    policy_id: int,
    expected_nonce: bytes,
    now_ns: Optional[int] = None,
    near_rpc_url: Optional[str] = None,
) -> None:
    """
    Verify all wallet proofs in a Persona.

    Raises OwnershipError (subclass) on the first failure.
    near_rpc_url is required when any NEAR named account proof is present.
    """
    if not near_proofs and not evm_proofs:
        raise MessageFormatError("Persona must contain at least one wallet proof")

    for proof in near_proofs:
        await verify_near_ownership(
            proof, policy_id, expected_nonce, now_ns, near_rpc_url
        )

    for proof in evm_proofs:
        verify_evm_ownership(proof, policy_id, expected_nonce, now_ns)
