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

#[cfg(all(test, feature = "contract"))]
mod contract_tests {
    use super::payload_hash;
    use crate::attestation::{AttestationPayload, EvidenceSummary, Verdict};
    use near_sdk::{test_utils::VMContextBuilder, testing_env, AccountId};
    use sha3::{Digest, Keccak256};

    const GOLDEN_PAYLOAD_HASH: [u8; 32] = [
        0x24, 0xed, 0x18, 0x27, 0x5f, 0xd4, 0xf4, 0xb4,
        0xd9, 0xc2, 0x7b, 0xe3, 0x63, 0x3a, 0x3a, 0x24,
        0x02, 0x7b, 0x7f, 0x3e, 0xdf, 0x03, 0x1a, 0x3d,
        0x74, 0xe5, 0x58, 0x1e, 0x09, 0x5d, 0xbe, 0xb4,
    ];

    fn dummy_payload() -> AttestationPayload {
        AttestationPayload {
            subject: "alice.testnet".parse::<AccountId>().unwrap(),
            policy_id: 1,
            verdict: Verdict::Eligible,
            score: 8000,
            issued_at: 1_700_000_000_000_000_000,
            expires_at: 1_700_003_600_000_000_000,
            nonce: [0x42u8; 32],
            evidence_summary: EvidenceSummary {
                wallet_count_near: 1,
                wallet_count_evm: 2,
                avg_holding_days: 365,
                total_dao_votes: 5,
                github_included: true,
                rationale: "Strong long-term holder with solid on-chain history.".to_string(),
            },
            payload_version: 1,
        }
    }

    #[test]
    fn payload_hash_contract_matches_reference_keccak() {
        testing_env!(VMContextBuilder::new().build());

        let payload = dummy_payload();
        let contract_hash = payload_hash(&payload);

        let bytes = borsh::to_vec(&payload).expect("borsh serialize payload");
        let mut reference = Keccak256::new();
        reference.update(&bytes);
        let reference_hash: [u8; 32] = reference.finalize().into();

        assert_eq!(
            contract_hash, reference_hash,
            "contract feature keccak diverged from sha3 reference implementation"
        );
    }

    #[test]
    fn payload_hash_contract_matches_golden_vector() {
        testing_env!(VMContextBuilder::new().build());

        let contract_hash = payload_hash(&dummy_payload());
        assert_eq!(
            contract_hash, GOLDEN_PAYLOAD_HASH,
            "contract feature payload_hash diverged from pinned golden vector"
        );
    }
}
