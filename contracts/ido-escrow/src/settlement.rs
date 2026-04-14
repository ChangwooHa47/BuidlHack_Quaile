use crate::IdoEscrowExt;
use near_sdk::json_types::U128;
use near_sdk::{env, near_bindgen, require, AccountId, Gas, Promise, PromiseError, PromiseOrValue};
use primitive_types::U256;
use tee_shared::{ContributionOutcome, Policy, PolicyId, PolicyStatus};

use crate::events::{
    emit_contribution_settled, emit_policy_settled, emit_settle_started,
};
use crate::external::{ext_policy_registry, ext_self};
use crate::state::{compute_contribution_key, PolicyInvestorKey, PolicyTotals};
use crate::IdoEscrow;

const GAS_VIEW: Gas = Gas::from_tgas(30);
const GAS_SETTLE_CALLBACK: Gas = Gas::from_tgas(200);
const GAS_MARK_CLOSED: Gas = Gas::from_tgas(30);
const GAS_MARK_CLOSED_CALLBACK: Gas = Gas::from_tgas(10);

#[derive(near_sdk::serde::Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct SettleProgress {
    pub processed: u32,
    pub total: u32,
    pub is_complete: bool,
    pub totals: Option<PolicyTotalsView>,
}

#[derive(near_sdk::serde::Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct PolicyTotalsView {
    pub total_demand: U128,
    pub total_matched: U128,
    pub ratio_bps: u16,
}

