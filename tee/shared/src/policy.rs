use borsh::{BorshDeserialize, BorshSerialize};

use crate::{AccountId, U128};

/// NEAR block timestamp unit: nanoseconds since Unix epoch.
pub type Timestamp = u64;

/// Sequential Policy identifier, assigned by the registry contract.
pub type PolicyId = u64;

/// A foundation's IDO policy.
///
/// Invariants (enforced by `policy-registry` contract):
/// - `sale_config.subscription_start > created_at`
/// - `subscription_start < subscription_end < contribution_end < refunding_end < distributing_end`
/// - `sale_config.total_allocation > 0`, `price_per_token > 0`
/// - `foundation`, `sale_config.token_contract`, `sale_config.total_allocation` are immutable after creation.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "contract", borsh(crate = "near_sdk::borsh"))]
pub struct Policy {
    pub id: PolicyId,
    pub foundation: AccountId,
    pub name: String,
    pub ticker: String,
    pub description: String,
    pub chain: String,
    pub logo_url: String,
    pub natural_language: String,
    pub ipfs_cid: String,
    pub sale_config: SaleConfig,
    pub status: PolicyStatus,
    pub created_at: Timestamp,
}

/// On-chain phase of the IDO lifecycle.
///
/// Each phase corresponds to a time window defined by `SaleConfig` timestamps.
/// Transitions are permissionless and time-based via `advance_status`.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "contract", borsh(crate = "near_sdk::borsh"))]
pub enum PolicyStatus {
    Upcoming,
    Subscribing,
    Contributing,
    Refunding,
    Distributing,
    Closed,
}

/// Sale parameters — set at registration, editable only during Upcoming.
///
/// Time boundaries define phase transitions:
///   now < subscription_start           → Upcoming
///   subscription_start .. subscription_end   → Subscribing
///   subscription_end .. contribution_end     → Contributing
///   contribution_end .. refunding_end        → Refunding  (settle + refund)
///   refunding_end .. distributing_end        → Distributing (claim / TGE)
///   now >= distributing_end                  → Closed
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "contract", borsh(crate = "near_sdk::borsh"))]
pub struct SaleConfig {
    pub token_contract: AccountId,
    pub total_allocation: U128,
    pub price_per_token: U128,
    pub payment_token: PaymentToken,
    /// Upcoming → Subscribing
    pub subscription_start: Timestamp,
    /// Subscribing → Contributing
    pub subscription_end: Timestamp,
    /// Contributing → Refunding
    pub contribution_end: Timestamp,
    /// Refunding → Distributing
    pub refunding_end: Timestamp,
    /// Distributing → Closed
    pub distributing_end: Timestamp,
}

/// Payment denomination accepted by this IDO.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "contract", borsh(crate = "near_sdk::borsh"))]
pub enum PaymentToken {
    Near,
    Nep141(AccountId),
}
