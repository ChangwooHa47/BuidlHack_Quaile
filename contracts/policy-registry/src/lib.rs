mod errors;
mod events;

use errors::PolicyError;
use events::{
    emit_foundation_added, emit_foundation_removed, emit_policy_registered,
    emit_policy_status_advanced,
};

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LookupMap, UnorderedMap, UnorderedSet, Vector};
use near_sdk::{env, near_bindgen, AccountId, BorshStorageKey, PanicOnDefault};
use tee_shared::{Policy, PolicyId, PolicyStatus, SaleConfig, Timestamp};

// 1 hour in nanoseconds
const ONE_HOUR_NS: u64 = 3_600_000_000_000;

// CIDv1: starts with "ba" followed by 56+ base32 lowercase alphanumeric chars
// CIDv0: starts with "Qm" followed by 44 base58 alphanumeric chars
fn is_valid_ipfs_cid(cid: &str) -> bool {
    if cid.starts_with("ba") && cid.len() >= 58 {
        cid[2..].chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
    } else if cid.starts_with("Qm") && cid.len() == 46 {
        cid[2..].chars().all(|c| c.is_ascii_alphanumeric())
    } else {
        false
    }
}

#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    Foundations,
    Policies,
    ByFoundation,
    ByFoundationInner { foundation_hash: Vec<u8> },
    ByStatus,
    ByStatusInner { status: u8 },
}

fn status_to_u8(s: &PolicyStatus) -> u8 {
    match s {
        PolicyStatus::Upcoming => 0,
        PolicyStatus::Subscribing => 1,
        PolicyStatus::Live => 2,
        PolicyStatus::Closed => 3,
    }
}

#[near_bindgen]
#[derive(BorshSerialize, BorshDeserialize, PanicOnDefault)]
#[borsh(crate = "near_sdk::borsh")]
pub struct PolicyRegistry {
    pub owner: AccountId,
    pub foundations: UnorderedSet<AccountId>,
    pub policies: UnorderedMap<PolicyId, Policy>,
    pub next_policy_id: u64,
    pub by_foundation: LookupMap<AccountId, Vector<PolicyId>>,
    pub by_status: LookupMap<PolicyStatus, Vector<PolicyId>>,
    pub escrow_account: Option<AccountId>,
}

#[near_bindgen]
impl PolicyRegistry {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        let mut by_status = LookupMap::new(StorageKey::ByStatus);

        // Initialize vectors for all 4 statuses
        let statuses = [
            PolicyStatus::Upcoming,
            PolicyStatus::Subscribing,
            PolicyStatus::Live,
            PolicyStatus::Closed,
        ];
        for status in &statuses {
            let key = StorageKey::ByStatusInner {
                status: status_to_u8(status),
            };
            by_status.insert(&status.clone(), &Vector::new(key));
        }

