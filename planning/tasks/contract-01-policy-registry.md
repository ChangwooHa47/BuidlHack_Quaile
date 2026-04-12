---
id: contract-01-policy-registry
status: todo
sub: BE
layer: contract
depends_on: [infra-01-monorepo-init, tee-01-persona-schema]
estimate: 2h
demo_step: "Upcoming"
---

# Policy Registry 컨트랙트

## Context
재단이 자연어 Policy + IDO 세일 조건을 등록.
Phase×Status state machine의 Upcoming → Subscribing → Live → Closed 전이 소스.
PRD FR-PR-1 ~ FR-PR-7
ERD §3.2, §5.1

## Files
- `contracts/policy-registry/Cargo.toml`
- `contracts/policy-registry/src/lib.rs`
- `contracts/policy-registry/src/state.rs`
- `contracts/policy-registry/src/foundation.rs`
- `contracts/policy-registry/src/transitions.rs`
- `contracts/policy-registry/src/errors.rs`
- `contracts/policy-registry/tests/unit.rs`
- `contracts/policy-registry/tests/integration.rs`

## Spec

### 상태
```rust
use tee_shared::{Policy, PolicyId, PolicyStatus, SaleConfig, PaymentToken, Timestamp};

#[near_bindgen]
#[derive(BorshSerialize, BorshDeserialize, PanicOnDefault)]
pub struct PolicyRegistry {
    pub owner: AccountId,
    pub foundations: UnorderedSet<AccountId>,
    pub policies: UnorderedMap<PolicyId, Policy>,
    pub next_policy_id: u64,
    pub by_foundation: LookupMap<AccountId, Vector<PolicyId>>,
    pub by_status: LookupMap<PolicyStatus, Vector<PolicyId>>,
}
```

### 메서드
```rust
#[near_bindgen]
impl PolicyRegistry {
    #[init]
    pub fn new(owner: AccountId) -> Self;

    /// Owner만 호출 가능. 재단 whitelist 추가.
    pub fn add_foundation(&mut self, foundation: AccountId);
    pub fn remove_foundation(&mut self, foundation: AccountId);

    /// 재단이 호출. natural_language는 원문 텍스트, ipfs_cid는 원문 백업 포인터.
    pub fn register_policy(
        &mut self,
        natural_language: String,
        ipfs_cid: String,
        sale_config: SaleConfig,
    ) -> PolicyId;

    /// Permissionless keeper. 시간 기준으로 status를 한 단계 앞으로.
    /// - Upcoming → Subscribing (block_timestamp >= subscription_start)
    /// - Subscribing → Live (block_timestamp >= subscription_end)
    /// - Live → Closed는 이 메서드가 수행하지 않음 (mark_closed 전용)
    ///
    /// **no-op 정책**: 조건 미충족 시 panic하지 않고 현재 status를 그대로 반환.
    /// 이벤트도 발행하지 않음. keeper가 반복 호출해도 안전.
    pub fn advance_status(&mut self, id: PolicyId) -> PolicyStatus;

    /// ido-escrow만 호출 가능. Live → Closed 강제 전이.
    /// 전제 조건: 현재 status == Live AND escrow가 settle 완료
    /// (settle 완료 확인은 escrow 쪽 책임. 여기서는 caller만 확인)
    pub fn mark_closed(&mut self, id: PolicyId);

    /// Owner만 호출. escrow 컨트랙트 계정을 등록 (mark_closed 권한 부여).
    pub fn set_escrow_account(&mut self, escrow: AccountId);

    pub fn get_policy(&self, id: PolicyId) -> Option<Policy>;
    pub fn list_by_foundation(&self, foundation: AccountId, from: u64, limit: u64) -> Vec<Policy>;
    pub fn list_by_status(&self, status: PolicyStatus, from: u64, limit: u64) -> Vec<Policy>;
    pub fn total_policies(&self) -> u64;
}
```

