use borsh::{BorshDeserialize, BorshSerialize};

use crate::{
    attestation::Hash32,
    policy::{PolicyId, Timestamp},
    AccountId, U128,
};

/// An investor's capital deposit for a specific policy.
///
/// Stored on-chain in `ido-escrow`.
/// `(investor, policy_id)` is the compound primary key — duplicates are rejected.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "contract", borsh(crate = "near_sdk::borsh"))]
pub struct Contribution {
    pub investor: AccountId,
    pub policy_id: PolicyId,
    /// Amount deposited in `payment_token` smallest units.
    pub amount: U128,
    /// `AttestationBundle.payload_hash` that authorised this contribution.
    pub attestation_hash: Hash32,
    /// Settlement result. Immutable once set by `settle()`.
    pub outcome: ContributionOutcome,
    /// Confirmed matched amount after settlement. 0 before settlement.
    pub matched_amount: U128,
    /// Token amount receivable: `matched_amount / price_per_token`. 0 before settlement.
    pub token_amount: U128,
    /// Cached from the policy at contribution time; used as `ft_transfer` target in `claim()`.
    pub token_contract: AccountId,
    /// Set to `true` after `claim()` succeeds. Cannot be undone.
    pub claim_done: bool,
    /// Set to `true` after `refund()` succeeds. Cannot be undone.
    pub refund_done: bool,
    pub created_at: Timestamp,
}

/// Settlement outcome for a [`Contribution`].
///
/// `outcome` is set once by `settle()` and is thereafter immutable.
/// `claim_done` / `refund_done` track subsequent investor actions independently.
///
/// | outcome        | claim() | refund()          |
/// |----------------|---------|-------------------|
/// | NotSettled     | ✗       | ✗                 |
/// | FullMatch      | ✓       | ✗                 |
/// | PartialMatch   | ✓       | ✓ (independently) |
/// | NoMatch        | ✗       | ✓                 |
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "contract", borsh(crate = "near_sdk::borsh"))]
pub enum ContributionOutcome {
    /// Before `settle()` is called.
    NotSettled,
    /// `matched_amount == amount`.
    FullMatch,
    /// `0 < matched_amount < amount`.
    PartialMatch,
    /// `matched_amount == 0`.
    NoMatch,
}
