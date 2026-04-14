mod claim;
mod events;
mod external;
mod refund;
mod settlement;
pub mod state;
mod subscription;

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::LookupMap;
use near_sdk::json_types::U128;
use near_sdk::{near_bindgen, AccountId, PanicOnDefault};
use tee_shared::{Contribution, PolicyId};

use state::{PolicyInvestorKey, PolicyTotals, StorageKey};

#[near_bindgen]
#[derive(BorshSerialize, BorshDeserialize, PanicOnDefault)]
#[borsh(crate = "near_sdk::borsh")]
pub struct IdoEscrow {
    pub owner: AccountId,
    pub policy_registry: AccountId,
    pub attestation_verifier: AccountId,

    /// key = sha256(investor_bytes || policy_id_le) → Contribution
    pub contributions: LookupMap<[u8; 32], Contribution>,

    /// Policy별 Pending 총량 (settlement 계산용)
    pub policy_pending_total: LookupMap<PolicyId, U128>,

    /// Policy별 Contribution 순차 리스트
    pub policy_investors: LookupMap<PolicyInvestorKey, AccountId>,

    /// Policy별 투자자 수
    pub policy_investor_count: LookupMap<PolicyId, u32>,

    /// Policy별 settle cursor
    pub settle_cursor: LookupMap<PolicyId, u32>,

    /// 사용된 nonce (replay 방지)
    pub used_nonces: LookupMap<[u8; 32], ()>,

    /// Policy별 Settlement 결과
    pub policy_totals: LookupMap<PolicyId, PolicyTotals>,
}

#[near_bindgen]
impl IdoEscrow {
    #[init]
    pub fn new(
        owner: AccountId,
        policy_registry: AccountId,
        attestation_verifier: AccountId,
    ) -> Self {
        Self {
            owner,
            policy_registry,
            attestation_verifier,
            contributions: LookupMap::new(StorageKey::Contributions),
            policy_pending_total: LookupMap::new(StorageKey::PolicyPendingTotal),
            policy_investors: LookupMap::new(StorageKey::PolicyInvestors),
            policy_investor_count: LookupMap::new(StorageKey::PolicyInvestorCount),
            settle_cursor: LookupMap::new(StorageKey::SettleCursor),
            used_nonces: LookupMap::new(StorageKey::UsedNonces),
            policy_totals: LookupMap::new(StorageKey::PolicyTotals),
        }
    }

    // ── View methods ──────────────────────────────────────────────────────────

    pub fn get_contribution(
        &self,
        investor: AccountId,
        policy_id: PolicyId,
    ) -> Option<Contribution> {
        let key = state::compute_contribution_key(&investor, policy_id);
        self.contributions.get(&key)
    }

    pub fn get_policy_totals(&self, policy_id: PolicyId) -> Option<PolicyTotals> {
        self.policy_totals.get(&policy_id)
    }

    pub fn get_policy_pending_total(&self, policy_id: PolicyId) -> U128 {
        self.policy_pending_total
            .get(&policy_id)
            .unwrap_or(U128(0))
    }

    pub fn get_policy_investor_count(&self, policy_id: PolicyId) -> u32 {
        self.policy_investor_count.get(&policy_id).unwrap_or(0)
    }
}
