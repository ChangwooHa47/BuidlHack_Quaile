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
/// - `subscription_start < subscription_end < live_end`
/// - `sale_config.total_allocation > 0`, `price_per_token > 0`
/// - `foundation`, `sale_config.token_contract`, `sale_config.total_allocation` are immutable after creation.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "contract", borsh(crate = "near_sdk::borsh"))]
pub struct Policy {
    pub id: PolicyId,
    pub foundation: AccountId,
    /// Project display name (e.g. "Walrus").
    pub name: String,
    /// Token ticker symbol (e.g. "W").
    pub ticker: String,
    /// Short project description for card/hero display.
    pub description: String,
    /// Primary chain of the project (e.g. "SUI", "NEAR", "SOL").
    pub chain: String,
    /// Logo URL for project avatar (placeholder or IPFS gateway URL).
    pub logo_url: String,
    /// Full natural-language selection criteria (also backed to IPFS).
    pub natural_language: String,
    /// IPFS CID of the policy document (e.g. "bafybeib...").
    pub ipfs_cid: String,
    pub sale_config: SaleConfig,
    pub status: PolicyStatus,
    pub created_at: Timestamp,
}

/// On-chain phase of the IDO.
///
/// NOTE: The sub-statuses used in the UI (Subscription / Review / Contribution /
/// Settlement / Refund / Claim) are **off-chain labels only**. The contract stores
/// only these four variants.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "contract", borsh(crate = "near_sdk::borsh"))]
pub enum PolicyStatus {
    Upcoming,
    Subscribing,
    Live,
    Closed,
}

/// Sale parameters — immutable once the policy is created.
///
/// `live_start` is not a separate field: `live_start := subscription_end`.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "contract", borsh(crate = "near_sdk::borsh"))]
pub struct SaleConfig {
    pub token_contract: AccountId,
    /// Total IDO token allocation in token-smallest-units.
    pub total_allocation: U128,
    /// Price per token in `payment_token` smallest units.
    pub price_per_token: U128,
    pub payment_token: PaymentToken,
    /// Block timestamp at which Upcoming → Subscribing transition becomes valid.
    pub subscription_start: Timestamp,
    /// Block timestamp at which Subscribing → Live transition becomes valid.
    /// Also acts as `live_start`.
    pub subscription_end: Timestamp,
    /// Block timestamp at which Live → Closed transition becomes valid.
    pub live_end: Timestamp,
}

/// Payment denomination accepted by this IDO.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "contract", borsh(crate = "near_sdk::borsh"))]
pub enum PaymentToken {
    /// Native NEAR token (yoctoNEAR).
    Near,
    /// NEP-141 fungible token at the given contract address.
    Nep141(AccountId),
}
