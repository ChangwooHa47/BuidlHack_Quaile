use near_sdk::json_types::U128;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, NearToken};
use policy_registry::PolicyRegistry;
use tee_shared::{PaymentToken, PolicyStatus, SaleConfig};

// ── Account helpers ───────────────────────────────────────────────────────────

fn owner() -> AccountId {
    "owner.testnet".parse().unwrap()
}
fn foundation() -> AccountId {
    "foundation.testnet".parse().unwrap()
}
fn escrow() -> AccountId {
    "escrow.testnet".parse().unwrap()
}
fn stranger() -> AccountId {
    "stranger.testnet".parse().unwrap()
}

// ── Context builder ───────────────────────────────────────────────────────────

fn context(predecessor: AccountId) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.predecessor_account_id(predecessor);
    b
}

// ── SaleConfig factory ────────────────────────────────────────────────────────

/// Returns a fully-valid SaleConfig whose subscription_start is
/// `now + start_offset_ns` nanoseconds in the future.
fn valid_sale_config(now: u64, start_offset_ns: u64) -> SaleConfig {
    SaleConfig {
        token_contract: "token.testnet".parse().unwrap(),
        total_allocation: U128(1_000_000),
        price_per_token: U128(100),
        payment_token: PaymentToken::Near,
        subscription_start: now + start_offset_ns,
        subscription_end: now + start_offset_ns + 7_200_000_000_000,   // +2 h
        live_end: now + start_offset_ns + 14_400_000_000_000,          // +4 h
    }
}

/// A natural-language string that satisfies the [20, 2000] char constraint.
fn valid_nl() -> String {
    "This is a valid natural language policy description.".to_string()
}

/// A CIDv1 that passes is_valid_ipfs_cid (starts with "ba", ≥58 chars, lowercase alnum after).
const VALID_CID: &str = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3ocirgf5de2yjvei";

// ── 1. Happy: owner adds foundation → foundation registers → get_policy returns it ──

#[test]
fn test_happy_register_and_get_policy() {
    // 1. owner adds foundation
    let now: u64 = 1_000_000_000_000;
    testing_env!(context(owner()).block_timestamp(now).build());
    let mut contract = PolicyRegistry::new(owner());
    contract.add_foundation(foundation());

    // 2. foundation registers a policy
    testing_env!(context(foundation()).block_timestamp(now).build());
    let sale_cfg = valid_sale_config(now, 3_600_000_000_000); // starts 1 h from now
    let id = contract.register_policy(valid_nl(), VALID_CID.to_string(), sale_cfg.clone());

    // 3. get_policy returns it
    let policy = contract.get_policy(id).expect("policy should exist");
    assert_eq!(policy.id, id);
    assert_eq!(policy.foundation, foundation());
    assert_eq!(policy.ipfs_cid, VALID_CID);
    assert_eq!(policy.status, PolicyStatus::Upcoming);
    assert_eq!(policy.sale_config.total_allocation, sale_cfg.total_allocation);
}

// ── 2. Happy: 2 policies registered → next_policy_id increments ──────────────

#[test]
fn test_happy_next_policy_id_increments() {
    let now: u64 = 1_000_000_000_000;
    testing_env!(context(owner()).block_timestamp(now).build());
    let mut contract = PolicyRegistry::new(owner());
    contract.add_foundation(foundation());

    testing_env!(context(foundation()).block_timestamp(now).build());
    let id0 = contract.register_policy(
        valid_nl(),
        VALID_CID.to_string(),
        valid_sale_config(now, 3_600_000_000_000),
    );

    let id1 = contract.register_policy(
        valid_nl(),
        VALID_CID.to_string(),
        valid_sale_config(now, 3_600_000_000_000),
    );

    assert_eq!(id0, 0);
    assert_eq!(id1, 1);
    assert_eq!(contract.next_policy_id, 2);
}

// ── 3. Happy: subscription_start in past → InvalidSaleConfig ─────────────────

#[test]
#[should_panic(expected = "InvalidSaleConfig")]
fn test_happy_subscription_start_in_past_panics() {
    let now: u64 = 10_000_000_000_000;
    testing_env!(context(owner()).block_timestamp(now).build());
    let mut contract = PolicyRegistry::new(owner());
    contract.add_foundation(foundation());

    testing_env!(context(foundation()).block_timestamp(now).build());
    // subscription_start = now - 1 (in the past)
    let mut bad_cfg = valid_sale_config(now, 3_600_000_000_000);
    bad_cfg.subscription_start = now - 1;
    contract.register_policy(valid_nl(), VALID_CID.to_string(), bad_cfg);
}

// ── 4. Edge: non-foundation calls register_policy → NotAFoundation ────────────

#[test]
#[should_panic(expected = "NotAFoundation")]
fn test_edge_non_foundation_register_panics() {
    let now: u64 = 1_000_000_000_000;
    testing_env!(context(owner()).block_timestamp(now).build());
    let mut contract = PolicyRegistry::new(owner());
    // Note: foundation is NOT added

    testing_env!(context(stranger()).block_timestamp(now).build());
    contract.register_policy(
        valid_nl(),
        VALID_CID.to_string(),
        valid_sale_config(now, 3_600_000_000_000),
    );
}

// ── 5. Edge: natural_language 10 chars → NaturalLanguageTooShort ─────────────

#[test]
#[should_panic(expected = "NaturalLanguageTooShort")]
fn test_edge_natural_language_too_short() {
    let now: u64 = 1_000_000_000_000;
    testing_env!(context(owner()).block_timestamp(now).build());
    let mut contract = PolicyRegistry::new(owner());
    contract.add_foundation(foundation());

    testing_env!(context(foundation()).block_timestamp(now).build());
    contract.register_policy(
        "0123456789".to_string(), // exactly 10 chars
        VALID_CID.to_string(),
        valid_sale_config(now, 3_600_000_000_000),
    );
}

