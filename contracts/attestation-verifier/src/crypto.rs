#![allow(dead_code)]

use near_sdk::env;

pub fn keccak256(input: &[u8]) -> [u8; 32] {
    env::keccak256_array(input)
}

pub fn ecrecover_address(
    msg_hash: &[u8; 32],
    sig_rs: &[u8; 64],
    v: u8,
) -> Option<[u8; 20]> {
    let pubkey = env::ecrecover(msg_hash, sig_rs, v, true)?;
    let hash = env::keccak256_array(&pubkey);
    let mut addr = [0u8; 20];
    addr.copy_from_slice(&hash[12..32]);
    Some(addr)
}

pub fn borsh_hash<T: near_sdk::borsh::BorshSerialize>(value: &T) -> [u8; 32] {
    let bytes = near_sdk::borsh::to_vec(value).expect("borsh serialize");
    env::keccak256_array(&bytes)
}
