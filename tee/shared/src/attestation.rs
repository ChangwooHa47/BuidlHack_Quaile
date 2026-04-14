use borsh::{BorshDeserialize, BorshSerialize};

use crate::{
    policy::{PolicyId, Timestamp},
    AccountId,
};

/// Serde helper for `[u8; 64]`: serializes/deserializes as a length-64 byte tuple.
/// Needed because serde's derive only handles arrays up to size 32 in this version.
mod serde_sig_rs {
    use serde::{Deserializer, Serializer};

    pub fn serialize<S: Serializer>(bytes: &[u8; 64], s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeTuple;
        let mut seq = s.serialize_tuple(64)?;
        for b in bytes {
            seq.serialize_element(b)?;
        }
        seq.end()
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<[u8; 64], D::Error> {
        use serde::de::{Error, SeqAccess, Visitor};
        struct V;
        impl<'de> Visitor<'de> for V {
            type Value = [u8; 64];
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                write!(f, "a tuple of 64 bytes")
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
                let mut arr = [0u8; 64];
                for (i, slot) in arr.iter_mut().enumerate() {
                    *slot = seq
                        .next_element()?
                        .ok_or_else(|| A::Error::invalid_length(i, &self))?;
                }
                Ok(arr)
            }
        }
        d.deserialize_tuple(64, V)
    }
}

/// 32-byte random nonce. Must be unique per `(investor, policy_id)`.
pub type Nonce = [u8; 32];

/// 32-byte hash (keccak256 output).
pub type Hash32 = [u8; 32];

/// Maximum characters allowed in `EvidenceSummary.rationale`.
/// Enforced by the TEE before signing (tee-04 PII filter).
pub const RATIONALE_MAX_CHARS: usize = 280;

/// The payload that the TEE signs after evaluating an investor's Persona.
///
/// Borsh-serialized and keccak256-hashed to produce `AttestationBundle.payload_hash`.
/// Python must replicate this exact layout for golden-vector tests (test-02).
///
/// Field order is **fixed** — any reorder breaks existing signatures.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "contract", borsh(crate = "near_sdk::borsh"))]
pub struct AttestationPayload {
    /// NEAR account ID of the investor being attested.
    pub subject: AccountId,
    pub policy_id: PolicyId,
    pub verdict: Verdict,
    /// Score in basis points: 0 = 0 %, 10000 = 100 %.
    pub score: u16,
    pub issued_at: Timestamp,
    /// Validity end; normally `policy.sale_config.subscription_end`.
    pub expires_at: Timestamp,
    /// Carried through from `Persona.nonce` — prevents replay.
    pub nonce: Nonce,
    pub evidence_summary: EvidenceSummary,
    /// Payload schema version for future-proofing. Current value: 1.
    pub payload_version: u8,
}

/// TEE adjudication result.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "contract", borsh(crate = "near_sdk::borsh"))]
pub enum Verdict {
    Eligible,
    Ineligible,
}

/// Privacy-safe evidence visible to foundations (no PII).
///
/// Individual wallet addresses, transaction details, self_intro text, and
/// GitHub identifiers are **never** included here.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "contract", borsh(crate = "near_sdk::borsh"))]
pub struct EvidenceSummary {
    pub wallet_count_near: u8,
    pub wallet_count_evm: u8,
    pub avg_holding_days: u32,
    pub total_dao_votes: u32,
    /// True if a GitHub OAuth token was provided and GitHub data was collected.
    pub github_included: bool,
    /// LLM-generated human-readable rationale.
    /// Must be ≤ `RATIONALE_MAX_CHARS` characters and pass PII filter before signing.
    pub rationale: String,
}

/// The on-chain attestation struct passed to `ido-escrow.contribute()`.
///
/// `tee_report` is intentionally absent here to save gas — see note below.
///
/// # Why no tee_report on-chain?
/// A TDX quote + NVIDIA payload blob can be several KB–MB.
/// Storing it on-chain would cost prohibitive gas/storage.
/// MVP flow: off-chain verifier validates the report, then the foundation
/// registers the resulting `signing_address` via `attestation-verifier.set_tee_pubkey()`.
/// The contract only verifies that a known address signed this bundle.
///
/// # Verification
/// `ecrecover(payload_hash, signature_rs, signature_v)` → address
/// must equal `signing_addresses[signing_key_id]`.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "contract", borsh(crate = "near_sdk::borsh"))]
pub struct AttestationBundle {
    pub payload: AttestationPayload,
    /// `keccak256(borsh_serialize(payload))` — verified by `attestation-verifier` contract.
    pub payload_hash: Hash32,
    /// secp256k1 ECDSA signature: r (bytes 0..32) ‖ s (bytes 32..64).
    #[serde(with = "serde_sig_rs")]
    pub signature_rs: [u8; 64],
    /// Recovery id, normalised to 0 or 1 (never 27/28).
    pub signature_v: u8,
    /// Index into `attestation-verifier`'s registered signing address list.
    pub signing_key_id: u32,
}

/// Off-chain transport wrapper returned by the TEE HTTP endpoint.
///
/// Never stored on-chain. The Python FastAPI service serialises this to JSON
/// using its own Pydantic model; this Rust type exists for documentation and
/// Rust-side test utilities only.
#[cfg(not(feature = "contract"))]
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct AttestationBundleWithReport {
    pub bundle: AttestationBundle,
    /// Opaque blob: Intel TDX quote ‖ NVIDIA GPU attestation payload (JSON).
    pub tee_report: Vec<u8>,
}
