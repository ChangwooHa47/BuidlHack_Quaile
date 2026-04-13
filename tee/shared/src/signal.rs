use serde::{Deserialize, Serialize};

use crate::{
    attestation::Hash32,
    policy::Timestamp,
    AccountId,
};

// ── On-chain data collected by the TEE ingestion layer ────────────────────
// These types are TEE-internal; they are never Borsh-serialized or stored
// on-chain. Serde is provided for debug logging and test fixtures.

/// On-chain signal collected for a single NEAR wallet.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NearWalletSignal {
    pub account_id: AccountId,
    pub first_seen_block: u64,
    /// Approximate days since first transaction.
    pub holding_days: u32,
    pub total_txs: u32,
    /// Native NEAR balance in yoctoNEAR.
    pub native_balance: u128,
    pub fts: Vec<FtHolding>,
    pub dao_votes: Vec<DaoVote>,
}

/// On-chain signal collected for a single EVM wallet.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EvmWalletSignal {
    pub chain_id: u64,
    /// Lowercase `"0x..."` address.
    pub address: String,
    pub first_seen_block: u64,
    pub holding_days: u32,
    /// Approximated from the account nonce.
    pub tx_count: u64,
    /// Native chain token balance in wei (big-endian U256).
    pub native_balance_wei: [u8; 32],
    pub erc20s: Vec<Erc20Holding>,
}

/// NEP-141 fungible token holding.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FtHolding {
    pub token: AccountId,
    pub balance: u128,
    pub first_acquired: Timestamp,
}

/// ERC-20 token holding on an EVM chain.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Erc20Holding {
    /// Lowercase `"0x..."` contract address.
    pub token: String,
    /// Balance in token smallest units (big-endian U256).
    pub balance_wei: [u8; 32],
    pub first_acquired_block: u64,
}

/// A single DAO governance vote on NEAR.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DaoVote {
    pub dao: AccountId,
    pub proposal_id: u64,
    /// Human-readable vote choice, e.g. `"Approve"` / `"Reject"`.
    pub vote: String,
    pub timestamp: Timestamp,
}

/// GitHub contribution signal.
/// `login_hash` replaces the raw GitHub login to avoid PII exposure.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GithubSignal {
    /// `SHA256(github_login)` — allows deduplication without exposing identity.
    pub login_hash: Hash32,
    pub public_repo_count: u32,
    pub contributions_last_year: u32,
    pub account_age_days: u32,
    /// Top programming languages by commit count.
    pub primary_languages: Vec<String>,
}

/// Aggregated signal from all wallets + GitHub, passed to the LLM judge.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AggregatedSignal {
    pub near: Vec<NearWalletSignal>,
    pub evm: Vec<EvmWalletSignal>,
    pub github: Option<GithubSignal>,
    /// True if one or more chains failed to return data (best-effort mode).
    pub partial: bool,
    /// Privacy-safe error messages (no addresses, no PII) for logging.
    pub collection_errors: Vec<String>,
}