// ── 6. Edge: natural_language 5000 chars → NaturalLanguageTooLong ────────────

#[test]
#[should_panic(expected = "NaturalLanguageTooLong")]
fn test_edge_natural_language_too_long() {
    let now: u64 = 1_000_000_000_000;
    testing_env!(context(owner()).block_timestamp(now).build());
    let mut contract = PolicyRegistry::new(owner());
    contract.add_foundation(foundation());

    testing_env!(context(foundation()).block_timestamp(now).build());
    let long_str = "a".repeat(5000);
    contract.register_policy(
        long_str,
        VALID_CID.to_string(),
        valid_sale_config(now, 3_600_000_000_000),
    );
}

// ── 7. Edge: ipfs_cid = "foo" → InvalidIpfsCid ───────────────────────────────

#[test]
#[should_panic(expected = "InvalidIpfsCid")]
fn test_edge_invalid_ipfs_cid() {
    let now: u64 = 1_000_000_000_000;
    testing_env!(context(owner()).block_timestamp(now).build());
    let mut contract = PolicyRegistry::new(owner());
    contract.add_foundation(foundation());

    testing_env!(context(foundation()).block_timestamp(now).build());
    contract.register_policy(
        valid_nl(),
        "foo".to_string(),
        valid_sale_config(now, 3_600_000_000_000),
    );
}

// ── 8. Edge: total_allocation = 0 → InvalidSaleConfig ────────────────────────

#[test]
#[should_panic(expected = "InvalidSaleConfig")]
fn test_edge_zero_total_allocation() {
    let now: u64 = 1_000_000_000_000;
    testing_env!(context(owner()).block_timestamp(now).build());
    let mut contract = PolicyRegistry::new(owner());
    contract.add_foundation(foundation());

    testing_env!(context(foundation()).block_timestamp(now).build());
    let mut bad_cfg = valid_sale_config(now, 3_600_000_000_000);
    bad_cfg.total_allocation = U128(0);
    contract.register_policy(valid_nl(), VALID_CID.to_string(), bad_cfg);
}

// ── 9. Edge: advance_status when time not met → returns Upcoming (no-op) ─────

#[test]
fn test_edge_advance_status_noop_before_subscription_start() {
    let now: u64 = 1_000_000_000_000;
    // Register the policy
    testing_env!(context(owner()).block_timestamp(now).build());
    let mut contract = PolicyRegistry::new(owner());
    contract.add_foundation(foundation());

    testing_env!(context(foundation()).block_timestamp(now).build());
    let start_offset = 3_600_000_000_000u64; // 1 h from now
    let id = contract.register_policy(
        valid_nl(),
        VALID_CID.to_string(),
        valid_sale_config(now, start_offset),
    );

    // Set block_timestamp BEFORE subscription_start
    let before_start = now + start_offset - 1;
    testing_env!(context(stranger()).block_timestamp(before_start).build());
    let status = contract.advance_status(id);

    assert_eq!(status, PolicyStatus::Upcoming, "status should remain Upcoming");
    assert_eq!(
        contract.get_policy(id).unwrap().status,
        PolicyStatus::Upcoming
    );
}

// ── 9b. advance_status success: time met → Subscribing ───────────────────────

#[test]
fn test_advance_status_transitions_to_subscribing() {
    let now: u64 = 1_000_000_000_000;
    testing_env!(context(owner()).block_timestamp(now).build());
    let mut contract = PolicyRegistry::new(owner());
    contract.add_foundation(foundation());

    let start_offset = 3_600_000_000_000u64;
    testing_env!(context(foundation()).block_timestamp(now).build());
    let id = contract.register_policy(
        valid_nl(),
        VALID_CID.to_string(),
        valid_sale_config(now, start_offset),
    );

    // Set block_timestamp >= subscription_start
    let at_start = now + start_offset;
    testing_env!(context(stranger()).block_timestamp(at_start).build());
    let status = contract.advance_status(id);

    assert_eq!(status, PolicyStatus::Subscribing);
    assert_eq!(
        contract.get_policy(id).unwrap().status,
        PolicyStatus::Subscribing
    );
}

// ── 10. Edge: non-escrow calls mark_closed → Unauthorized ────────────────────

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_edge_non_escrow_mark_closed_panics() {
    let now: u64 = 1_000_000_000_000;
    testing_env!(context(owner()).block_timestamp(now).build());
    let mut contract = PolicyRegistry::new(owner());
    // Set a valid escrow account
    contract.set_escrow_account(escrow());
    contract.add_foundation(foundation());

    // Register a policy
    let start_offset = 3_600_000_000_000u64;
    testing_env!(context(foundation()).block_timestamp(now).build());
    let id = contract.register_policy(
        valid_nl(),
        VALID_CID.to_string(),
        valid_sale_config(now, start_offset),
    );

    // stranger (not escrow) tries to mark_closed
    testing_env!(context(stranger()).block_timestamp(now).build());
    contract.mark_closed(id);
}

// ── 11. Edge: remove_foundation then register → NotAFoundation ───────────────

#[test]
#[should_panic(expected = "NotAFoundation")]
fn test_edge_removed_foundation_cannot_register() {
    let now: u64 = 1_000_000_000_000;
    testing_env!(context(owner()).block_timestamp(now).build());
    let mut contract = PolicyRegistry::new(owner());
    contract.add_foundation(foundation());
    // Now remove it
    contract.remove_foundation(foundation());

    // foundation tries to register after being removed
    testing_env!(context(foundation()).block_timestamp(now).build());
    contract.register_policy(
        valid_nl(),
        VALID_CID.to_string(),
        valid_sale_config(now, 3_600_000_000_000),
    );
}
