use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, NearToken};
use near_sdk::json_types::U128;

use ido_escrow::IdoEscrow;
use tee_shared::{
    AttestationBundle, AttestationPayload, Contribution, ContributionOutcome, EvidenceSummary,
    PolicyId, Verdict,
};

fn owner() -> AccountId { "owner.testnet".parse().unwrap() }
fn registry() -> AccountId { "registry.testnet".parse().unwrap() }
fn verifier() -> AccountId { "verifier.testnet".parse().unwrap() }
fn investor1() -> AccountId { "investor1.testnet".parse().unwrap() }
fn investor2() -> AccountId { "investor2.testnet".parse().unwrap() }

fn context(predecessor: AccountId) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.predecessor_account_id(predecessor);
    b
}

fn init_escrow() -> IdoEscrow {
    testing_env!(context(owner()).build());
    IdoEscrow::new(owner(), registry(), verifier())
}

fn dummy_payload(subject: AccountId, policy_id: PolicyId) -> AttestationPayload {
    AttestationPayload {
        subject,
        policy_id,
        verdict: Verdict::Eligible,
        score: 8000,
        issued_at: 1_000_000_000_000_000_000,
        expires_at: 2_000_000_000_000_000_000,
        nonce: [0x42u8; 32],
        evidence_summary: EvidenceSummary {
            wallet_count_near: 1,
            wallet_count_evm: 2,
            avg_holding_days: 365,
            total_dao_votes: 5,
            github_included: true,
            rationale: "Strong holder".to_string(),
        },
        payload_version: 1,
    }
}

fn dummy_bundle(subject: AccountId, policy_id: PolicyId) -> AttestationBundle {
    let payload = dummy_payload(subject, policy_id);
    let payload_hash = tee_shared::payload_hash(&payload);
    AttestationBundle {
        payload,
        payload_hash,
        signature_rs: [0u8; 64],
        signature_v: 0,
        signing_key_id: 0,
    }
}

// ── Init tests ──────────────────────────────────────────────────────────

#[test]
fn test_init() {
    let escrow = init_escrow();
    testing_env!(context(owner()).build());
    assert_eq!(escrow.get_policy_investor_count(0), 0);
    assert_eq!(escrow.get_policy_pending_total(0).0, 0);
}

// ── View method tests ───────────────────────────────────────────────────

#[test]
fn test_get_contribution_not_found() {
    let escrow = init_escrow();
    testing_env!(context(investor1()).build());
    assert!(escrow.get_contribution(investor1(), 0).is_none());
}

#[test]
fn test_get_policy_totals_not_found() {
    let escrow = init_escrow();
    testing_env!(context(owner()).build());
    assert!(escrow.get_policy_totals(0).is_none());
}

// ── State helper tests ──────────────────────────────────────────────────

#[test]
fn test_compute_contribution_key_deterministic() {
    testing_env!(context(owner()).build());
    use ido_escrow::state::{compute_contribution_key, compute_nonce_key};

    let key1 = compute_contribution_key(&investor1(), 0);
    let key2 = compute_contribution_key(&investor1(), 0);
    assert_eq!(key1, key2);

    let key3 = compute_contribution_key(&investor2(), 0);
    assert_ne!(key1, key3);

    let key4 = compute_contribution_key(&investor1(), 1);
    assert_ne!(key1, key4);
}

#[test]
fn test_compute_nonce_key_deterministic() {
    testing_env!(context(owner()).build());
    use ido_escrow::state::compute_nonce_key;

    let nonce = [0x42u8; 32];
    let key1 = compute_nonce_key(0, &nonce);
    let key2 = compute_nonce_key(0, &nonce);
    assert_eq!(key1, key2);

    let key3 = compute_nonce_key(1, &nonce);
    assert_ne!(key1, key3);

    let other_nonce = [0x43u8; 32];
    let key4 = compute_nonce_key(0, &other_nonce);
    assert_ne!(key1, key4);
}

// ── Rollback tests ──────────────────────────────────────────────────────
// Note: contribute() requires cross-contract calls so can't be fully unit tested.
// We test the rollback helper by manually inserting state and calling rollback.

#[test]
fn test_rollback_removes_contribution() {
    let mut escrow = init_escrow();
    testing_env!(context(owner()).build());

    use ido_escrow::state::{compute_contribution_key, compute_nonce_key, PolicyInvestorKey};

    let policy_id: PolicyId = 1;
    let nonce = [0x42u8; 32];

    // Manually insert a contribution
    let key = compute_contribution_key(&investor1(), policy_id);
    let nonce_key = compute_nonce_key(policy_id, &nonce);

    let contribution = Contribution {
        investor: investor1(),
        policy_id,
        amount: U128(1000),
        attestation_hash: [0u8; 32],
        outcome: ContributionOutcome::NotSettled,
        matched_amount: U128(0),
        token_amount: U128(0),
        token_contract: "token.testnet".parse().unwrap(),
        claim_done: false,
        refund_done: false,
        created_at: 0,
    };

    escrow.contributions.insert(&key, &contribution);
    escrow.used_nonces.insert(&nonce_key, &());
    escrow.policy_pending_total.insert(&policy_id, &U128(1000));
    escrow.policy_investors.insert(
        &PolicyInvestorKey { policy_id, index: 0 },
        &investor1(),
    );
    escrow.policy_investor_count.insert(&policy_id, &1u32);

    // Verify state is set
    assert!(escrow.contributions.get(&key).is_some());
    assert_eq!(escrow.get_policy_pending_total(policy_id).0, 1000);

    // Rollback
    let refund = escrow.rollback_contribution(&investor1(), policy_id, nonce);

    assert_eq!(refund, 1000);
    assert!(escrow.contributions.get(&key).is_none());
    assert!(escrow.used_nonces.get(&nonce_key).is_none());
    assert_eq!(escrow.get_policy_pending_total(policy_id).0, 0);
    // policy_investors NOT removed (zombie pattern)
    assert_eq!(escrow.get_policy_investor_count(policy_id), 1);
}

#[test]
fn test_rollback_already_removed() {
    let mut escrow = init_escrow();
    testing_env!(context(owner()).build());

    let nonce = [0x42u8; 32];
    let refund = escrow.rollback_contribution(&investor1(), 1, nonce);
    assert_eq!(refund, 0);
}

// ── Contribution outcome tests ──────────────────────────────────────────

#[test]
fn test_contribution_outcome_variants() {
    assert_ne!(ContributionOutcome::NotSettled, ContributionOutcome::FullMatch);
    assert_ne!(ContributionOutcome::PartialMatch, ContributionOutcome::NoMatch);
}
