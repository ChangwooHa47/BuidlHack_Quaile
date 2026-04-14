use crate::IdoEscrowExt;
use near_sdk::json_types::U128;
use near_sdk::{env, near_bindgen, require, AccountId, Gas, NearToken, Promise, PromiseError, PromiseOrValue};
use tee_shared::{
    AttestationBundle, ContributionOutcome, Hash32, Policy, PolicyId, PolicyStatus, Timestamp,
    Contribution,
};

use crate::events::{emit_contribution_created, emit_contribution_failed};
use crate::external::{ext_policy_registry, ext_self, ext_verifier};
use crate::state::{compute_contribution_key, compute_nonce_key, PolicyInvestorKey};
use crate::IdoEscrow;

const GAS_VIEW: Gas = Gas::from_tgas(30);
const GAS_CALLBACK_POLICY: Gas = Gas::from_tgas(60);
const GAS_CALLBACK_ELIGIBLE: Gas = Gas::from_tgas(30);

#[near_bindgen]
impl IdoEscrow {
    /// Investor entry point. Attach NEAR deposit to contribute to a policy.
    #[payable]
    pub fn contribute(&mut self, policy_id: PolicyId, bundle: AttestationBundle) -> Promise {
        let investor = env::predecessor_account_id();
        let deposit = env::attached_deposit();

        // === PHASE A: sync validation (panic → automatic refund) ===
        require!(deposit.as_yoctonear() > 0, "InsufficientDeposit");
        require!(
            bundle.payload.subject == investor,
            "SubjectMismatch"
        );
        require!(
            bundle.payload.policy_id == policy_id,
            "PolicyIdMismatch"
        );
        require!(
            env::block_timestamp() <= bundle.payload.expires_at,
            "AttestationExpired"
        );

        let nonce_key = compute_nonce_key(policy_id, &bundle.payload.nonce);
        require!(
            !self.used_nonces.contains_key(&nonce_key),
            "NonceReused"
        );

        let contribution_key = compute_contribution_key(&investor, policy_id);
        require!(
            !self.contributions.contains_key(&contribution_key),
            "AlreadyContributed"
        );

        // === PHASE B: optimistic state write ===
        let amount_u128 = deposit.as_yoctonear();
        let contribution = Contribution {
            investor: investor.clone(),
            policy_id,
            amount: U128(amount_u128),
            attestation_hash: bundle.payload_hash,
            outcome: ContributionOutcome::NotSettled,
            matched_amount: U128(0),
            token_amount: U128(0),
            // placeholder — updated in on_get_policy with actual token_contract
            token_contract: env::current_account_id(),
            claim_done: false,
            refund_done: false,
            created_at: env::block_timestamp(),
        };
        self.contributions.insert(&contribution_key, &contribution);
        self.used_nonces.insert(&nonce_key, &());

        let prev_total = self
            .policy_pending_total
            .get(&policy_id)
            .unwrap_or(U128(0));
        self.policy_pending_total.insert(
            &policy_id,
            &U128(prev_total.0.checked_add(amount_u128).expect("overflow")),
        );

        let count = self.policy_investor_count.get(&policy_id).unwrap_or(0);
        self.policy_investors.insert(
            &PolicyInvestorKey {
                policy_id,
                index: count,
            },
            &investor,
        );
        self.policy_investor_count
            .insert(&policy_id, &(count + 1));

        // === PHASE C: cross-contract Promise chain ===
        ext_policy_registry::ext(self.policy_registry.clone())
            .with_static_gas(GAS_VIEW)
            .get_policy(policy_id)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK_POLICY)
                    .on_get_policy(policy_id, investor, bundle),
            )
    }

    #[private]
    pub fn on_get_policy(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        bundle: AttestationBundle,
        #[callback_result] policy_result: Result<Option<Policy>, PromiseError>,
    ) -> Promise {
        let policy = match policy_result {
            Ok(Some(p)) => p,
            _ => {
                let refund = self.rollback_contribution(&investor, policy_id, bundle.payload.nonce);
                emit_contribution_failed(investor.as_str(), policy_id, "PolicyNotFound");
                return Promise::new(investor).transfer(NearToken::from_yoctonear(refund));
            }
        };

        if policy.status != PolicyStatus::Subscribing {
            let refund = self.rollback_contribution(&investor, policy_id, bundle.payload.nonce);
            emit_contribution_failed(investor.as_str(), policy_id, "WrongPhase");
            return Promise::new(investor).transfer(NearToken::from_yoctonear(refund));
        }

        let now = env::block_timestamp();
        if now < policy.sale_config.subscription_start
            || now >= policy.sale_config.subscription_end
        {
            let refund = self.rollback_contribution(&investor, policy_id, bundle.payload.nonce);
            emit_contribution_failed(investor.as_str(), policy_id, "NotInSubscriptionWindow");
            return Promise::new(investor).transfer(NearToken::from_yoctonear(refund));
        }

        // Update token_contract from the actual policy
        let key = compute_contribution_key(&investor, policy_id);
        if let Some(mut c) = self.contributions.get(&key) {
            c.token_contract = policy.sale_config.token_contract.clone();
            self.contributions.insert(&key, &c);
        }

        let subscription_end = policy.sale_config.subscription_end;

        ext_verifier::ext(self.attestation_verifier.clone())
            .with_static_gas(GAS_VIEW)
            .is_eligible(bundle.clone())
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK_ELIGIBLE)
                    .on_is_eligible(
                        policy_id,
                        investor,
                        subscription_end,
                        bundle.payload_hash,
                        bundle.payload.nonce,
                    ),
            )
    }

    #[private]
    pub fn on_is_eligible(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        subscription_end: Timestamp,
        attestation_hash: Hash32,
        nonce: [u8; 32],
        #[callback_result] eligible: Result<bool, PromiseError>,
    ) -> PromiseOrValue<bool> {
        match eligible {
            Err(_) | Ok(false) => {
                let refund = self.rollback_contribution(&investor, policy_id, nonce);
                emit_contribution_failed(investor.as_str(), policy_id, "IneligibleAttestation");
                PromiseOrValue::Promise(
                    Promise::new(investor).transfer(NearToken::from_yoctonear(refund)),
                )
            }
            Ok(true) => {
                let now = env::block_timestamp();
                if now >= subscription_end {
                    let refund = self.rollback_contribution(&investor, policy_id, nonce);
                    emit_contribution_failed(investor.as_str(), policy_id, "WindowClosed");
                    return PromiseOrValue::Promise(
                        Promise::new(investor).transfer(NearToken::from_yoctonear(refund)),
                    );
                }

                emit_contribution_created(
                    investor.as_str(),
                    policy_id,
                    self.contributions
                        .get(&compute_contribution_key(&investor, policy_id))
                        .map(|c| c.amount.0)
                        .unwrap_or(0),
                    &attestation_hash,
                    now,
                );
                PromiseOrValue::Value(true)
            }
        }
    }

    /// Rollback contribution state and return refund amount.
    pub fn rollback_contribution(
        &mut self,
        investor: &AccountId,
        policy_id: PolicyId,
        nonce: [u8; 32],
    ) -> u128 {
        let contribution_key = compute_contribution_key(investor, policy_id);
        let Some(c) = self.contributions.remove(&contribution_key) else {
            env::log_str("rollback: contribution already removed");
            return 0;
        };
        let nonce_key = compute_nonce_key(policy_id, &nonce);
        self.used_nonces.remove(&nonce_key);
        let prev = self
            .policy_pending_total
            .get(&policy_id)
            .unwrap_or(U128(0))
            .0;
        let new_total = prev.checked_sub(c.amount.0).unwrap_or(0);
        self.policy_pending_total
            .insert(&policy_id, &U128(new_total));
        // policy_investors / count are NOT rolled back (zombie entries — settle() skips them)
        c.amount.0
    }
}
