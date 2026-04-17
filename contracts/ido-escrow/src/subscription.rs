use crate::IdoEscrowExt;
use near_sdk::json_types::U128;
use near_sdk::{env, near_bindgen, require, AccountId, Gas, NearToken, Promise, PromiseError, PromiseOrValue};
use tee_shared::{
    AttestationBundle, ContributionOutcome, Hash32, Policy, PolicyId, PolicyStatus, Timestamp,
    Contribution,
};

use crate::events::{emit_contribution_created, emit_contribution_failed, emit_subscribed};
use crate::external::{ext_policy_registry, ext_self, ext_verifier, ext_zk_verifier};
use crate::state::{compute_contribution_key, compute_nonce_key, PolicyInvestorKey};
use crate::IdoEscrow;

const GAS_VIEW: Gas = Gas::from_tgas(30);
const GAS_CALLBACK_POLICY: Gas = Gas::from_tgas(90);
const GAS_CALLBACK_SIGNATURE: Gas = Gas::from_tgas(60);
const GAS_CALLBACK_ZK: Gas = Gas::from_tgas(30);

#[near_bindgen]
impl IdoEscrow {
    /// Stage 1: Subscribe (Subscribing phase).
    ///
    /// Pushes the TEE attestation + ZK proof on-chain so the investor's
    /// eligibility is sealed before the Contributing phase opens.
    /// No deposit is attached here; this call creates a Contribution record
    /// with `amount = 0` and `outcome = NotSettled`. Stage 2 (`contribute`)
    /// later fills in the amount.
    ///
    /// Phase: must be Subscribing.
    pub fn subscribe(
        &mut self,
        policy_id: PolicyId,
        bundle: AttestationBundle,
        zk_proof_json: String,
        zk_public_inputs_json: String,
    ) -> Promise {
        let investor = env::predecessor_account_id();

        // === PHASE A: sync validation ===
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
            "AlreadySubscribed"
        );

        // === PHASE B: optimistic state write (amount = 0 until contribute) ===
        let contribution = Contribution {
            investor: investor.clone(),
            policy_id,
            amount: U128(0),
            attestation_hash: bundle.payload_hash,
            outcome: ContributionOutcome::NotSettled,
            matched_amount: U128(0),
            token_amount: U128(0),
            // placeholder — updated in on_get_policy_for_subscribe
            token_contract: env::current_account_id(),
            claim_done: false,
            refund_done: false,
            created_at: env::block_timestamp(),
        };
        self.contributions.insert(&contribution_key, &contribution);
        self.used_nonces.insert(&nonce_key, &());

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

