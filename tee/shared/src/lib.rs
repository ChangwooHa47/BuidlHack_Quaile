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
pub mod policy;

// TEE-only: compiled out of contract wasm to keep binary lean
#[cfg(not(feature = "contract"))]
pub mod persona;

#[cfg(not(feature = "contract"))]
pub mod rules;

#[cfg(not(feature = "contract"))]
pub mod signal;

// ── AccountId type alias ──────────────────────────────────────────────────
// Borsh encoding is identical in both modes:
//   near_sdk::AccountId  → BorshSerialize::serialize(self.as_str(), writer)  → u32_len + utf8
//   String               → u32_len + utf8
#[cfg(feature = "contract")]
pub use near_sdk::AccountId;

/// Plain `String` stand-in for `near_sdk::AccountId` in std (non-contract) mode.
/// Borsh encoding is byte-for-byte identical to the contract-mode version.
#[cfg(not(feature = "contract"))]
pub type AccountId = String;

// ── Re-exports ─────────────────────────────────────────────────────────────
pub use attestation::{
    AttestationBundle, AttestationPayload, EvidenceSummary, Hash32, Nonce, Verdict,
    RATIONALE_MAX_CHARS,
};
pub use canonical::payload_hash;
pub use contribution::{Contribution, ContributionOutcome};
pub use policy::{PaymentToken, Policy, PolicyId, PolicyStatus, SaleConfig, Timestamp};
