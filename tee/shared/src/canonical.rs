use crate::attestation::{AttestationPayload, Hash32};

/// Compute keccak256 of `bytes`.
///
/// In **contract** mode, delegates to `near_sdk::env::keccak256_array` (host function).
/// In **std** mode, uses the `sha3` crate.
///
/// Both implementations produce identical output for the same input —
/// verified by the golden-vector test suite (test-02).
#[cfg(feature = "contract")]
pub fn keccak256(bytes: &[u8]) -> Hash32 {
    near_sdk::env::keccak256_array(bytes)
}

#[cfg(not(feature = "contract"))]
pub fn keccak256(bytes: &[u8]) -> Hash32 {
    use sha3::{Digest, Keccak256};
    let mut h = Keccak256::new();
    h.update(bytes);
    h.finalize().into()
}

/// Canonical hash of an [`AttestationPayload`].
///
/// `payload_hash = keccak256(borsh_serialize(payload))`
///
/// This value is stored in [`AttestationBundle.payload_hash`] and verified
/// on-chain by the `attestation-verifier` contract.
pub fn payload_hash(payload: &AttestationPayload) -> Hash32 {
    let bytes = borsh::to_vec(payload).expect("AttestationPayload borsh serialization");
    keccak256(&bytes)
}
