use crate::IdoEscrowExt;
use near_sdk::json_types::U128;
use near_sdk::{env, near_bindgen, require, AccountId, Gas, NearToken, Promise, PromiseError};
use tee_shared::{ContributionOutcome, PolicyId};

use crate::events::{emit_claim_failed, emit_token_claimed};
use crate::external::{ext_ft, ext_self};
use crate::state::compute_contribution_key;
use crate::IdoEscrow;

const GAS_FT_TRANSFER: Gas = Gas::from_tgas(20);
const GAS_CLAIM_CALLBACK: Gas = Gas::from_tgas(5);

#[near_bindgen]
impl IdoEscrow {
    /// Investor claims allocated tokens after settlement.
    /// Only for FullMatch or PartialMatch outcomes.
    pub fn claim(&mut self, policy_id: PolicyId) -> Promise {
        let investor = env::predecessor_account_id();
        let key = compute_contribution_key(&investor, policy_id);
        let mut contribution = self
            .contributions
            .get(&key)
            .expect("ContributionNotFound");

        match contribution.outcome {
            ContributionOutcome::NotSettled => env::panic_str("NotSettled"),
            ContributionOutcome::NoMatch => env::panic_str("NothingToClaim"),
            ContributionOutcome::FullMatch | ContributionOutcome::PartialMatch => {}
        }

        require!(!contribution.claim_done, "AlreadyClaimed");
        require!(contribution.token_amount.0 > 0, "NothingToClaim");

        // Optimistic update
        contribution.claim_done = true;
        self.contributions.insert(&key, &contribution);

        let token_contract = contribution.token_contract.clone();
        let token_amount = contribution.token_amount;

        ext_ft::ext(token_contract)
            .with_attached_deposit(NearToken::from_yoctonear(1)) // NEP-141: 1 yoctoNEAR
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(investor.to_string(), token_amount, None)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_CLAIM_CALLBACK)
                    .on_ft_transfer_for_claim(investor, policy_id, token_amount),
            )
    }

    #[private]
    pub fn on_ft_transfer_for_claim(
        &mut self,
        investor: AccountId,
        policy_id: PolicyId,
        token_amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        let now = env::block_timestamp();
        match result {
            Ok(()) => {
                emit_token_claimed(investor.as_str(), policy_id, token_amount.0, now);
            }
            Err(_) => {
                // Rollback claim_done
                let key = compute_contribution_key(&investor, policy_id);
                if let Some(mut c) = self.contributions.get(&key) {
                    c.claim_done = false;
                    self.contributions.insert(&key, &c);
                }
                emit_claim_failed(investor.as_str(), policy_id, now);
            }
        }
    }
}
