//! `tee-shared` — Shared types for Buidl-NEAR AI
//!
//! This crate is the **single source of truth** for all types exchanged between:
//! - NEAR smart contracts (Rust, wasm32)
//! - TEE inference service (Python — implements same Borsh layout manually)
//! - Golden vector tests (test-02 validates Rust ↔ Python Borsh consistency)
//!
//! # Feature flags
//! | Feature | Use case | keccak256 | AccountId |
//! |---------|----------|-----------|-----------|
//! | `std` (default) | Native Rust, test utils | `sha3::Keccak256` | `String` |
//! | `contract` | NEAR wasm32 contracts | `env::keccak256_array` | `near_sdk::AccountId` |
//!
//! ```sh
//! # Contract mode (wasm32):
//! cargo build -p tee-shared --no-default-features --features contract
//! ```

pub mod attestation;
pub mod canonical;
pub mod contribution;
pub mod criteria;
pub mod policy;

// TEE-only: compiled out of contract wasm to keep binary lean
#[cfg(not(feature = "contract"))]
pub mod persona;

#[cfg(not(feature = "contract"))]
pub mod rules;

#[cfg(not(feature = "contract"))]
pub mod signal;

// ── AccountId type alias ──────────────────────────────────────────────────
// Borsh: near_sdk::AccountId and String both encode as u32_len + utf8 bytes.
#[cfg(feature = "contract")]
pub use near_sdk::AccountId;

#[cfg(not(feature = "contract"))]
pub type AccountId = String;

// ── U128 type alias ───────────────────────────────────────────────────────
// ERD uses U128 (near_sdk::json_types::U128) for all token amount fields.
// In contract mode: re-export near_sdk's U128 directly.
// In std mode: a local newtype with identical Borsh encoding (u128 LE, 16 bytes).
#[cfg(feature = "contract")]
pub use near_sdk::json_types::U128;

/// Stand-in for `near_sdk::json_types::U128` in std (non-contract) mode.
/// Borsh encoding is byte-for-byte identical: 16-byte little-endian u128.
#[cfg(not(feature = "contract"))]
#[derive(
    borsh::BorshSerialize,
    borsh::BorshDeserialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Default,
)]
pub struct U128(pub u128);

#[cfg(not(feature = "contract"))]
impl From<u128> for U128 {
    fn from(v: u128) -> Self {
        U128(v)
    }
}

#[cfg(not(feature = "contract"))]
impl From<U128> for u128 {
    fn from(v: U128) -> Self {
        v.0
    }
}

// ── Re-exports ─────────────────────────────────────────────────────────────
pub use attestation::{AttestationBundle, AttestationPayload, Hash32, Nonce, Verdict};
pub use canonical::payload_hash;
pub use contribution::{Contribution, ContributionOutcome};
pub use criteria::{CriteriaResults, Criterion, MAX_CRITERIA};
pub use policy::{PaymentToken, Policy, PolicyId, PolicyStatus, SaleConfig, Timestamp};
