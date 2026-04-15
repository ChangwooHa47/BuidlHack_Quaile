---
id: contract-03a-escrow-state
status: done
sub: BE
layer: contract
depends_on: [contract-01-policy-registry, contract-02-attestation-verifier]
estimate: 2h
demo_step: "Subscribing.Contribution"
---

# IDO Escrow — State, Subscription, Contribute

## Context
IDO Escrow 컨트랙트의 첫 번째 파트: 상태 구조체 정의 + `contribute()` 구현.
Phase×Status state machine 중 **Subscribing.Contribution** 단계를 담당.

PRD: FR-IE-1 ~ FR-IE-3, FR-IE-7 (일부), NFR-SEC-3
ERD: §3.7 Contribution, §4.2, §5.2

## Files
- `contracts/ido-escrow/Cargo.toml`
- `contracts/ido-escrow/src/lib.rs`
- `contracts/ido-escrow/src/state.rs`
- `contracts/ido-escrow/src/subscription.rs`   — contribute()
- `contracts/ido-escrow/src/external.rs`       — Policy Registry / Verifier cross-contract traits
- `contracts/ido-escrow/tests/subscription.rs`

## Spec

### 상태
```rust
// v2: ERD §8과 동일. policy_investors = flat key (policy_id, index) 기반, Vector-in-LookupMap 회피.
#[near_bindgen]
#[derive(BorshSerialize, BorshDeserialize, PanicOnDefault)]
pub struct IdoEscrow {
    pub owner: AccountId,
    pub policy_registry: AccountId,
    pub attestation_verifier: AccountId,

    /// key = sha256(investor_bytes || policy_id_le) → Contribution
    pub contributions: LookupMap<[u8; 32], Contribution>,

    /// Policy별 Pending 총량 (settlement 계산용 캐시)
    pub policy_pending_total: LookupMap<PolicyId, U128>,

    /// Policy별 Contribution 순차 리스트 (flat key = policy_id << 32 | index)
    /// 대신 PolicyInvestorKey(policy_id, index) 구조체로 borsh 직렬화한 키 사용.
    pub policy_investors: LookupMap<PolicyInvestorKey, AccountId>,

    /// Policy별 현재까지 추가된 투자자 수 (policy_investors의 길이)
    pub policy_investor_count: LookupMap<PolicyId, u32>,

    /// Policy별 settle()의 현재 cursor 위치 (다음 호출이 여기서부터 이어감)
    pub settle_cursor: LookupMap<PolicyId, u32>,

    /// 사용된 nonce (replay 방지)
    /// key = keccak256(policy_id_le_bytes || nonce)
    pub used_nonces: LookupMap<[u8; 32], ()>,

    /// Policy별 Settlement 결과 (settlement 이후 채워짐)
    pub policy_totals: LookupMap<PolicyId, PolicyTotals>,
}

/// flat storage key for policy_investors LookupMap
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Hash)]
pub struct PolicyInvestorKey {
    pub policy_id: PolicyId,
    pub index: u32,
}

// v2: ERD §3.7과 동일. ContributionStatus enum 제거, outcome + flags 패턴.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct Contribution {
    pub investor: AccountId,
    pub policy_id: PolicyId,
    pub amount: U128,
    pub attestation_hash: Hash32,
    pub outcome: ContributionOutcome,  // NotSettled → {FullMatch, PartialMatch, NoMatch}
    pub matched_amount: U128,          // 초기값 0, settlement 후 확정
    pub token_amount: U128,            // 초기값 0, settlement 후 확정
    pub token_contract: AccountId,     // claim() 시 사용 (contribute 시점 캐싱)
    pub claim_done: bool,
    pub refund_done: bool,
    pub created_at: u64,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub enum ContributionOutcome {
    NotSettled,
    FullMatch,
    PartialMatch,
    NoMatch,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct PolicyTotals {
    pub total_demand: U128,
    pub total_matched: U128,
    pub ratio_bps: u16,  // 0..=10000
    pub settled_at: u64,
    pub is_complete: bool,
}
```

### contribute() 플로우 (v2, Promise API 기반)

**구조**: 엔트리 메서드에서 로컬 검증 수행 → `Pending` 상태로 Contribution 즉시 기록 → cross-contract views Promise 체인 시작 → 콜백에서 최종 검증 → 성공 시 그대로 / 실패 시 롤백 + 환불.

**핵심 원칙**:
- `env::attached_deposit()`은 **오직 엔트리 메서드에서만 접근 가능**. 콜백에서는 0이다.
- 콜백에서 환불하려면 `Promise::new(predecessor).transfer(amount)`을 **명시적으로** 반환해야 한다.
- 재진입 방지: `Pending` 상태를 **먼저 기록**하고, 검증 실패 시 제거하는 패턴 (optimistic record).

