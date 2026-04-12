---
id: contract-04-mock-ft
status: todo
sub: BE
layer: contract
depends_on: [infra-01-monorepo-init]
estimate: 45m
demo_step: "Upcoming (setup)"
---

# Mock NEP-141 FT 컨트랙트 (데모용 IDO 토큰)

## Context
`ido-escrow.claim()`은 `policy.sale_config.token_contract`의 `ft_transfer`를 호출한다.
데모 시나리오에 필요한 mock NEP-141 토큰 컨트랙트를 배포.

PRD §9 (dependency), test-01 Open Question 1

## Files
- `contracts/mock-ft/Cargo.toml`
- `contracts/mock-ft/src/lib.rs`
- `contracts/mock-ft/tests/unit.rs`
- `contracts/mock-ft/tests/integration.rs`

## Spec

### Rust 구현
`near-contract-standards`의 `FungibleToken` 구현체를 그대로 사용:

```rust
use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::fungible_token::metadata::{FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC};
use near_sdk::{env, near_bindgen, AccountId, PanicOnDefault, json_types::U128};
use near_sdk::borsh::{self, BorshSerialize, BorshDeserialize};

#[near_bindgen]
#[derive(BorshSerialize, BorshDeserialize, PanicOnDefault)]
pub struct Contract {
    token: FungibleToken,
    metadata: FungibleTokenMetadata,
}

#[near_bindgen]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, total_supply: U128, symbol: String, name: String) -> Self;

    /// 재단(또는 escrow) 계정에게만 storage deposit 허용 + mint 편의 함수
    pub fn mint(&mut self, account_id: AccountId, amount: U128);
}

near_contract_standards::impl_fungible_token_core!(Contract, token);
near_contract_standards::impl_fungible_token_storage!(Contract, token);
```

### 데모용 특수 기능
- `mint`: owner만 호출 가능. IDO escrow에 총 할당량 미리 지급용.
- 그 외는 표준 NEP-141

## Acceptance Criteria
- [ ] `cargo build --target wasm32-unknown-unknown --release -p mock-ft` 성공
- [ ] `init(owner, total_supply, "IDO", "Demo IDO Token")` 호출 후 owner 잔액 확인
- [ ] `storage_deposit` 후 `ft_transfer`로 다른 계정 이체
- [ ] `mint`는 owner만 호출 가능
- [ ] workspaces-tests: escrow 컨트랙트와 연동 (claim 호출 → ft_balance_of 증가)

## Test Cases
1. happy: init → ft_balance_of(owner) == total_supply
2. happy: owner → alice ft_transfer → 잔액 변경
3. happy: owner mint → target 잔액 증가
4. edge: 비-owner mint 시도 → panic Unauthorized
5. edge: storage_deposit 안 한 계정에 ft_transfer → 실패
6. edge: 0 amount ft_transfer → 거부 (NEP-141 표준)

## References
- NEP-141: https://nomicon.io/Standards/Tokens/FungibleToken/Core
- near-contract-standards: https://docs.rs/near-contract-standards/

## Open Questions
- 기존 NEP-141 wasm fixture를 써도 됨 (예: near-contract-standards 예제). MVP는 자체 빌드 권장 (배포 스크립트 단순화)