#[near_bindgen]
impl IdoEscrow {
    /// Permissionless keeper: settle contributions for a policy.
    /// Must be called after advance_status has moved the policy to Live.
    pub fn settle(
        &mut self,
        policy_id: PolicyId,
        max_contributions: Option<u32>,
    ) -> Promise {
        // Check if already fully settled
        if let Some(totals) = self.policy_totals.get(&policy_id) {
            require!(!totals.is_complete, "AlreadySettled");
        }

        ext_policy_registry::ext(self.policy_registry.clone())
            .with_static_gas(GAS_VIEW)
            .get_policy(policy_id)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_SETTLE_CALLBACK)
                    .on_get_policy_for_settle(policy_id, max_contributions.unwrap_or(50)),
            )
    }

    #[private]
    pub fn on_get_policy_for_settle(
        &mut self,
        policy_id: PolicyId,
        max_contributions: u32,
        #[callback_result] policy_result: Result<Option<Policy>, PromiseError>,
    ) -> PromiseOrValue<SettleProgress> {
        let policy = match policy_result {
            Ok(Some(p)) => p,
            _ => env::panic_str("PolicyNotFound"),
        };

        // First call: initialize totals
        let is_first = self.policy_totals.get(&policy_id).is_none();
        if is_first {
            require!(
                env::block_timestamp() >= policy.sale_config.subscription_end,
                "NotReadyForSettlement"
            );
            require!(
                policy.status == PolicyStatus::Live,
                "WrongPolicyStatus: must be Live"
            );

            let total_demand = self
                .policy_pending_total
                .get(&policy_id)
                .unwrap_or(U128(0))
                .0;

            let ratio_bps = if total_demand == 0 {
                10000u16
            } else {
                let supply_payment = U256::from(policy.sale_config.total_allocation.0)
                    * U256::from(policy.sale_config.price_per_token.0);
                let raw_ratio = supply_payment * U256::from(10000u64) / U256::from(total_demand);
                let ratio = raw_ratio.min(U256::from(10000u64));
                ratio.as_u64() as u16
            };

            self.policy_totals.insert(
                &policy_id,
                &PolicyTotals {
                    total_demand: U128(total_demand),
                    total_matched: U128(0),
                    ratio_bps,
                    settled_at: 0,
                    is_complete: false,
                },
            );
            self.settle_cursor.insert(&policy_id, &0u32);

            emit_settle_started(policy_id, total_demand, ratio_bps);
        }

        let mut totals = self.policy_totals.get(&policy_id).unwrap();
        let cursor = self.settle_cursor.get(&policy_id).unwrap_or(0);
        let count = self.policy_investor_count.get(&policy_id).unwrap_or(0);
        let batch_size = max_contributions.min(count.saturating_sub(cursor));
        let price_per_token = policy.sale_config.price_per_token.0;
        let now = env::block_timestamp();

        for i in cursor..cursor + batch_size {
            let investor_key = PolicyInvestorKey {
                policy_id,
                index: i,
            };
            let Some(investor) = self.policy_investors.get(&investor_key) else {
                continue; // zombie
            };
            let contribution_key = compute_contribution_key(&investor, policy_id);
            let Some(mut contribution) = self.contributions.get(&contribution_key) else {
                continue; // zombie from rollback
            };
            if contribution.outcome != ContributionOutcome::NotSettled {
                continue; // already settled somehow
            }

            let matched = (U256::from(contribution.amount.0) * U256::from(totals.ratio_bps)
                / U256::from(10000u64))
            .as_u128();
            let token = if price_per_token > 0 {
                matched / price_per_token
            } else {
                0
            };

            contribution.matched_amount = U128(matched);
            contribution.token_amount = U128(token);
            contribution.outcome = if matched == contribution.amount.0 {
                ContributionOutcome::FullMatch
            } else if matched == 0 {
                ContributionOutcome::NoMatch
            } else {
                ContributionOutcome::PartialMatch
            };

            let outcome_str = match contribution.outcome {
                ContributionOutcome::FullMatch => "FullMatch",
                ContributionOutcome::PartialMatch => "PartialMatch",
                ContributionOutcome::NoMatch => "NoMatch",
                ContributionOutcome::NotSettled => "NotSettled",
            };

            self.contributions.insert(&contribution_key, &contribution);
            totals.total_matched = U128(totals.total_matched.0 + matched);

            emit_contribution_settled(
                investor.as_str(),
                policy_id,
                outcome_str,
                matched,
                token,
                now,
            );
        }

        let new_cursor = cursor + batch_size;
        self.settle_cursor.insert(&policy_id, &new_cursor);
        self.policy_totals.insert(&policy_id, &totals);

        if new_cursor >= count {
            // Settlement complete
            let mut final_totals = self.policy_totals.get(&policy_id).unwrap();
            final_totals.is_complete = true;
            final_totals.settled_at = now;
            self.policy_totals.insert(&policy_id, &final_totals);

            emit_policy_settled(
                policy_id,
                final_totals.total_demand.0,
                final_totals.total_matched.0,
                final_totals.ratio_bps,
                now,
            );

            // mark_closed cross-contract call
            let promise = ext_policy_registry::ext(self.policy_registry.clone())
                .with_static_gas(GAS_MARK_CLOSED)
                .mark_closed(policy_id)
                .then(
                    ext_self::ext(env::current_account_id())
                        .with_static_gas(GAS_MARK_CLOSED_CALLBACK)
                        .on_mark_closed_result(policy_id),
                );
            PromiseOrValue::Promise(promise)
        } else {
            PromiseOrValue::Value(SettleProgress {
                processed: batch_size,
                total: count,
                is_complete: false,
                totals: None,
            })
        }
    }

    #[private]
    pub fn on_mark_closed_result(
        &mut self,
        policy_id: PolicyId,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> SettleProgress {
        if result.is_err() {
            env::log_str(&format!(
                "mark_closed failed for policy {}; retry needed",
                policy_id
            ));
        }
        let totals = self.policy_totals.get(&policy_id).unwrap();
        let count = self.policy_investor_count.get(&policy_id).unwrap_or(0);
        SettleProgress {
            processed: count,
            total: count,
            is_complete: true,
            totals: Some(PolicyTotalsView {
                total_demand: totals.total_demand,
                total_matched: totals.total_matched,
                ratio_bps: totals.ratio_bps,
            }),
        }
    }
}
