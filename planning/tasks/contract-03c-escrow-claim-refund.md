---
id: contract-03c-escrow-claim-refund
status: done
sub: BE
layer: contract
depends_on: [contract-03b-escrow-settlement]
estimate: 1.5h
demo_step: "Live.Claim, Live.Refund"
---

# IDO Escrow — Claim & Refund (v2)

## Context
Settlement 이후 투자자가 개별 호출. 완전히 ERD v2 §3.7 / §5.2b 모델 기반.
`outcome` + `claim_done`/`refund_done` 플래그로 모든 상태 표현.

PRD FR-IE-5, FR-IE-6, NFR-SEC-3
ERD §5.2, §5.2b (허용 동작 표)

## Files
- `contracts/ido-escrow/src/claim.rs`      — claim()
- `contracts/ido-escrow/src/refund.rs`     — refund()
- `contracts/ido-escrow/tests/claim_refund.rs`

## Spec

### 허용 동작 (ERD §5.2b 재인용)

| outcome | claim_done | refund_done | claim() | refund() |
|---|---|---|---|---|
| `NotSettled` | false | false | ❌ NotSettled | ❌ NotSettled |
| `FullMatch` | false | false | ✅ | ❌ NothingToRefund |
| `FullMatch` | true | false | ❌ AlreadyClaimed | ❌ NothingToRefund |
| `PartialMatch` | false | false | ✅ | ✅ |
| `PartialMatch` | true | false | ❌ AlreadyClaimed | ✅ |
| `PartialMatch` | false | true | ✅ | ❌ AlreadyRefunded |
| `PartialMatch` | true | true | ❌ AlreadyClaimed | ❌ AlreadyRefunded |
| `NoMatch` | false | false | ❌ NothingToClaim | ✅ |
| `NoMatch` | false | true | ❌ NothingToClaim | ❌ AlreadyRefunded |

### claim()
```rust
#[near_bindgen]
impl IdoEscrow {
    /// 호출자가 본인의 Contribution을 claim. FullMatch 또는 PartialMatch일 때만 가능.
    /// 가스 예산: base 10 TGas + ft_transfer promise 20 TGas = 30 TGas
    pub fn claim(&mut self, policy_id: PolicyId) -> Promise;

    #[private]
    pub fn on_ft_transfer_for_claim(
        &mut self,
        investor: AccountId,
        policy_id: PolicyId,
        token_amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    );
}
```

#### 로직
```text
1. investor = env::predecessor_account_id()
2. key = compute_contribution_key(&investor, policy_id)
3. mut contribution = self.contributions.get(&key).expect("ContributionNotFound")
4. match contribution.outcome {
     NotSettled => panic NotSettled,
     NoMatch    => panic NothingToClaim,
     FullMatch | PartialMatch => { /* proceed */ }
   }
5. require!(!contribution.claim_done, "AlreadyClaimed")
6. require!(contribution.token_amount.0 > 0, "NothingToClaim")

7. // optimistic update
   contribution.claim_done = true
   self.contributions.insert(&key, &contribution)

8. // token_contract는 contribution에 이미 캐싱됨 (contribute() on_get_policy에서 저장)
   let token_contract = contribution.token_contract.clone();

9. // ft_transfer promise
   ext_ft::ext(token_contract)
     .with_attached_deposit(1)  // NEP-141 standard: 1 yoctoNEAR 필수
     .with_static_gas(Gas::from_tgas(20))
     .ft_transfer(investor.clone(), contribution.token_amount, None)
   .then(
     Self::ext(env::current_account_id())
       .with_static_gas(Gas::from_tgas(5))
       .on_ft_transfer_for_claim(investor, policy_id, contribution.token_amount)
   )
```

#### on_ft_transfer_for_claim (롤백)
```text
match result {
  Ok(()) => {
    emit_event(TokenClaimed { investor, policy_id, token_amount });
  }
  Err(_) => {
    // ft_transfer 실패 → claim_done 롤백
    let key = compute_contribution_key(&investor, policy_id);
    if let Some(mut c) = self.contributions.get(&key) {
      c.claim_done = false;
      self.contributions.insert(&key, &c);
    }
    emit_event(ClaimFailed { investor, policy_id });
  }
}
```

### refund()
```rust
#[near_bindgen]
impl IdoEscrow {
    /// 호출자가 본인의 Contribution을 refund.
    /// PartialMatch (잔여) 또는 NoMatch (전액)일 때 가능.
    /// 가스 예산: base 10 TGas + transfer promise 5 TGas = 15 TGas
    pub fn refund(&mut self, policy_id: PolicyId) -> Promise;

    #[private]
    pub fn on_refund_transfer(
        &mut self,
        investor: AccountId,
        policy_id: PolicyId,
        refund_amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    );
}
```

