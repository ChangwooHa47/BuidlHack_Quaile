use near_sdk::ext_contract;
use near_sdk::json_types::U128;
use near_sdk::{AccountId, Promise, PromiseOrValue};
use tee_shared::{AttestationBundle, Hash32, Policy, PolicyId, Timestamp};

#[ext_contract(ext_policy_registry)]
pub trait PolicyRegistryExt {
    fn get_policy(&self, id: PolicyId) -> Option<Policy>;
    fn mark_closed(&mut self, id: PolicyId);
}

#[ext_contract(ext_verifier)]
pub trait AttestationVerifierExt {
    fn verify(&self, bundle: AttestationBundle) -> bool;
}

#[ext_contract(ext_zk_verifier)]
pub trait ZkVerifierExt {
    fn verify_proof(&self, proof_json: String, public_inputs_json: String) -> bool;
}

#[ext_contract(ext_ft)]
pub trait FungibleTokenExt {
    fn ft_transfer(&mut self, receiver_id: String, amount: U128, memo: Option<String>);
}

#[ext_contract(ext_self)]
pub trait IdoEscrowCallbacks {
    // ── Stage 1: subscribe ────────────────────────────────────────────────
    fn on_get_policy_for_subscribe(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        bundle: AttestationBundle,
        zk_proof_json: String,
        zk_public_inputs_json: String,
    ) -> PromiseOrValue<bool>;

    fn on_verify_signature_for_subscribe(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        subscription_end: Timestamp,
        attestation_hash: Hash32,
        nonce: [u8; 32],
        zk_proof_json: String,
        zk_public_inputs_json: String,
    ) -> PromiseOrValue<bool>;

    fn on_zk_verified_for_subscribe(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        subscription_end: Timestamp,
        attestation_hash: Hash32,
        nonce: [u8; 32],
    ) -> bool;

    // ── Stage 2: contribute ──────────────────────────────────────────────
    fn on_get_policy_for_contribute(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        amount: U128,
    ) -> PromiseOrValue<bool>;

    // ── Settlement ───────────────────────────────────────────────────────
    fn on_get_policy_for_settle(
        &mut self,
        policy_id: PolicyId,
        max_contributions: u32,
    ) -> PromiseOrValue<crate::settlement::SettleProgress>;

    fn on_mark_closed_result(
        &mut self,
        policy_id: PolicyId,
    ) -> crate::settlement::SettleProgress;

    // ── Claim / Refund ───────────────────────────────────────────────────
    fn on_ft_transfer_for_claim(
        &mut self,
        investor: AccountId,
        policy_id: PolicyId,
        token_amount: U128,
    );

    fn on_refund_transfer(
        &mut self,
        investor: AccountId,
        policy_id: PolicyId,
        refund_amount: U128,
    );
}
