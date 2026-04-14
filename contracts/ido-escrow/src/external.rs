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
    fn is_eligible(&self, bundle: AttestationBundle) -> bool;
}

#[ext_contract(ext_ft)]
pub trait FungibleTokenExt {
    fn ft_transfer(&mut self, receiver_id: String, amount: U128, memo: Option<String>);
}

#[ext_contract(ext_self)]
pub trait IdoEscrowCallbacks {
    fn on_get_policy(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        bundle: AttestationBundle,
    ) -> Promise;

    fn on_is_eligible(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        subscription_end: Timestamp,
        attestation_hash: Hash32,
        nonce: [u8; 32],
    ) -> PromiseOrValue<bool>;

    fn on_get_policy_for_settle(
        &mut self,
        policy_id: PolicyId,
        max_contributions: u32,
    ) -> PromiseOrValue<crate::settlement::SettleProgress>;

    fn on_mark_closed_result(
        &mut self,
        policy_id: PolicyId,
    ) -> crate::settlement::SettleProgress;

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
