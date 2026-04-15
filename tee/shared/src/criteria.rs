use borsh::{BorshDeserialize, BorshSerialize};

/// Maximum number of evaluation criteria per policy.
/// Circuit is compiled with this fixed size; unused slots are padded with `true`.
pub const MAX_CRITERIA: usize = 10;

/// A single evaluation criterion extracted from the foundation's natural-language policy.
/// TEE-internal — never stored on-chain.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Criterion {
    /// Human-readable description, e.g. "Token holding >= 90 days"
    pub description: String,
    /// Whether this criterion was met by the investor.
    pub pass: bool,
}

/// The evaluation result that gets signed by the TEE and fed into the ZK circuit.
/// `results[i]` = true means criterion i passed. Indices >= `count` are padding (always true).
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "contract", borsh(crate = "near_sdk::borsh"))]
pub struct CriteriaResults {
    /// Fixed-size boolean array. `results[i]` for `i < count` = actual judgment.
    /// `results[i]` for `i >= count` = `true` (padding).
    pub results: [bool; MAX_CRITERIA],
    /// Number of actual criteria (1..=MAX_CRITERIA).
    pub count: u8,
}

impl CriteriaResults {
    /// Create from a variable-length vec of bools. Pads remaining with true.
    /// Panics if `passes.len() > MAX_CRITERIA` or `passes.is_empty()`.
    pub fn from_vec(passes: Vec<bool>) -> Self {
        assert!(!passes.is_empty(), "at least one criterion required");
        assert!(
            passes.len() <= MAX_CRITERIA,
            "too many criteria: {} > {}",
            passes.len(),
            MAX_CRITERIA
        );
        let mut results = [true; MAX_CRITERIA];
        for (i, &pass) in passes.iter().enumerate() {
            results[i] = pass;
        }
        CriteriaResults {
            results,
            count: passes.len() as u8,
        }
    }

    /// Returns true if all active criteria (0..count) passed.
    pub fn all_pass(&self) -> bool {
        self.results[..self.count as usize].iter().all(|&b| b)
    }
}