#### 로직
```text
1. investor = env::predecessor_account_id()
2. key = compute_contribution_key(&investor, policy_id)
3. mut contribution = self.contributions.get(&key).expect("ContributionNotFound")
4. match contribution.outcome {
     NotSettled => panic NotSettled,
     FullMatch  => panic NothingToRefund,
     PartialMatch | NoMatch => { /* proceed */ }
   }
5. require!(!contribution.refund_done, "AlreadyRefunded")
6. refund_amount = contribution.amount.0.checked_sub(contribution.matched_amount.0).expect("underflow")
7. require!(refund_amount > 0, "NothingToRefund")

8. // optimistic update
   contribution.refund_done = true
   self.contributions.insert(&key, &contribution)

9. Promise::new(investor.clone()).transfer(refund_amount)
   .then(
     Self::ext(env::current_account_id())
       .with_static_gas(Gas::from_tgas(5))
       .on_refund_transfer(investor, policy_id, refund_amount.into())
   )
```

#### on_refund_transfer (롤백)
```text
match result {
  Ok(()) => emit_event(RefundIssued { investor, policy_id, refund_amount }),
  Err(_) => {
    // transfer 실패 → refund_done 롤백
    let key = compute_contribution_key(&investor, policy_id);
    if let Some(mut c) = self.contributions.get(&key) {
      c.refund_done = false;
      self.contributions.insert(&key, &c);
    }
    emit_event(RefundFailed { investor, policy_id });
  }
}
```

### 에러
```rust
pub enum ClaimError {
    ContributionNotFound,
    NotSettled,
    NothingToClaim,      // outcome == NoMatch OR token_amount == 0
    AlreadyClaimed,
}

pub enum RefundError {
    ContributionNotFound,
    NotSettled,
    NothingToRefund,     // outcome == FullMatch OR refund_amount == 0
    AlreadyRefunded,
}
```

### 이벤트
```rust
TokenClaimed  { investor, policy_id, token_amount, timestamp }
ClaimFailed   { investor, policy_id, timestamp }
RefundIssued  { investor, policy_id, refund_amount, timestamp }
RefundFailed  { investor, policy_id, timestamp }
```

### Policy 정보 캐싱 결정 (iteration 3 확정)
- `Contribution.token_contract: AccountId` 필드가 이미 존재 (ERD §3.7 v2).
- `contribute()`의 `on_get_policy` 콜백에서 `policy.sale_config.token_contract`를 읽어 Contribution에 저장.
- `claim()`은 cross-contract view 없이 `contribution.token_contract`를 바로 사용.
- `refund()`는 native transfer만 필요하므로 policy 조회 불필요.

## Acceptance Criteria
- [ ] `cargo build --target wasm32-unknown-unknown --release` 성공
- [ ] §5.2b 허용 동작 표의 모든 row에 대한 unit test (9개)
- [ ] workspaces-tests: FullMatch → claim → ft_transfer 호출
- [ ] workspaces-tests: NoMatch → refund → native transfer
- [ ] workspaces-tests: PartialMatch → claim + refund 병렬 (둘 다 성공)
- [ ] workspaces-tests: PartialMatch → refund + claim (순서 반대) 도 성공
- [ ] workspaces-tests: ft_transfer 실패 promise → claim_done 롤백 확인
- [ ] workspaces-tests: transfer 실패 promise → refund_done 롤백 확인

## Test Cases
1. happy: FullMatch (amount=100, matched=100, token=10) → claim → ft_transfer(10) + claim_done=true
2. happy: NoMatch (amount=100, matched=0) → refund → transfer(100) + refund_done=true
3. happy: PartialMatch (amount=100, matched=60, token=6) → claim (ft=6) → refund (40)
4. happy: PartialMatch → refund (40) → claim (ft=6) — 반대 순서도 OK
5. edge: NotSettled (Pending) → claim → NotSettled
6. edge: NotSettled → refund → NotSettled
7. edge: FullMatch → refund → NothingToRefund
8. edge: NoMatch → claim → NothingToClaim
9. edge: claim_done=true 상태에서 재 claim → AlreadyClaimed
10. edge: refund_done=true 상태에서 재 refund → AlreadyRefunded
11. edge: ft_transfer promise Err → claim_done rollback → 재시도 가능
12. edge: native transfer promise Err → refund_done rollback → 재시도 가능
13. edge: 다른 investor의 contribution claim 시도 → ContributionNotFound

## References
- PRD §4.3 FR-IE-5, FR-IE-6
- ERD §3.7 (Contribution + outcome), §5.2b (허용 동작 표)
- NEP-141 standard: https://nomicon.io/Standards/Tokens/FungibleToken/Core
- NEAR Promise refund patterns: https://docs.near.org/develop/contracts/crosscontract

## Open Questions
1. **token_contract 저장 위치**: Contribution에 필드 추가 vs config 캐시 → Contribution 필드 (per-policy 독립)
2. **Vesting**: MVP 즉시 claim (PRD §8 Out of Scope)
3. **`with_attached_deposit(1)` (1 yoctoNEAR)**: NEP-141 표준 요구사항. escrow 계정 잔액에서 차감됨 (ignore 가능 수준)
4. **ft_transfer이 storage_deposit 미이행 계정에 실패**: 투자자가 사전에 `storage_deposit` 호출해야 함 — 데모 스크립트에서 자동화 필요