        // === PHASE C: cross-contract validation chain ===
        ext_policy_registry::ext(self.policy_registry.clone())
            .with_static_gas(GAS_VIEW)
            .get_policy(policy_id)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK_POLICY)
                    .on_get_policy_for_subscribe(
                        policy_id,
                        investor,
                        bundle,
                        zk_proof_json,
                        zk_public_inputs_json,
                    ),
            )
    }

    #[private]
    pub fn on_get_policy_for_subscribe(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        bundle: AttestationBundle,
        zk_proof_json: String,
        zk_public_inputs_json: String,
        #[callback_result] policy_result: Result<Option<Policy>, PromiseError>,
    ) -> PromiseOrValue<bool> {
        let policy = match policy_result {
            Ok(Some(p)) => p,
            _ => {
                self.rollback_subscription(&investor, policy_id, bundle.payload.nonce);
                emit_contribution_failed(investor.as_str(), policy_id, "PolicyNotFound");
                return PromiseOrValue::Value(false);
            }
        };

        if policy.status != PolicyStatus::Subscribing {
            self.rollback_subscription(&investor, policy_id, bundle.payload.nonce);
            emit_contribution_failed(investor.as_str(), policy_id, "WrongPhaseForSubscribe");
            return PromiseOrValue::Value(false);
        }

        // Cache the token_contract for later claim()
        let key = compute_contribution_key(&investor, policy_id);
        if let Some(mut c) = self.contributions.get(&key) {
            c.token_contract = policy.sale_config.token_contract.clone();
            self.contributions.insert(&key, &c);
        }

        let subscription_end = policy.sale_config.subscription_end;

        // Signature verification
        PromiseOrValue::Promise(
            ext_verifier::ext(self.attestation_verifier.clone())
                .with_static_gas(GAS_VIEW)
                .verify(bundle.clone())
                .then(
                    ext_self::ext(env::current_account_id())
                        .with_static_gas(GAS_CALLBACK_SIGNATURE)
                        .on_verify_signature_for_subscribe(
                            policy_id,
                            investor,
                            subscription_end,
                            bundle.payload_hash,
                            bundle.payload.nonce,
                            zk_proof_json,
                            zk_public_inputs_json,
                        ),
                ),
        )
    }

    #[private]
    pub fn on_verify_signature_for_subscribe(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        subscription_end: Timestamp,
        attestation_hash: Hash32,
        nonce: [u8; 32],
        zk_proof_json: String,
        zk_public_inputs_json: String,
        #[callback_result] verified: Result<bool, PromiseError>,
    ) -> PromiseOrValue<bool> {
        match verified {
            Err(_) | Ok(false) => {
                self.rollback_subscription(&investor, policy_id, nonce);
                emit_contribution_failed(investor.as_str(), policy_id, "SignatureVerificationFailed");
                PromiseOrValue::Value(false)
            }
            Ok(true) => PromiseOrValue::Promise(
                ext_zk_verifier::ext(self.zk_verifier.clone())
                    .with_static_gas(GAS_VIEW)
                    .verify_proof(zk_proof_json, zk_public_inputs_json)
                    .then(
                        ext_self::ext(env::current_account_id())
                            .with_static_gas(GAS_CALLBACK_ZK)
                            .on_zk_verified_for_subscribe(
                                policy_id,
                                investor,
                                subscription_end,
                                attestation_hash,
                                nonce,
                            ),
                    ),
            ),
        }
    }

    #[private]
    pub fn on_zk_verified_for_subscribe(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        subscription_end: Timestamp,
        attestation_hash: Hash32,
        nonce: [u8; 32],
        #[callback_result] zk_valid: Result<bool, PromiseError>,
    ) -> bool {
        match zk_valid {
            Err(_) | Ok(false) => {
                self.rollback_subscription(&investor, policy_id, nonce);
                emit_contribution_failed(investor.as_str(), policy_id, "ZkProofFailed");
                false
            }
            Ok(true) => {
                let now = env::block_timestamp();
                if now >= subscription_end {
                    self.rollback_subscription(&investor, policy_id, nonce);
                    emit_contribution_failed(investor.as_str(), policy_id, "WindowClosed");
                    return false;
                }
                emit_subscribed(investor.as_str(), policy_id, &attestation_hash, now);
                true
            }
        }
    }

    /// Stage 2: Contribute (Contributing phase).
    ///
    /// Attaches the NEAR deposit to an already-subscribed contribution.
    /// Requires that `subscribe()` was called earlier (same investor + policy).
    /// Phase: must be Contributing.
    #[payable]
    pub fn contribute(&mut self, policy_id: PolicyId) -> Promise {
        let investor = env::predecessor_account_id();
        let deposit = env::attached_deposit();

        require!(deposit.as_yoctonear() > 0, "InsufficientDeposit");

        let key = compute_contribution_key(&investor, policy_id);
        let contribution = self
            .contributions
            .get(&key)
            .expect("NotSubscribed");
        require!(contribution.amount.0 == 0, "AlreadyContributed");

        // Cross-contract: verify phase is Contributing
        ext_policy_registry::ext(self.policy_registry.clone())
            .with_static_gas(GAS_VIEW)
            .get_policy(policy_id)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK_POLICY)
                    .on_get_policy_for_contribute(
                        policy_id,
                        investor,
                        U128(deposit.as_yoctonear()),
                    ),
            )
    }

    #[private]
    pub fn on_get_policy_for_contribute(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        amount: U128,
        #[callback_result] policy_result: Result<Option<Policy>, PromiseError>,
    ) -> PromiseOrValue<bool> {
        let policy = match policy_result {
            Ok(Some(p)) => p,
            _ => {
                emit_contribution_failed(investor.as_str(), policy_id, "PolicyNotFound");
                return PromiseOrValue::Promise(
                    Promise::new(investor).transfer(NearToken::from_yoctonear(amount.0)),
                );
            }
        };

        if policy.status != PolicyStatus::Contributing {
            emit_contribution_failed(investor.as_str(), policy_id, "WrongPhaseForContribute");
            return PromiseOrValue::Promise(
                Promise::new(investor).transfer(NearToken::from_yoctonear(amount.0)),
            );
        }

        let now = env::block_timestamp();
        if now < policy.sale_config.subscription_end
            || now >= policy.sale_config.contribution_end
        {
            emit_contribution_failed(investor.as_str(), policy_id, "NotInContributionWindow");
            return PromiseOrValue::Promise(
                Promise::new(investor).transfer(NearToken::from_yoctonear(amount.0)),
            );
        }

        // Commit: write amount into the existing subscription.
        let key = compute_contribution_key(&investor, policy_id);
        let mut contribution = match self.contributions.get(&key) {
            Some(c) => c,
            None => {
                emit_contribution_failed(investor.as_str(), policy_id, "SubscriptionVanished");
                return PromiseOrValue::Promise(
                    Promise::new(investor).transfer(NearToken::from_yoctonear(amount.0)),
                );
            }
        };
        contribution.amount = amount;
        self.contributions.insert(&key, &contribution);

        let prev_total = self
            .policy_pending_total
            .get(&policy_id)
            .unwrap_or(U128(0));
        self.policy_pending_total.insert(
            &policy_id,
            &U128(prev_total.0.checked_add(amount.0).expect("overflow")),
        );

        emit_contribution_created(
            investor.as_str(),
            policy_id,
            amount.0,
            &contribution.attestation_hash,
            now,
        );
        PromiseOrValue::Value(true)
    }

    /// Rollback subscription state (no deposit to refund — subscribe is non-payable).
    #[private]
    pub fn rollback_subscription(
        &mut self,
        investor: &AccountId,
        policy_id: PolicyId,
        nonce: [u8; 32],
    ) {
        let contribution_key = compute_contribution_key(investor, policy_id);
        if self.contributions.remove(&contribution_key).is_none() {
            env::log_str("rollback: subscription already removed");
            return;
        }
        let nonce_key = compute_nonce_key(policy_id, &nonce);
        self.used_nonces.remove(&nonce_key);
        // policy_investors / count are NOT rolled back (zombie entries — settle() skips them)
    }
}
