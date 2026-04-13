//! Borsh roundtrip and invariant tests for tee-shared types.
//!
//! Runs in std (non-contract) mode. Contract-mode / Python parity is
//! validated by the golden-vector suite in test-02.

use borsh::{BorshDeserialize, BorshSerialize};
use tee_shared::{
    attestation::{AttestationBundle, AttestationPayload, EvidenceSummary, Verdict},
    canonical::payload_hash,
    contribution::{Contribution, ContributionOutcome},
    persona::{build_canonical_message, EvmWalletProof, NearWalletProof, Persona, Wallets, FRESHNESS_NS},
    policy::{PaymentToken, Policy, PolicyStatus, SaleConfig},
    rules::{RuleWeights, StructuredRules},
};

// ── Helpers ────────────────────────────────────────────────────────────────

fn roundtrip<T>(value: &T) -> T
where
    T: BorshSerialize + BorshDeserialize + PartialEq + std::fmt::Debug,
{
    let bytes = borsh::to_vec(value).expect("serialize");
    let restored = T::try_from_slice(&bytes).expect("deserialize");
    assert_eq!(value, &restored, "roundtrip mismatch");
    restored
}

fn dummy_sale_config() -> SaleConfig {
    SaleConfig {
        token_contract: "token.testnet".to_string(),
        total_allocation: 1_000_000,
        price_per_token: 1_000,
        payment_token: PaymentToken::Near,
        subscription_start: 1_000,
        subscription_end: 2_000,
        live_end: 3_000,
    }
}

