use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::{env, near_bindgen, AccountId, PanicOnDefault};

#[near_bindgen]
#[derive(BorshSerialize, BorshDeserialize, PanicOnDefault)]
#[borsh(crate = "near_sdk::borsh")]
pub struct ZkVerifier {
    pub owner: AccountId,
    pub vk_json: String,
    pub escrow_account: Option<AccountId>,
}

#[near_bindgen]
impl ZkVerifier {
    #[init]
    pub fn new(owner: AccountId, verification_key_json: String) -> Self {
        let _vk: serde_json::Value =
            serde_json::from_str(&verification_key_json).expect("invalid verification key JSON");
        Self {
            owner,
            vk_json: verification_key_json,
            escrow_account: None,
        }
    }

    /// Update the verification key (e.g., after re-running trusted setup).
    pub fn update_vk(&mut self, verification_key_json: String) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Unauthorized"
        );
        let _vk: serde_json::Value =
            serde_json::from_str(&verification_key_json).expect("invalid verification key JSON");
        self.vk_json = verification_key_json;
    }

    /// Owner-only: set the escrow account that is allowed to call verify_proof.
    pub fn set_escrow_account(&mut self, escrow: AccountId) {
        assert_eq!(env::predecessor_account_id(), self.owner, "Unauthorized");
        self.escrow_account = Some(escrow);
    }

    /// Verify a groth16 proof.
    ///
    /// `public_inputs_json`: `["limb0", "limb1", "limb2", "limb3", "eligible"]`
    ///
    /// MVP: validates structure and checks eligible == "1".
    /// Caller must be the registered escrow account — prevents external actors
    /// from exploiting the stub verifier directly.
    /// Actual pairing verification is done off-chain; will switch to on-chain
    /// alt_bn128 pairing when NEAR precompile stabilizes.
    pub fn verify_proof(
        &self,
        proof_json: String,
        public_inputs_json: String,
    ) -> bool {
        // Only the escrow contract may call verify_proof.
        if let Some(ref escrow) = self.escrow_account {
            assert_eq!(env::predecessor_account_id(), *escrow, "Unauthorized: only escrow may verify proofs");
        } else {
            env::panic_str("EscrowNotSet: call set_escrow_account first");
        }

        let _proof: serde_json::Value =
            serde_json::from_str(&proof_json).expect("invalid proof JSON");
        let public_inputs: Vec<String> =
            serde_json::from_str(&public_inputs_json).expect("invalid public inputs JSON");

        if public_inputs.len() != 5 {
            env::log_str("expected 5 public inputs");
            return false;
        }
        if public_inputs[4] != "1" {
            env::log_str("eligible output is not 1");
            return false;
        }

        true
    }

    /// Register a proof that has been verified off-chain.
    /// Called by the trusted off-chain verifier after snarkjs.groth16.verify() passes.
    pub fn register_verified_proof(
        &mut self,
        payload_hash_hex: String,
        eligible: bool,
    ) -> bool {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Unauthorized: only owner can register verified proofs"
        );
        assert!(eligible, "cannot register ineligible proof");

        env::log_str(&format!(
            r#"{{"standard":"nep297","version":"1.0.0","event":"ProofVerified","data":{{"payload_hash":"{}","eligible":{}}}}}"#,
            payload_hash_hex, eligible
        ));

        true
    }

    pub fn get_verification_key(&self) -> String {
        self.vk_json.clone()
    }
}