### 메서드 시그니처
```rust
#[near_bindgen]
impl IdoEscrow {
    /// 엔트리 메서드. 투자자가 직접 호출. NEAR 네이티브 payment만 지원.
    /// 가스 예산: base 30 TGas + 2 view promises * 30 TGas + callback 30 TGas ≈ 120 TGas
    #[payable]
    pub fn contribute(&mut self, policy_id: PolicyId, bundle: AttestationBundle) -> Promise;

    /// Private callback #1: policy_registry.get_policy 결과 처리
    /// #[private]로 보호 — 오직 self가 호출
    #[private]
    pub fn on_get_policy(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        bundle: AttestationBundle,
        #[callback_result] policy_result: Result<Option<Policy>, PromiseError>,
    ) -> Promise;

    /// Private callback #2: attestation_verifier.is_eligible 결과 처리 → 최종 확정 또는 롤백
    /// nonce는 rollback에서 used_nonces 제거 시 필요 → 인자로 전달
    #[private]
    pub fn on_is_eligible(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        subscription_end: Timestamp,
        attestation_hash: Hash32,
        nonce: [u8; 32],
        #[callback_result] eligible: Result<bool, PromiseError>,
    ) -> PromiseOrValue<bool>;
}
```

### contribute() 엔트리 단계별 로직 (v2, promise 시작 전 모든 sync 검증 완료)

**원칙**: `near_sdk::require!`로 동기 panic하면 NEAR 런타임이 `attached_deposit`을 **자동 환불한다** (Promise가 아직 시작되지 않았을 때만). 따라서 모든 sync validation은 Promise 시작 전에 끝내야 한다.

```text
// === PHASE A: 동기 validation (panic 시 자동 환불) ===
 1. investor = env::predecessor_account_id()
 2. deposit  = env::attached_deposit()
 3. require!(deposit > 0, "InsufficientDeposit")
 4. require!(bundle.payload.subject == investor, "SubjectMismatch")
 5. require!(bundle.payload.policy_id == policy_id, "PolicyIdMismatch")
 6. require!(env::block_timestamp() <= bundle.payload.expires_at, "AttestationExpired")
 7. nonce_key = compute_nonce_key(policy_id, &bundle.payload.nonce)
 8. require!(!self.used_nonces.contains_key(&nonce_key), "NonceReused")
 9. contribution_key = compute_contribution_key(&investor, policy_id)
10. require!(!self.contributions.contains_key(&contribution_key), "AlreadyContributed")

// === PHASE B: optimistic state write (이 시점부터 rollback이 필요) ===
11. self.contributions.insert(contribution_key, Contribution {
      investor: investor.clone(),
      policy_id,
      amount: deposit.into(),
      attestation_hash: bundle.payload_hash,
      outcome: ContributionOutcome::NotSettled,
      matched_amount: 0.into(),
      token_amount: 0.into(),
      token_contract: "placeholder.near".parse().unwrap(), // on_get_policy에서 채워짐
      claim_done: false,
      refund_done: false,
      created_at: env::block_timestamp(),
    })
12. self.used_nonces.insert(nonce_key, ())
13. let prev_total = self.policy_pending_total.get(&policy_id).unwrap_or(0.into())
    self.policy_pending_total.insert(policy_id, prev_total.0.checked_add(deposit).expect("overflow").into())
14. let count = self.policy_investor_count.get(&policy_id).unwrap_or(0)
    self.policy_investors.insert(PolicyInvestorKey { policy_id, index: count }, investor.clone())
    self.policy_investor_count.insert(policy_id, count + 1)

// === PHASE C: cross-contract view chain ===
15. ext_policy_registry::ext(self.policy_registry.clone())
        .with_static_gas(Gas::from_tgas(30))
        .get_policy(policy_id)
      .then(
        Self::ext(env::current_account_id())
            .with_static_gas(Gas::from_tgas(60))
            .on_get_policy(policy_id, investor, bundle)
      )
```

> **중요 (NEAR 런타임 동작)**:
> - PHASE A의 `require!` panic → 런타임이 attached_deposit을 자동 환불한다 (Promise 미시작). 안전.
> - PHASE B 이후 panic은 자동 환불되지만, 상태 변경은 **자동 롤백된다** (NEAR 런타임 tx atomicity). 따라서 PHASE B에서 panic이 발생하면 contributions/used_nonces/totals 모두 원상복구되고 deposit도 환불된다.
> - PHASE C Promise 시작 이후의 **콜백**에서 발생하는 실패는 자동 환불이 없다. 콜백의 rollback_contribution 헬퍼가 직접 `Promise::new(investor).transfer(amount)`을 반환해 환불해야 한다.