        Self {
            owner,
            foundations: UnorderedSet::new(StorageKey::Foundations),
            policies: UnorderedMap::new(StorageKey::Policies),
            next_policy_id: 0,
            by_foundation: LookupMap::new(StorageKey::ByFoundation),
            by_status,
            escrow_account: None,
        }
    }

    /// Owner only: add a foundation to the whitelist.
    pub fn add_foundation(&mut self, foundation: AccountId) {
        self.assert_owner();
        self.foundations.insert(&foundation);
        emit_foundation_added(foundation.as_str());
    }

    /// Owner only: remove a foundation from the whitelist.
    pub fn remove_foundation(&mut self, foundation: AccountId) {
        self.assert_owner();
        self.foundations.remove(&foundation);
        emit_foundation_removed(foundation.as_str());
    }

    /// Foundation only: register a new policy.
    pub fn register_policy(
        &mut self,
        name: String,
        ticker: String,
        description: String,
        chain: String,
        logo_url: String,
        natural_language: String,
        ipfs_cid: String,
        sale_config: SaleConfig,
    ) -> PolicyId {
        let predecessor = env::predecessor_account_id();

        // 1. Caller must be a registered foundation
        if !self.foundations.contains(&predecessor) {
            PolicyError::NotAFoundation.panic();
        }

        // 2. natural_language length [20, 2000] chars
        let nl_chars = natural_language.chars().count();
        if nl_chars < 20 {
            PolicyError::NaturalLanguageTooShort.panic();
        }
        if nl_chars > 2000 {
            PolicyError::NaturalLanguageTooLong.panic();
        }

        // 3. Valid IPFS CID
        if !is_valid_ipfs_cid(&ipfs_cid) {
            PolicyError::InvalidIpfsCid.panic();
        }

        let now: Timestamp = env::block_timestamp();

        // 4. subscription_start > block_timestamp
        if sale_config.subscription_start <= now {
            PolicyError::InvalidSaleConfig("subscription_start must be in the future").panic();
        }

        // 5. subscription_end > subscription_start + 1 hour
        if sale_config.subscription_end <= sale_config.subscription_start + ONE_HOUR_NS {
            PolicyError::InvalidSaleConfig(
                "subscription_end must be > subscription_start + 1 hour",
            )
            .panic();
        }

        // 6. live_end > subscription_end
        if sale_config.live_end <= sale_config.subscription_end {
            PolicyError::InvalidSaleConfig("live_end must be > subscription_end").panic();
        }

        // 7. total_allocation > 0
        if sale_config.total_allocation.0 == 0 {
            PolicyError::InvalidSaleConfig("total_allocation must be > 0").panic();
        }

        // 8. price_per_token > 0
        if sale_config.price_per_token.0 == 0 {
            PolicyError::InvalidSaleConfig("price_per_token must be > 0").panic();
        }

        // 9. token_contract non-empty
        if sale_config.token_contract.as_str().is_empty() {
            PolicyError::InvalidSaleConfig("token_contract must not be empty").panic();
        }

        let id = self.next_policy_id;
        self.next_policy_id += 1;

        let policy = Policy {
            id,
            foundation: predecessor.clone(),
            name,
            ticker,
            description,
            chain,
            logo_url,
            natural_language,
            ipfs_cid: ipfs_cid.clone(),
            sale_config: sale_config.clone(),
            status: PolicyStatus::Upcoming,
            created_at: now,
        };

        self.policies.insert(&id, &policy);

        // by_foundation: lazy init
        let foundation_key = predecessor.as_bytes().to_vec();
        if self.by_foundation.get(&predecessor).is_none() {
            self.by_foundation.insert(
                &predecessor,
                &Vector::new(StorageKey::ByFoundationInner {
                    foundation_hash: foundation_key,
                }),
            );
        }
        let mut foundation_vec = self.by_foundation.get(&predecessor).unwrap();
        foundation_vec.push(&id);
        self.by_foundation.insert(&predecessor, &foundation_vec);

        // by_status: Upcoming
        let mut upcoming_vec = self
            .by_status
            .get(&PolicyStatus::Upcoming)
            .expect("Upcoming vector not initialized");
        upcoming_vec.push(&id);
        self.by_status.insert(&PolicyStatus::Upcoming, &upcoming_vec);

        emit_policy_registered(
            id,
            predecessor.as_str(),
            &ipfs_cid,
            sale_config.subscription_start,
            sale_config.subscription_end,
        );

        id
    }

    /// Permissionless keeper: advance status based on time.
    /// No-op if condition not met (no panic, no event).
    pub fn advance_status(&mut self, id: PolicyId) -> PolicyStatus {
        let mut policy = match self.policies.get(&id) {
            Some(p) => p,
            None => PolicyError::PolicyNotFound(id).panic(),
        };

        let now = env::block_timestamp();
        let new_status = match &policy.status {
            PolicyStatus::Upcoming => {
                if now >= policy.sale_config.subscription_start {
                    Some(PolicyStatus::Subscribing)
                } else {
                    None
                }
            }
            PolicyStatus::Subscribing => {
                if now >= policy.sale_config.subscription_end {
                    Some(PolicyStatus::Live)
                } else {
                    None
                }
            }
            // Live → Closed is handled by mark_closed only
            // Closed is terminal
            _ => None,
        };

        if let Some(to_status) = new_status {
            let from_status = policy.status.clone();

            // Remove from old status vector
            self.remove_from_status_vec(&from_status, id);

            // Add to new status vector
            let mut to_vec = self
                .by_status
                .get(&to_status)
                .expect("status vector not initialized");
            to_vec.push(&id);
            self.by_status.insert(&to_status, &to_vec);

            policy.status = to_status.clone();
            self.policies.insert(&id, &policy);

            emit_policy_status_advanced(id, &from_status, &to_status, now);

            to_status
        } else {
            policy.status
        }
    }

    /// Escrow account only: mark a Live policy as Closed.
    pub fn mark_closed(&mut self, id: PolicyId) {
        let escrow = match &self.escrow_account {
            Some(e) => e.clone(),
            None => PolicyError::EscrowNotSet.panic(),
        };

        if env::predecessor_account_id() != escrow {
            PolicyError::Unauthorized.panic();
        }

        let mut policy = match self.policies.get(&id) {
            Some(p) => p,
            None => PolicyError::PolicyNotFound(id).panic(),
        };

        if policy.status != PolicyStatus::Live {
            PolicyError::WrongStatusForClose.panic();
        }

        let now = env::block_timestamp();
        let from_status = policy.status.clone();

        self.remove_from_status_vec(&PolicyStatus::Live, id);

        let mut closed_vec = self
            .by_status
            .get(&PolicyStatus::Closed)
            .expect("Closed vector not initialized");
        closed_vec.push(&id);
        self.by_status.insert(&PolicyStatus::Closed, &closed_vec);

        policy.status = PolicyStatus::Closed;
        self.policies.insert(&id, &policy);

        emit_policy_status_advanced(id, &from_status, &PolicyStatus::Closed, now);
    }

    /// Owner only: set the escrow contract account.
    pub fn set_escrow_account(&mut self, escrow: AccountId) {
        self.assert_owner();
        self.escrow_account = Some(escrow);
    }

    // ── View methods ──────────────────────────────────────────────────────────

    pub fn get_policy(&self, id: PolicyId) -> Option<Policy> {
        self.policies.get(&id)
    }

    pub fn list_by_foundation(
        &self,
        foundation: AccountId,
        from: u64,
        limit: u64,
    ) -> Vec<Policy> {
        match self.by_foundation.get(&foundation) {
            None => vec![],
            Some(vec) => {
                let len = vec.len();
                if from >= len {
                    return vec![];
                }
                let end = (from + limit).min(len);
                (from..end)
                    .filter_map(|i| {
                        let policy_id = vec.get(i).unwrap();
                        self.policies.get(&policy_id)
                    })
                    .collect()
            }
        }
    }

    pub fn list_by_status(
        &self,
        status: PolicyStatus,
        from: u64,
        limit: u64,
    ) -> Vec<Policy> {
        match self.by_status.get(&status) {
            None => vec![],
            Some(vec) => {
                let len = vec.len();
                if from >= len {
                    return vec![];
                }
                let end = (from + limit).min(len);
                (from..end)
                    .filter_map(|i| {
                        let policy_id = vec.get(i).unwrap();
                        self.policies.get(&policy_id)
                    })
                    .collect()
            }
        }
    }

    pub fn total_policies(&self) -> u64 {
        self.policies.len() as u64
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn assert_owner(&self) {
        if env::predecessor_account_id() != self.owner {
            PolicyError::Unauthorized.panic();
        }
    }

    fn remove_from_status_vec(&mut self, status: &PolicyStatus, id: PolicyId) {
        let mut vec = self
            .by_status
            .get(status)
            .expect("status vector not initialized");
        let len = vec.len();
        // Find the index of id and swap-remove
        for i in 0..len {
            if vec.get(i).unwrap() == id {
                // Swap with last element and pop
                let last = vec.get(len - 1).unwrap();
                vec.replace(i, &last);
                vec.pop();
                break;
            }
        }
        self.by_status.insert(&status, &vec);
    }
}
