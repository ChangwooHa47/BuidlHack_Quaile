//! Borsh roundtrip and invariant tests for tee-shared types.
//!
//! Runs in std (non-contract) mode. Contract-mode / Python parity is
//! validated by the golden-vector suite in test-02.

#![cfg(not(feature = "contract"))]

use borsh::{BorshDeserialize, BorshSerialize};
use tee_shared::{
    attestation::{AttestationBundle, AttestationPayload, Verdict},
    canonical::payload_hash,
    contribution::{Contribution, ContributionOutcome},
    criteria::CriteriaResults,
    persona::{build_canonical_message, EvmWalletProof, NearWalletProof, Persona, Wallets, FRESHNESS_NS},
    policy::{PaymentToken, Policy, PolicyStatus, SaleConfig},
    rules::{RuleWeights, StructuredRules},
    U128,
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
        total_allocation: U128(1_000_000),
        price_per_token: U128(1_000),
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
        issued_at: 1_700_000_000_000_000_000,
        expires_at: 1_700_003_600_000_000_000,
        nonce: [0x42u8; 32],
        criteria_results: CriteriaResults::from_vec(vec![true, true, true, true, true, true]),
        payload_version: 2,
    }
}

// ── Test 1: Policy roundtrip ───────────────────────────────────────────────

#[test]
fn policy_roundtrip() {
    let policy = Policy {
        id: 42,
        foundation: "foundation.testnet".to_string(),
        name: "Test Project".to_string(),
        ticker: "TST".to_string(),
        description: "A test project for roundtrip testing.".to_string(),
        chain: "NEAR".to_string(),
        logo_url: "https://placehold.co/128".to_string(),
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
fn criteria_results_roundtrip() {
    let cr = CriteriaResults::from_vec(vec![true, true, true]);
    roundtrip(&cr);
}

#[test]
fn criteria_results_all_pass() {
    assert!(CriteriaResults::from_vec(vec![true, true, true]).all_pass());
    assert!(!CriteriaResults::from_vec(vec![true, false, true]).all_pass());
}

#[test]
fn criteria_results_padding() {
    let cr = CriteriaResults::from_vec(vec![true, true, true]);
    assert_eq!(cr.count, 3);
    // padding slots must be true
    for i in 3..10 {
        assert!(cr.results[i]);
    }
}

#[test]
#[should_panic(expected = "at least one criterion required")]
fn criteria_results_empty_panics() {
    CriteriaResults::from_vec(vec![]);
}

#[test]
#[should_panic(expected = "too many criteria")]
fn criteria_results_overflow_panics() {
    CriteriaResults::from_vec(vec![true; 11]);
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
    p.criteria_results = CriteriaResults::from_vec(vec![true, false, true]);
    let h2 = payload_hash(&p);
    assert_ne!(h1, h2, "different criteria must produce different hashes");
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
        amount: U128(5_000_000_000_000_000_000_000_000),
        attestation_hash: [0xAAu8; 32],
        outcome: ContributionOutcome::NotSettled,
        matched_amount: U128(0),
        token_amount: U128(0),
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
    assert!(c.total_allocation > U128(0));
    assert!(c.price_per_token > U128(0));
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

// ── Test 8: payload_hash golden vector ────────────────────────────────────
//
// Golden vector will be recomputed in zk-08 after all schema changes settle.
// For now, just verify determinism and cross-feature consistency.

// Golden vector dummy uses the spec from zk-08:
// criteria_results = [true; 10], count = 6, payload_version = 2
fn golden_dummy_payload() -> AttestationPayload {
    AttestationPayload {
        subject: "alice.testnet".to_string(),
        policy_id: 1,
        verdict: Verdict::Eligible,
        issued_at: 1_700_000_000_000_000_000,
        expires_at: 1_700_003_600_000_000_000,
        nonce: [0x42u8; 32],
        criteria_results: CriteriaResults {
            results: [true; 10],
            count: 6,
        },
        payload_version: 2,
    }
}

#[test]
fn payload_hash_std_is_deterministic_and_nonzero() {
    let h = payload_hash(&golden_dummy_payload());
    assert_ne!(h, [0u8; 32], "payload_hash must not be all-zero");
    assert_eq!(h, payload_hash(&golden_dummy_payload()));
}

const GOLDEN_PAYLOAD_HASH: [u8; 32] = [
    0xd7, 0x4e, 0xe7, 0x8f, 0xe3, 0xae, 0x2d, 0x96,
    0x95, 0x39, 0xea, 0x33, 0x86, 0xa0, 0xc1, 0xe4,
    0x36, 0xb9, 0x94, 0x07, 0x67, 0x71, 0xcc, 0x45,
    0xb1, 0xdc, 0xee, 0x75, 0x4e, 0xd9, 0x76, 0x91,
];

#[test]
fn payload_hash_std_golden_vector() {
    let computed = payload_hash(&golden_dummy_payload());
    assert_eq!(
        computed, GOLDEN_PAYLOAD_HASH,
        "payload_hash diverged from golden vector — \
         either the Borsh layout or the keccak256 impl changed.\n\
         hex: {}",
        computed.iter().map(|b| format!("{:02x}", b)).collect::<String>(),
    );
}

#[test]
fn payload_hash_golden_hex_string() {
    let hex: String = GOLDEN_PAYLOAD_HASH
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect();
    assert_eq!(
        hex,
        "d74ee78fe3ae2d969539ea3386a0c1e436b994076771cc45b1dcee754ed97691",
    );
}
