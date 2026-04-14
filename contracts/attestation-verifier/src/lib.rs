mod crypto;
mod errors;

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::LookupMap;
use near_sdk::{env, near_bindgen, AccountId, BorshStorageKey, PanicOnDefault};
use tee_shared::{AttestationBundle, Verdict};

pub type KeyId = u32;
pub type EthAddress = [u8; 20];

#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    SigningAddresses,
    RetiredGrace,
}

#[near_bindgen]
#[derive(BorshSerialize, BorshDeserialize, PanicOnDefault)]
#[borsh(crate = "near_sdk::borsh")]
pub struct AttestationVerifier {
    pub owner: AccountId,
    pub signing_addresses: LookupMap<KeyId, EthAddress>,
    pub current_key_id: KeyId,
    pub retired_grace_until: LookupMap<KeyId, u64>,
}

#[near_bindgen]
impl AttestationVerifier {
    #[init]
    pub fn new(owner: AccountId, initial_signing_address: EthAddress) -> Self {
        let mut signing_addresses = LookupMap::new(StorageKey::SigningAddresses);
        signing_addresses.insert(&0u32, &initial_signing_address);
        Self {
            owner,
            signing_addresses,
            current_key_id: 0,
            retired_grace_until: LookupMap::new(StorageKey::RetiredGrace),
        }
    }

    pub fn rotate_key(&mut self, new_address: EthAddress, grace_seconds: u64) -> KeyId {
        if env::predecessor_account_id() != self.owner {
            errors::unauthorized();
        }

        let old_key_id = self.current_key_id;
        let new_key_id = old_key_id + 1;
        self.current_key_id = new_key_id;
        self.signing_addresses.insert(&new_key_id, &new_address);

        let grace_until = env::block_timestamp() + grace_seconds * 1_000_000_000;
        self.retired_grace_until.insert(&old_key_id, &grace_until);

        env::log_str(&format!(
            r#"{{"standard":"nep297","version":"1.0.0","event":"KeyRotated","data":{{"old_key_id":{},"new_key_id":{},"grace_until":{}}}}}"#,
            old_key_id, new_key_id, grace_until
        ));

        new_key_id
    }

    pub fn verify(&self, bundle: AttestationBundle) -> bool {
        // Step a: verify payload hash
        let computed_hash = crypto::borsh_hash(&bundle.payload);
        if computed_hash != bundle.payload_hash {
            return false;
        }

        // Step b: normalize v
        let v = if bundle.signature_v >= 27 {
            bundle.signature_v - 27
        } else {
            bundle.signature_v
        };
        if v != 0 && v != 1 {
            return false;
        }

        // Step c: ecrecover
        let recovered_address =
            match crypto::ecrecover_address(&bundle.payload_hash, &bundle.signature_rs, v) {
                Some(addr) => addr,
                None => return false,
            };

        // Step d: compare against registered signing address
        let key_id = bundle.signing_key_id;
        let registered = match self.signing_addresses.get(&key_id) {
            Some(addr) => addr,
            None => return false,
        };
        if recovered_address != registered {
            return false;
        }

        // Step e: check key validity
        if key_id == self.current_key_id {
            return true;
        }

        // Check grace period for retired key
        match self.retired_grace_until.get(&key_id) {
            Some(grace_until) => env::block_timestamp() <= grace_until,
            None => false,
        }
    }

    pub fn is_eligible(&self, bundle: AttestationBundle) -> bool {
        let expires_at = bundle.payload.expires_at;
        let verdict = bundle.payload.verdict.clone();
        let subject = bundle.payload.subject.to_string();
        let policy_id = bundle.payload.policy_id;

        let verified = self.verify(bundle);
        let eligible = verified
            && verdict == Verdict::Eligible
            && expires_at > env::block_timestamp();

        env::log_str(&format!(
            r#"{{"standard":"nep297","version":"1.0.0","event":"VerificationResult","data":{{"subject":"{}","policy_id":{},"verified":{},"eligible":{}}}}}"#,
            subject, policy_id, verified, eligible
        ));

        eligible
    }

    pub fn get_signing_address(&self, key_id: KeyId) -> Option<EthAddress> {
        self.signing_addresses.get(&key_id)
    }

    pub fn current_signing_address(&self) -> EthAddress {
        self.signing_addresses
            .get(&self.current_key_id)
            .expect("current signing address not found")
    }
}
