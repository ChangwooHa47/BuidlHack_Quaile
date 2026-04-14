#![allow(dead_code)]

use crate::KeyId;

pub fn unauthorized() -> ! {
    near_sdk::env::panic_str("Unauthorized");
}

pub fn payload_hash_mismatch() -> ! {
    near_sdk::env::panic_str("PayloadHashMismatch");
}

pub fn invalid_v_recovery_id(v: u8) -> ! {
    near_sdk::env::panic_str(&format!("InvalidVRecoveryId({})", v));
}

pub fn key_not_registered(key_id: KeyId) -> ! {
    near_sdk::env::panic_str(&format!("KeyNotRegistered({})", key_id));
}

pub fn key_retired_no_grace(key_id: KeyId) -> ! {
    near_sdk::env::panic_str(&format!("KeyRetiredNoGrace({})", key_id));
}
