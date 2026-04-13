use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use crate::{
    attestation::Nonce,
    policy::{PolicyId, Timestamp},
    AccountId,
};

// ── Constants ─────────────────────────────────────────────────────────────

/// Freshness window for wallet proof timestamps: ±15 minutes in nanoseconds.
/// Any `WalletProof.timestamp` outside `[tee_now - FRESHNESS_NS, tee_now + FRESHNESS_NS]`
/// is rejected.
pub const FRESHNESS_NS: u64 = 15 * 60 * 1_000_000_000;

/// Canonical message format used for all wallet ownership proofs (v2 unified).
///
/// ```text
/// buidl-near-ai|v1|{policy_id}|{nonce_hex}|{timestamp_ns}|{chain_descriptor}|{address}
/// ```
///
/// - `policy_id`        — decimal u64
/// - `nonce_hex`        — 64 lowercase hex chars, no `0x` prefix
/// - `timestamp_ns`     — decimal u64, nanoseconds since Unix epoch
/// - `chain_descriptor` — `near:{network}` (e.g. `near:testnet`) or `eip155:{chain_id}`
/// - `address`          — NEAR account_id or EVM address (lowercase); must not contain `|`
pub const CANONICAL_MSG_TEMPLATE: &str =
    "buidl-near-ai|v1|{policy_id}|{nonce_hex}|{timestamp_ns}|{chain_descriptor}|{address}";

// ── Types ─────────────────────────────────────────────────────────────────

/// Investor persona submitted to the TEE `/review` endpoint.
///
/// **NEVER stored on-chain or logged outside the TEE.**
/// All fields are ephemeral — discarded from memory immediately after signing.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Persona {
    pub near_account: AccountId,
    pub policy_id: PolicyId,
    pub wallets: Wallets,
    /// Investor self-introduction (free text). PII — never leaves TEE.
    pub self_intro: String,
    /// GitHub OAuth access token. PII — used once to fetch GitHub signal, then dropped.
    pub github_oauth_token: Option<String>,
    /// 32-byte random nonce. Must be globally unique per `(investor, policy_id)`.
    pub nonce: Nonce,
    /// Client clock at submission time, nanoseconds.
    /// Must be within ±`FRESHNESS_NS` of the TEE clock.
    pub client_timestamp: Timestamp,
}

/// Wallet bundles carried in a [`Persona`].
/// At least one wallet (NEAR or EVM) must be present.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Wallets {
    pub near: Vec<NearWalletProof>,
    pub evm: Vec<EvmWalletProof>,
}

/// NEAR wallet ownership proof via NEP-413 FullAccess key signing.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct NearWalletProof {
    pub account_id: AccountId,
    /// FullAccess public key in `"ed25519:<base58>"` format.
    pub public_key: String,
    /// Base64-encoded ed25519 signature over `message` (NEP-413 schema).
    pub signature: String,
    /// Must satisfy the canonical message format (see [`CANONICAL_MSG_TEMPLATE`]).
    pub message: String,
    /// Nanoseconds — must be within ±[`FRESHNESS_NS`] of TEE clock.
    pub timestamp: Timestamp,
}

/// EVM wallet ownership proof via EIP-191 `personal_sign`.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct EvmWalletProof {
    pub chain_id: u64,
    /// Ethereum address in `"0x..."` format (lowercase hex).
    pub address: String,
    /// EIP-191 `personal_sign` output in `"0x..."` hex (65 bytes: r‖s‖v).
    pub signature: String,
    /// Must satisfy the canonical message format (see [`CANONICAL_MSG_TEMPLATE`]).
    pub message: String,
    /// Nanoseconds — must be within ±[`FRESHNESS_NS`] of TEE clock.
    pub timestamp: Timestamp,
}

// ── Helpers ───────────────────────────────────────────────────────────────

/// Build a canonical wallet proof message string.
///
/// # Arguments
/// - `chain_descriptor` — `"near:testnet"`, `"near:mainnet"`, `"eip155:1"`, etc.
/// - `address`          — NEAR account_id or lowercase EVM address
///
/// # Panics
/// Panics if `address` contains `'|'` (would corrupt the canonical format).
pub fn build_canonical_message(
    policy_id: PolicyId,
    nonce: &Nonce,
    timestamp_ns: Timestamp,
    chain_descriptor: &str,
    address: &str,
) -> String {
    assert!(
        !address.contains('|'),
        "address must not contain '|': {address}"
    );
    let nonce_hex: String = nonce.iter().map(|b| format!("{b:02x}")).collect();
    format!(
        "buidl-near-ai|v1|{policy_id}|{nonce_hex}|{timestamp_ns}|{chain_descriptor}|{address}"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_message_format() {
        let nonce = [0u8; 32];
        let msg = build_canonical_message(42, &nonce, 1_700_000_000_000_000_000, "eip155:1", "0xabc");
        assert!(msg.starts_with("buidl-near-ai|v1|42|"));
        assert!(msg.ends_with("|eip155:1|0xabc"));
        // nonce of all-zeros → 64 '0' chars
        assert!(msg.contains(&"0".repeat(64)));
    }

    #[test]
    #[should_panic(expected = "must not contain '|'")]
    fn canonical_message_rejects_pipe_in_address() {
        build_canonical_message(1, &[0u8; 32], 0, "near:testnet", "bad|address");
    }
}
