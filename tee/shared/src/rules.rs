use serde::{Deserialize, Serialize};

/// Structured evaluation rules produced by the first LLM call (tee-04 stage 1).
///
/// The LLM transforms `Policy.natural_language` into these quantitative thresholds
/// and a qualitative prompt used in the second (judge) call.
///
/// All quantitative fields are optional — the LLM only fills in what the
/// natural-language policy specifies.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StructuredRules {
    // ── Quantitative thresholds ──────────────────────────────────────────
    /// Minimum days the investor must have held tokens on any chain.
    pub min_wallet_holding_days: Option<u32>,
    /// Minimum age of the oldest wallet in days.
    pub min_wallet_age_days: Option<u32>,
    /// Minimum total transaction count across all wallets.
    pub min_total_tx_count: Option<u32>,
    /// Minimum DAO governance votes cast on NEAR.
    pub min_dao_votes: Option<u32>,
    /// Minimum GitHub contributions in the last year.
    pub min_github_contributions: Option<u32>,
    /// Token symbols the investor must hold (e.g. `["NEAR", "REF"]`).
    pub required_token_holdings: Vec<String>,

    // ── Qualitative judge prompt ─────────────────────────────────────────
    /// Full prompt injected into the second LLM call alongside the anonymous signal.
    /// Should not reference PII fields directly.
    pub qualitative_prompt: String,

    /// Category weights; `quantitative + qualitative` must equal 1.0.
    pub weights: RuleWeights,
}

/// Relative importance of quantitative vs qualitative scoring.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RuleWeights {
    /// Weight for passing/failing quantitative thresholds (0.0–1.0).
    pub quantitative: f32,
    /// Weight for the LLM qualitative judgment (0.0–1.0).
    pub qualitative: f32,
}

impl RuleWeights {
    /// Returns `true` if weights sum to approximately 1.0 (±0.001 tolerance).
    pub fn is_valid(&self) -> bool {
        ((self.quantitative + self.qualitative) - 1.0_f32).abs() < 1e-3
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weights_valid() {
        assert!(RuleWeights { quantitative: 0.6, qualitative: 0.4 }.is_valid());
    }

    #[test]
    fn weights_invalid() {
        assert!(!RuleWeights { quantitative: 0.5, qualitative: 0.6 }.is_valid());
    }
}
