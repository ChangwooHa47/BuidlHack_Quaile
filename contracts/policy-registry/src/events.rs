use near_sdk::env;
use tee_shared::{PolicyId, PolicyStatus, Timestamp};

fn status_str(s: &PolicyStatus) -> &'static str {
    match s {
        PolicyStatus::Upcoming => "Upcoming",
        PolicyStatus::Subscribing => "Subscribing",
        PolicyStatus::Contributing => "Contributing",
        PolicyStatus::Refunding => "Refunding",
        PolicyStatus::Distributing => "Distributing",
        PolicyStatus::Closed => "Closed",
    }
}

pub fn emit_policy_registered(
    id: PolicyId,
    foundation: &str,
    ipfs_cid: &str,
    subscription_start: Timestamp,
    subscription_end: Timestamp,
) {
    let log = format!(
        r#"EVENT_JSON:{{"standard":"nep297","version":"1.0.0","event":"PolicyRegistered","data":{{"id":{},"foundation":"{}","ipfs_cid":"{}","subscription_start":{},"subscription_end":{}}}}}"#,
        id, foundation, ipfs_cid, subscription_start, subscription_end
    );
    env::log_str(&log);
}

pub fn emit_policy_updated(id: PolicyId, foundation: &str, ipfs_cid: &str) {
    let log = format!(
        r#"EVENT_JSON:{{"standard":"nep297","version":"1.0.0","event":"PolicyUpdated","data":{{"id":{},"foundation":"{}","ipfs_cid":"{}"}}}}"#,
        id, foundation, ipfs_cid
    );
    env::log_str(&log);
}

pub fn emit_policy_status_advanced(
    id: PolicyId,
    from: &PolicyStatus,
    to: &PolicyStatus,
    timestamp: Timestamp,
) {
    let log = format!(
        r#"EVENT_JSON:{{"standard":"nep297","version":"1.0.0","event":"PolicyStatusAdvanced","data":{{"id":{},"from":"{}","to":"{}","timestamp":{}}}}}"#,
        id,
        status_str(from),
        status_str(to),
        timestamp
    );
    env::log_str(&log);
}

pub fn emit_foundation_added(foundation: &str) {
    let log = format!(
        r#"EVENT_JSON:{{"standard":"nep297","version":"1.0.0","event":"FoundationAdded","data":{{"foundation":"{}"}}}}"#,
        foundation
    );
    env::log_str(&log);
}

pub fn emit_foundation_removed(foundation: &str) {
    let log = format!(
        r#"EVENT_JSON:{{"standard":"nep297","version":"1.0.0","event":"FoundationRemoved","data":{{"foundation":"{}"}}}}"#,
        foundation
    );
    env::log_str(&log);
}