### on_get_policy 로직
```text
입력: policy_id, investor, bundle (= AttestationBundle, nonce 포함)
callback_result: Result<Option<Policy>, PromiseError>

 1. policy = match policy_result {
      Ok(Some(p)) => p,
      _ => {
        let refund = self.rollback_contribution(&investor, policy_id, bundle.payload.nonce);
        emit_event(ContributionFailed { investor, policy_id, reason: "PolicyNotFound" });
        return Promise::new(investor).transfer(refund);
      }
    }
 2. if policy.status != PolicyStatus::Subscribing:
      rollback + refund + event
 3. now = env::block_timestamp()
 4. if now < policy.sale_config.subscription_start || now >= policy.sale_config.subscription_end:
      rollback + refund + event  (TOCTOU 재검증)
 4.5. // token_contract 확정 (contribute에서는 placeholder였음)
     let key = compute_contribution_key(&investor, policy_id);
     if let Some(mut c) = self.contributions.get(&key) {
       c.token_contract = policy.sale_config.token_contract.clone();
       self.contributions.insert(&key, &c);
     }
 5. 다음 Promise (on_is_eligible에 nonce 포함해서 전달):
    ext_verifier::ext(self.attestation_verifier.clone())
      .with_static_gas(Gas::from_tgas(30))
      .is_eligible(bundle.clone())
    .then(
      Self::ext(env::current_account_id())
        .with_static_gas(Gas::from_tgas(30))
        .on_is_eligible(
          policy_id,
          investor,
          policy.sale_config.subscription_end,
          bundle.payload_hash,
          bundle.payload.nonce,  // rollback용
        )
    )
 6. return promise chain
```

### on_is_eligible 로직
```text
입력: policy_id, investor, subscription_end, attestation_hash, nonce, callback_result

 1. match callback_result {
      Err(_) | Ok(false) => {
        let refund = self.rollback_contribution(&investor, policy_id, nonce);
        emit_event(ContributionFailed { investor, policy_id, reason: "IneligibleAttestation" });
        return PromiseOrValue::Promise(Promise::new(investor).transfer(refund));
      }
      Ok(true) => { /* proceed */ }
    }
 2. let now = env::block_timestamp();
 3. if now >= subscription_end:
      // window가 마지막 순간에 닫힘
      let refund = self.rollback_contribution(&investor, policy_id, nonce);
      emit_event(ContributionFailed { investor, policy_id, reason: "WindowClosed" });
      return PromiseOrValue::Promise(Promise::new(investor).transfer(refund));
 4. // 확정: Phase B에서 이미 기록된 Contribution은 그대로 남겨둔다.
    emit_event(ContributionCreated { investor, policy_id, attestation_hash });
    return PromiseOrValue::Value(true);
```

### rollback_contribution 헬퍼 동작
- `contributions`에서 해당 Contribution 제거
- `used_nonces`에서 nonce_key 제거
- `policy_pending_total` 차감
- `policy_investors` / `policy_investor_count`는 **변경하지 않음** (zombie entry). settle()가 skip.
- 반환값: refund할 금액 (contribution.amount)

### rollback 헬퍼 (private)
```rust
impl IdoEscrow {
    /// Contribution, used_nonces, pending_total을 롤백하고 환불 금액을 반환.
    /// policy_investors / count는 그대로 둔다 (zombie). settle()가 skip.
    fn rollback_contribution(
        &mut self,
        investor: &AccountId,
        policy_id: PolicyId,
        nonce: [u8; 32],
    ) -> Balance {
        let contribution_key = compute_contribution_key(investor, policy_id);
        let Some(c) = self.contributions.remove(&contribution_key) else {
            env::log_str("rollback: contribution already removed");
            return 0;
        };
        let nonce_key = compute_nonce_key(policy_id, &nonce);
        self.used_nonces.remove(&nonce_key);
        let prev = self.policy_pending_total.get(&policy_id).unwrap_or(0.into()).0;
        let new_total: Balance = prev.checked_sub(c.amount.0).unwrap_or(0);
        self.policy_pending_total.insert(policy_id, new_total.into());
        c.amount.0
    }
}

fn compute_contribution_key(investor: &AccountId, policy_id: PolicyId) -> [u8; 32] {
    let mut buf = Vec::with_capacity(64);
    buf.extend_from_slice(investor.as_bytes());
    buf.extend_from_slice(&policy_id.to_le_bytes());
    env::sha256_array(&buf)
}

fn compute_nonce_key(policy_id: PolicyId, nonce: &[u8; 32]) -> [u8; 32] {
    let mut buf = [0u8; 40];
    buf[..8].copy_from_slice(&policy_id.to_le_bytes());
    buf[8..].copy_from_slice(nonce);
    env::keccak256_array(&buf)
}
```

