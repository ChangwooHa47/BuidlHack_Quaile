use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::{env, AccountId, BorshStorageKey};
use tee_shared::PolicyId;

/// Flat storage key for policy_investors LookupMap.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Hash)]
#[borsh(crate = "near_sdk::borsh")]
pub struct PolicyInvestorKey {
    pub policy_id: PolicyId,
    pub index: u32,
}

/// Settlement totals per policy.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, near_sdk::serde::Serialize, near_sdk::serde::Deserialize)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct PolicyTotals {
    pub total_demand: U128,
    pub total_matched: U128,
    pub ratio_bps: u16, // 0..=10000
    pub settled_at: u64,
    pub is_complete: bool,
}

#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
pub enum StorageKey {
    Contributions,
    PolicyPendingTotal,
    PolicyInvestors,
    PolicyInvestorCount,
    SettleCursor,
    UsedNonces,
    PolicyTotals,
}

/// Compute contribution key: sha256(investor_bytes || policy_id_le)
pub fn compute_contribution_key(investor: &AccountId, policy_id: PolicyId) -> [u8; 32] {
    let mut buf = Vec::with_capacity(64);
    buf.extend_from_slice(investor.as_bytes());
    buf.extend_from_slice(&policy_id.to_le_bytes());
    env::sha256_array(&buf)
}

/// Compute nonce key: keccak256(policy_id_le || nonce)
pub fn compute_nonce_key(policy_id: PolicyId, nonce: &[u8; 32]) -> [u8; 32] {
    let mut buf = [0u8; 40];
    buf[..8].copy_from_slice(&policy_id.to_le_bytes());
    buf[8..].copy_from_slice(nonce);
    env::keccak256_array(&buf)
}