### 검증 규칙 (register_policy)
```text
1. predecessor_account_id()가 foundations에 있어야 함 (Unauthorized)
2. natural_language.len() in [20, 2000]
3. ipfs_cid가 CIDv1 형식 (정규식: ^ba[a-z0-9]{56,}$ 또는 ^Qm[A-Za-z0-9]{44}$)
4. sale_config.subscription_start > block_timestamp
5. sale_config.subscription_end > subscription_start + 1 hour
6. sale_config.live_end > subscription_end
7. sale_config.total_allocation > 0
8. sale_config.price_per_token > 0
9. sale_config.token_contract 존재 (형식 검증만, ping은 안 함)
```

### mark_closed 권한
- `ido-escrow` 계정 주소는 `init`에서 주입 X → 대신 `set_escrow_account(escrow: AccountId)` owner-only 메서드 추가
- `mark_closed`는 `predecessor == self.escrow_account` 일 때만 허용

### 에러 (v2)
```rust
pub enum PolicyError {
    Unauthorized,          // non-foundation, non-owner, non-escrow
    NotAFoundation,
    PolicyNotFound(PolicyId),
    InvalidSaleConfig(&'static str),
    InvalidIpfsCid,
    NaturalLanguageTooShort,
    NaturalLanguageTooLong,
    EscrowNotSet,          // mark_closed 호출 시 escrow_account 미설정
    WrongStatusForClose,   // mark_closed 호출 시 status != Live
}
```

> **제거**: `InvalidTransition` variant 제거. `advance_status`는 no-op이고 `mark_closed`는 WrongStatusForClose를 사용.

### 이벤트
```rust
PolicyRegistered { id, foundation, ipfs_cid, subscription_start, subscription_end }
PolicyStatusAdvanced { id, from: PolicyStatus, to: PolicyStatus, timestamp }
FoundationAdded { foundation }
FoundationRemoved { foundation }
```

## Acceptance Criteria
- [ ] `cargo build --target wasm32-unknown-unknown --release` 성공
- [ ] Unit test: foundation whitelist add/remove
- [ ] Unit test: register_policy happy path + ID 증가
- [ ] Unit test: non-foundation 호출 거부
- [ ] Unit test: subscription_end < subscription_start 거부
- [ ] Unit test: advance_status Upcoming → Subscribing → Live 순차 전이
- [ ] Unit test: advance_status 시간 미달 시 no-op (status 유지, 이벤트 미발행, 현재 status 그대로 반환)
- [ ] Unit test: mark_closed는 escrow 계정만 호출 가능
- [ ] Unit test: list_by_foundation 페이지네이션 (from, limit)
- [ ] workspaces-tests: 3개 policy 등록 후 by_status 조회 정합성

## Test Cases
1. happy: owner가 foundation 추가 → 재단이 policy 등록 → get_policy
2. happy: 2개 policy 등록 → next_policy_id 증가
3. happy: subscription_start == 과거 → InvalidSaleConfig
4. edge: foundation 아닌 계정이 register_policy → Unauthorized
5. edge: natural_language 10자 → NaturalLanguageTooShort
6. edge: natural_language 5000자 → NaturalLanguageTooLong
7. edge: ipfs_cid = "foo" → InvalidIpfsCid
8. edge: total_allocation = 0 → InvalidSaleConfig
9. edge: advance_status 호출했는데 시간 미달 → 현재 status 반환 (no-op) + 이벤트 발행 안 함
10. edge: 외부 계정이 mark_closed → Unauthorized
11. edge: remove_foundation 후 그 재단이 register 시도 → Unauthorized

## References
- PRD §4.1
- ERD §3.2, §5.1
- NEAR SDK collections: https://docs.rs/near-sdk/latest/near_sdk/collections/
- IPFS CID spec: https://github.com/multiformats/cid

## Open Questions
1. Policy 수정: MVP는 불변 (PRD §8). 추후 Upcoming 단계에서만 허용?
2. natural_language UTF-8 길이 vs 바이트 길이: char 기준 ≤2000
3. `list_by_status`는 UnorderedSet로 관리하면 삭제가 필요 → Vector + 별도 인덱스로 구현
4. `escrow_account` 미설정 시 mark_closed는 EscrowNotSet — owner가 배포 후 반드시 set_escrow_account 호출해야 함 (배포 스크립트에 명시)
