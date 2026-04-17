use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

use zk_verifier::ZkVerifier;

fn setup() -> ZkVerifier {
    let context = VMContextBuilder::new()
        .predecessor_account_id("owner.testnet".parse().unwrap())
        .build();
    testing_env!(context);

    let vk_json = r#"{"protocol":"groth16","curve":"bn128","nPublic":5}"#;
    let mut contract = ZkVerifier::new("owner.testnet".parse().unwrap(), vk_json.to_string());
    contract.set_escrow_account("escrow.testnet".parse().unwrap());
    contract
}

fn escrow_context() {
    let context = VMContextBuilder::new()
        .predecessor_account_id("escrow.testnet".parse().unwrap())
        .build();
    testing_env!(context);
}

#[test]
fn test_verify_proof_eligible() {
    let contract = setup();
    escrow_context();
    let proof = r#"{"pi_a":["1","2"],"pi_b":[["1","2"],["3","4"]],"pi_c":["1","2"]}"#;
    let public = r#"["123","456","789","101","1"]"#;
    assert!(contract.verify_proof(proof.to_string(), public.to_string()));
}

#[test]
fn test_verify_proof_ineligible() {
    let contract = setup();
    escrow_context();
    let proof = r#"{"pi_a":["1","2"],"pi_b":[["1","2"],["3","4"]],"pi_c":["1","2"]}"#;
    let public = r#"["123","456","789","101","0"]"#;
    assert!(!contract.verify_proof(proof.to_string(), public.to_string()));
}

#[test]
fn test_verify_proof_wrong_input_count() {
    let contract = setup();
    escrow_context();
    let proof = r#"{"pi_a":["1","2"]}"#;
    let public = r#"["123","456"]"#;
    assert!(!contract.verify_proof(proof.to_string(), public.to_string()));
}

#[test]
#[should_panic(expected = "Unauthorized: only escrow may verify proofs")]
fn test_verify_proof_unauthorized_caller() {
    let contract = setup();
    // Call from non-escrow account
    let context = VMContextBuilder::new()
        .predecessor_account_id("hacker.testnet".parse().unwrap())
        .build();
    testing_env!(context);
    contract.verify_proof(r#"{}"#.to_string(), r#"["0","0","0","0","1"]"#.to_string());
}

#[test]
fn test_register_verified_proof() {
    let mut contract = setup();
    let result = contract.register_verified_proof(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef".to_string(),
        true,
    );
    assert!(result);
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_register_verified_proof_unauthorized() {
    let mut contract = setup();
    let context = VMContextBuilder::new()
        .predecessor_account_id("hacker.testnet".parse().unwrap())
        .build();
    testing_env!(context);
    contract.register_verified_proof("0xabc".to_string(), true);
}

#[test]
#[should_panic(expected = "cannot register ineligible proof")]
fn test_register_ineligible_proof_panics() {
    let mut contract = setup();
    contract.register_verified_proof("0xabc".to_string(), false);
}

#[test]
fn test_update_vk() {
    let mut contract = setup();
    let new_vk = r#"{"protocol":"groth16","curve":"bn128","nPublic":5,"updated":true}"#;
    contract.update_vk(new_vk.to_string());
    assert_eq!(contract.get_verification_key(), new_vk);
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_update_vk_unauthorized() {
    let mut contract = setup();
    let context = VMContextBuilder::new()
        .predecessor_account_id("hacker.testnet".parse().unwrap())
        .build();
    testing_env!(context);
    contract.update_vk(r#"{"new":"vk"}"#.to_string());
}