fn dummy_payload() -> AttestationPayload {
    AttestationPayload {
        subject: "alice.testnet".to_string(),
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

// ── Test 1: Policy roundtrip ───────────────────────────────────────────────

#[test]
fn policy_roundtrip() {
    let policy = Policy {
        id: 42,
        foundation: "foundation.testnet".to_string(),
        natural_language: "Prefer long-term NEAR holders with DeFi experience.".to_string(),
        ipfs_cid: "bafybeibwzifw52ttrkqlikfzext5akxu7lz4xiwjgwzmqcpdzmp3n5mbdq".to_string(),
        sale_config: dummy_sale_config(),
        status: PolicyStatus::Upcoming,
        created_at: 500,
    };
    roundtrip(&policy);
}

#[test]
fn policy_status_all_variants_roundtrip() {
    for status in [
        PolicyStatus::Upcoming,
        PolicyStatus::Subscribing,
        PolicyStatus::Live,
        PolicyStatus::Closed,
    ] {
        roundtrip(&status);
    }
}

#[test]
fn payment_token_nep141_roundtrip() {
    let token = PaymentToken::Nep141("usdt.tether-token.near".to_string());
    roundtrip(&token);
}

// ── Test 2: AttestationPayload roundtrip ──────────────────────────────────

#[test]
fn attestation_payload_roundtrip() {
    roundtrip(&dummy_payload());
}

#[test]
fn verdict_variants_roundtrip() {
    roundtrip(&Verdict::Eligible);
    roundtrip(&Verdict::Ineligible);
}

#[test]
fn evidence_summary_empty_rationale_allowed() {
    let summary = EvidenceSummary {
        wallet_count_near: 0,
        wallet_count_evm: 0,
        avg_holding_days: 0,
        total_dao_votes: 0,
        github_included: false,
        rationale: String::new(),
    };
    roundtrip(&summary);
}

// ── Test 3: payload_hash consistency ──────────────────────────────────────

#[test]
fn payload_hash_is_deterministic() {
    let p = dummy_payload();
    let h1 = payload_hash(&p);
    let h2 = payload_hash(&p);
    assert_eq!(h1, h2);
}

#[test]
fn payload_hash_changes_with_field() {
    let mut p = dummy_payload();
    let h1 = payload_hash(&p);
    p.score = 9999;
    let h2 = payload_hash(&p);
    assert_ne!(h1, h2, "different scores must produce different hashes");
}

#[test]
fn payload_hash_matches_bundle_field() {
    let payload = dummy_payload();
    let computed = payload_hash(&payload);
    let bundle = AttestationBundle {
        payload_hash: computed,
        payload,
        signature_rs: [0u8; 64],
        signature_v: 0,
        signing_key_id: 0,
    };
    roundtrip(&bundle);
    assert_eq!(bundle.payload_hash, payload_hash(&bundle.payload));
}

// ── Test 4: Contribution roundtrip ────────────────────────────────────────

#[test]
fn contribution_roundtrip() {
    let c = Contribution {
        investor: "investor.testnet".to_string(),
        policy_id: 1,
        amount: 5_000_000_000_000_000_000_000_000,
        attestation_hash: [0xAAu8; 32],
        outcome: ContributionOutcome::NotSettled,
        matched_amount: 0,
        token_amount: 0,
        token_contract: "token.testnet".to_string(),
        claim_done: false,
        refund_done: false,
        created_at: 1_700_000_000_000_000_000,
    };
    roundtrip(&c);
}

#[test]
fn contribution_outcome_all_variants() {
    for outcome in [
        ContributionOutcome::NotSettled,
        ContributionOutcome::FullMatch,
        ContributionOutcome::PartialMatch,
        ContributionOutcome::NoMatch,
    ] {
        roundtrip(&outcome);
    }
}

// ── Test 5: ERD invariants ─────────────────────────────────────────────────

#[test]
fn invariant_sale_config_time_ordering() {
    let c = dummy_sale_config();
    assert!(
        c.subscription_start < c.subscription_end,
        "subscription_start must precede subscription_end"
    );
    assert!(
        c.subscription_end < c.live_end,
        "subscription_end must precede live_end"
    );
}

#[test]
fn invariant_sale_config_nonzero_allocation() {
    let c = dummy_sale_config();
    assert!(c.total_allocation > 0);
    assert!(c.price_per_token > 0);
}

#[test]
fn invariant_payload_hash_preimage_check() {
    let p = dummy_payload();
    let bytes = borsh::to_vec(&p).unwrap();
    // Borsh bytes must be non-empty and deterministic
    assert!(!bytes.is_empty());
    assert_eq!(bytes, borsh::to_vec(&p).unwrap());
}

// ── Test 6: Persona roundtrip ─────────────────────────────────────────────

#[test]
fn persona_roundtrip() {
    let persona = Persona {
        near_account: "alice.testnet".to_string(),
        policy_id: 1,
        wallets: Wallets {
            near: vec![NearWalletProof {
                account_id: "alice.testnet".to_string(),
                public_key: "ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=".to_string(),
                signature: "base64sig==".to_string(),
                message: build_canonical_message(
                    1,
                    &[0u8; 32],
                    1_700_000_000_000_000_000,
                    "near:testnet",
                    "alice.testnet",
                ),
                timestamp: 1_700_000_000_000_000_000,
            }],
            evm: vec![EvmWalletProof {
                chain_id: 1,
                address: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef".to_string(),
                signature: "0xsig".to_string(),
                message: build_canonical_message(
                    1,
                    &[0u8; 32],
                    1_700_000_000_000_000_000,
                    "eip155:1",
                    "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
                ),
                timestamp: 1_700_000_000_000_000_000,
            }],
        },
        self_intro: "Long-term DeFi enthusiast.".to_string(),
        github_oauth_token: Some("ghp_test_token".to_string()),
        nonce: [0x11u8; 32],
        client_timestamp: 1_700_000_000_000_000_000,
    };
    roundtrip(&persona);
}

#[test]
fn freshness_ns_is_15_minutes() {
    assert_eq!(FRESHNESS_NS, 15 * 60 * 1_000_000_000);
}

// ── Test 7: StructuredRules ────────────────────────────────────────────────

#[test]
fn rule_weights_valid() {
    let w = RuleWeights { quantitative: 0.6, qualitative: 0.4 };
    assert!(w.is_valid());
}

#[test]
fn rule_weights_invalid() {
    let w = RuleWeights { quantitative: 0.7, qualitative: 0.7 };
    assert!(!w.is_valid());
}

#[test]
fn structured_rules_serde_roundtrip() {
    let rules = StructuredRules {
        min_wallet_holding_days: Some(180),
        min_wallet_age_days: None,
        min_total_tx_count: Some(50),
        min_dao_votes: None,
        min_github_contributions: Some(10),
        required_token_holdings: vec!["NEAR".to_string()],
        qualitative_prompt: "Prefer investors with DeFi experience.".to_string(),
        weights: RuleWeights { quantitative: 0.5, qualitative: 0.5 },
    };
    let json = serde_json::to_string(&rules).unwrap();
    let restored: StructuredRules = serde_json::from_str(&json).unwrap();
    assert_eq!(rules.min_wallet_holding_days, restored.min_wallet_holding_days);
    assert_eq!(rules.qualitative_prompt, restored.qualitative_prompt);
}
