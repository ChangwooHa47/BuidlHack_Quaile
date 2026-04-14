use crate::IdoEscrowExt;
use near_sdk::json_types::U128;
use near_sdk::{env, near_bindgen, require, AccountId, Gas, NearToken, Promise, PromiseError};
use tee_shared::{ContributionOutcome, PolicyId};

use crate::events::{emit_refund_failed, emit_refund_issued};
use crate::external::ext_self;
use crate::state::compute_contribution_key;
use crate::IdoEscrow;

const GAS_REFUND_CALLBACK: Gas = Gas::from_tgas(5);

#[near_bindgen]
impl IdoEscrow {
    /// Investor claims refund for unmatched amount after settlement.
    /// Only for PartialMatch or NoMatch outcomes.
    pub fn refund(&mut self, policy_id: PolicyId) -> Promise {
        let investor = env::predecessor_account_id();
        let key = compute_contribution_key(&investor, policy_id);
        let mut contribution = self
            .contributions
            .get(&key)
            .expect("ContributionNotFound");

        match contribution.outcome {
            ContributionOutcome::NotSettled => env::panic_str("NotSettled"),
            ContributionOutcome::FullMatch => env::panic_str("NothingToRefund"),
            ContributionOutcome::PartialMatch | ContributionOutcome::NoMatch => {}
        }

        require!(!contribution.refund_done, "AlreadyRefunded");

        let refund_amount = contribution
            .amount
            .0
            .checked_sub(contribution.matched_amount.0)
            .expect("underflow");
        require!(refund_amount > 0, "NothingToRefund");

        // Optimistic update
        contribution.refund_done = true;
        self.contributions.insert(&key, &contribution);

        Promise::new(investor.clone())
            .transfer(NearToken::from_yoctonear(refund_amount))
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_REFUND_CALLBACK)
                    .on_refund_transfer(investor, policy_id, U128(refund_amount)),
            )
    }

    #[private]
    pub fn on_refund_transfer(
        &mut self,
        investor: AccountId,
        policy_id: PolicyId,
        refund_amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        let now = env::block_timestamp();
        match result {
            Ok(()) => {
                emit_refund_issued(investor.as_str(), policy_id, refund_amount.0, now);
            }
            Err(_) => {
                // Rollback refund_done
                let key = compute_contribution_key(&investor, policy_id);
                if let Some(mut c) = self.contributions.get(&key) {
                    c.refund_done = false;
                    self.contributions.insert(&key, &c);
                }
                emit_refund_failed(investor.as_str(), policy_id, now);
            }
        }
    }
}
