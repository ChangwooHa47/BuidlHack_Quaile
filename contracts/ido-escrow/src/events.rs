use near_sdk::env;
use tee_shared::PolicyId;

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

pub fn emit_contribution_created(
    investor: &str,
    policy_id: PolicyId,
    amount: u128,
    attestation_hash: &[u8; 32],
    timestamp: u64,
) {
    env::log_str(&format!(
        r#"EVENT_JSON:{{"standard":"nep297","version":"1.0.0","event":"ContributionCreated","data":{{"investor":"{}","policy_id":{},"amount":"{}","attestation_hash":"{}","timestamp":{}}}}}"#,
        investor,
        policy_id,
        amount,
        hex_encode(attestation_hash),
        timestamp
    ));
}

pub fn emit_contribution_failed(investor: &str, policy_id: PolicyId, reason: &str) {
    env::log_str(&format!(
        r#"EVENT_JSON:{{"standard":"nep297","version":"1.0.0","event":"ContributionFailed","data":{{"investor":"{}","policy_id":{},"reason":"{}"}}}}"#,
        investor, policy_id, reason
    ));
}

pub fn emit_settle_started(policy_id: PolicyId, total_demand: u128, ratio_bps: u16) {
    env::log_str(&format!(
        r#"EVENT_JSON:{{"standard":"nep297","version":"1.0.0","event":"SettleStarted","data":{{"policy_id":{},"total_demand":"{}","ratio_bps":{}}}}}"#,
        policy_id, total_demand, ratio_bps
    ));
}

pub fn emit_contribution_settled(
    investor: &str,
    policy_id: PolicyId,
    outcome: &str,
    matched_amount: u128,
    token_amount: u128,
    timestamp: u64,
) {
    env::log_str(&format!(
        r#"EVENT_JSON:{{"standard":"nep297","version":"1.0.0","event":"ContributionSettled","data":{{"investor":"{}","policy_id":{},"outcome":"{}","matched_amount":"{}","token_amount":"{}","timestamp":{}}}}}"#,
        investor, policy_id, outcome, matched_amount, token_amount, timestamp
    ));
}

pub fn emit_policy_settled(
    policy_id: PolicyId,
    total_demand: u128,
    total_matched: u128,
    ratio_bps: u16,
    timestamp: u64,
) {
    env::log_str(&format!(
        r#"EVENT_JSON:{{"standard":"nep297","version":"1.0.0","event":"PolicySettled","data":{{"policy_id":{},"total_demand":"{}","total_matched":"{}","ratio_bps":{},"timestamp":{}}}}}"#,
        policy_id, total_demand, total_matched, ratio_bps, timestamp
    ));
}

pub fn emit_token_claimed(investor: &str, policy_id: PolicyId, token_amount: u128, timestamp: u64) {
    env::log_str(&format!(
        r#"EVENT_JSON:{{"standard":"nep297","version":"1.0.0","event":"TokenClaimed","data":{{"investor":"{}","policy_id":{},"token_amount":"{}","timestamp":{}}}}}"#,
        investor, policy_id, token_amount, timestamp
    ));
}

pub fn emit_claim_failed(investor: &str, policy_id: PolicyId, timestamp: u64) {
    env::log_str(&format!(
        r#"EVENT_JSON:{{"standard":"nep297","version":"1.0.0","event":"ClaimFailed","data":{{"investor":"{}","policy_id":{},"timestamp":{}}}}}"#,
        investor, policy_id, timestamp
    ));
}

pub fn emit_refund_issued(
    investor: &str,
    policy_id: PolicyId,
    refund_amount: u128,
    timestamp: u64,
) {
    env::log_str(&format!(
        r#"EVENT_JSON:{{"standard":"nep297","version":"1.0.0","event":"RefundIssued","data":{{"investor":"{}","policy_id":{},"refund_amount":"{}","timestamp":{}}}}}"#,
        investor, policy_id, refund_amount, timestamp
    ));
}

pub fn emit_refund_failed(investor: &str, policy_id: PolicyId, timestamp: u64) {
    env::log_str(&format!(
        r#"EVENT_JSON:{{"standard":"nep297","version":"1.0.0","event":"RefundFailed","data":{{"investor":"{}","policy_id":{},"timestamp":{}}}}}"#,
        investor, policy_id, timestamp
    ));
}
