use near_contract_standards::fungible_token::FungibleTokenCore;
use near_contract_standards::storage_management::StorageManagement;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, NearToken};
use near_sdk::json_types::U128;

use mock_ft::Contract;

fn owner() -> AccountId {
    "owner.testnet".parse().unwrap()
}
fn alice() -> AccountId {
    "alice.testnet".parse().unwrap()
}
fn other() -> AccountId {
    "other.testnet".parse().unwrap()
}

fn context(predecessor: AccountId) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.predecessor_account_id(predecessor);
    b
}

fn init_contract() -> Contract {
    testing_env!(context(owner()).build());
    Contract::new(owner(), U128(1_000_000), "IDO".to_string(), "Demo IDO Token".to_string())
}

#[test]
fn test_init_balance() {
    let contract = init_contract();
    testing_env!(context(owner()).build());
    let balance = contract.ft_balance_of(owner());
    assert_eq!(balance.0, 1_000_000);
}

#[test]
fn test_ft_metadata() {
    let contract = init_contract();
    testing_env!(context(owner()).build());
    use near_contract_standards::fungible_token::metadata::FungibleTokenMetadataProvider;
    let metadata = contract.ft_metadata();
    assert_eq!(metadata.symbol, "IDO");
    assert_eq!(metadata.name, "Demo IDO Token");
    assert_eq!(metadata.decimals, 24);
}

#[test]
fn test_mint_by_owner() {
    let mut contract = init_contract();
    // Register alice first via storage_deposit
    testing_env!(context(alice())
        .attached_deposit(NearToken::from_millinear(100))
        .build());
    contract.storage_deposit(Some(alice()), None);

    // Owner mints to alice
    testing_env!(context(owner()).build());
    contract.mint(alice(), U128(500));
    assert_eq!(contract.ft_balance_of(alice()).0, 500);
}

#[test]
#[should_panic(expected = "Unauthorized: only owner can mint")]
fn test_mint_non_owner_panics() {
    let mut contract = init_contract();
    testing_env!(context(other()).build());
    contract.mint(alice(), U128(500));
}

#[test]
fn test_ft_transfer() {
    let mut contract = init_contract();

    // Register alice
    testing_env!(context(alice())
        .attached_deposit(NearToken::from_millinear(100))
        .build());
    contract.storage_deposit(Some(alice()), None);

    // Owner transfers to alice
    testing_env!(context(owner())
        .attached_deposit(NearToken::from_yoctonear(1))
        .build());
    contract.ft_transfer(alice(), U128(100), None);
    assert_eq!(contract.ft_balance_of(alice()).0, 100);
    assert_eq!(contract.ft_balance_of(owner()).0, 999_900);
}