### Cross-contract trait 선언
```rust
#[ext_contract(ext_policy_registry)]
pub trait PolicyRegistry {
    fn get_policy(&self, id: PolicyId) -> Option<Policy>;
}

#[ext_contract(ext_verifier)]
pub trait AttestationVerifier {
    fn is_eligible(&self, bundle: AttestationBundle) -> bool;
}

#[ext_contract(ext_self)]
pub trait IdoEscrowCallbacks {
    fn on_get_policy(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        bundle: AttestationBundle,
        #[callback_result] policy_result: Result<Option<Policy>, PromiseError>,
    ) -> Promise;

    fn on_is_eligible(
        &mut self,
        policy_id: PolicyId,
        investor: AccountId,
        subscription_end: Timestamp,
        attestation_hash: Hash32,
        nonce: [u8; 32],
        #[callback_result] eligible: Result<bool, PromiseError>,
    ) -> PromiseOrValue<bool>;
}
```

> **impl 블록의 메서드 시그니처도 위 trait과 완전히 일치해야 한다.** 특히 `on_is_eligible`의 `nonce: [u8; 32]` 인자는 rollback에서 사용되며, `#[ext_contract]`와 `impl`에서 누락되면 컴파일 에러.

### Zombie entry 정리
- Rollback 시 `policy_investors`에서 제거하지 않음 (O(n) 비용)
- settle()에서 `contributions.get(&compute_contribution_key(investor, pid))`로 존재 확인 후 없으면 skip
- 이 정책은 `contract-03b`에 반영해야 함 (별도 태스크)

### 에러
```rust
pub enum ContributeError {
    SubjectMismatch,
    PolicyIdMismatch,
    PolicyNotFound,
    WrongPhase { expected: PolicyStatus, actual: PolicyStatus },
    NotInSubscriptionWindow,
    IneligibleAttestation,
    NonceReused,
    AlreadyContributed,
    InsufficientDeposit,
    UseFtTransfer,
    CrossContractFailed(String),
}
```

### 이벤트
```rust
ContributionCreated { investor, policy_id, amount, attestation_hash, timestamp }
```

## Acceptance Criteria
- [ ] `cargo build --target wasm32-unknown-unknown --release` 성공
- [ ] Unit test: Contribution struct round-trip (Borsh)
- [ ] workspaces-tests: happy path end-to-end (policy 등록 → attest → contribute 성공)
- [ ] workspaces-tests: subject mismatch → panic
- [ ] workspaces-tests: Upcoming phase에서 contribute → WrongPhase
- [ ] workspaces-tests: 동일 투자자 중복 contribute → AlreadyContributed
- [ ] workspaces-tests: 동일 nonce 재사용 (두 투자자) → NonceReused
- [ ] workspaces-tests: attached_deposit == 0 → InsufficientDeposit
- [ ] workspaces-tests: verifier가 false 반환 → IneligibleAttestation

## Test Cases
1. happy: register_policy (Subscribing) → valid attestation → contribute → Contribution 저장 확인
2. edge: bundle.subject != caller → SubjectMismatch
3. edge: bundle.policy_id != arg policy_id → PolicyIdMismatch
4. edge: contribute 호출 시점에 block_timestamp < subscription_start → NotInSubscriptionWindow
5. edge: 같은 투자자 재 contribute → AlreadyContributed
6. edge: 같은 nonce 다른 투자자 → NonceReused
7. edge: verifier.is_eligible == false → IneligibleAttestation
8. edge: NEP-141 policy인데 contribute() 직접 호출 → UseFtTransfer
9. edge: attached_deposit = 0 → InsufficientDeposit

## Open Questions
1. **NEP-141 지원 경로**: MVP는 NEAR native only? → 제안: **MVP = NEAR native only**. NEP-141은 `ft_on_transfer` 콜백 경로로 로드맵.
2. **Subscription window 경계**: `subscription_start <= t < subscription_end`인가 `<=`인가? → 제안: `[start, end)` (오른쪽 열림)
3. **Cross-contract 호출의 가스 비용**: get_policy + is_eligible 두 번 view 호출 → gas budget 할당 명시 필요
4. **partial success**: view 중 하나만 성공하면? → 둘 다 성공해야만 상태 변경

## References
- `planning/ERD.md` §3.7, §4.2, §5.2, §7
- `planning/PRD.md` FR-IE-1~3, FR-IE-7
- NEAR cross-contract callback patterns: https://docs.near.org/develop/contracts/crosscontract
