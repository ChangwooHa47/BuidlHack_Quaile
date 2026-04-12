---
id: contract-03b-escrow-settlement
status: todo
sub: BE
layer: contract
depends_on: [contract-03a-escrow-state]
estimate: 2h
demo_step: "Live.Settlement"
---

# IDO Escrow — Settlement

## Context
`settle()` 구현. 모든 Pending Contribution을 순회하며 pro-rata 매칭 확정.
PRD FR-IE-4, FR-IE-8, NFR-SEC-3
ERD §3.7, §5.2, §6 Settlement 알고리즘

## Files
- `contracts/ido-escrow/src/settlement.rs`
- `contracts/ido-escrow/tests/settlement.rs`

## Spec

### settle()
```rust
#[near_bindgen]
impl IdoEscrow {
    /// 누구나 호출 가능 (permissionless keeper).
    /// 전제 조건: policy.status == Live (keeper가 advance_status로 전이시킨 후).
    /// - 모든 NotSettled Contribution에 대해 pro-rata 매칭
    /// - 각 Contribution의 outcome을 FullMatch/PartialMatch/NoMatch로 확정
    /// - PolicyTotals 저장, 마지막 배치에서 mark_closed 호출
    ///
    /// 가스 제약: Contribution 수가 많으면 단일 트랜잭션으로 처리 불가할 수 있음.
    /// MVP는 "한 번의 settle()에 최대 N개 처리" 패턴으로 구현하고 여러 번 호출 허용.
    pub fn settle(&mut self, policy_id: PolicyId, max_contributions: Option<u32>) -> SettleProgress;
}

#[derive(Serialize)]
pub struct SettleProgress {
    pub processed: u32,
    pub total: u32,
    pub is_complete: bool,
    pub totals: Option<PolicyTotals>, // complete일 때만
}
```

### settle() 로직 (v2: settle_cursor + zombie skip + mark_closed)

**구조**: settle()는 permissionless. 첫 호출에서 policy를 fetch + ratio 계산 + Live 전이, 이후는 cursor 기반으로 batch 처리. 마지막 배치에서 `mark_closed` cross-contract call.

```text
1. entry: settle(policy_id, max_contributions)
2. cross-contract view: policy_registry.get_policy(policy_id)
   .then(on_get_policy_for_settle(...))

3. on_get_policy_for_settle:
   a. policy = result?? or panic PolicyNotFound
   b. 첫 호출 판정: policy_totals[policy_id].is_none()
   c. if 첫 호출:
      - env::block_timestamp() >= policy.sale_config.subscription_end → 아니면 NotReadyForSettlement
      - policy.status == PolicyStatus::Live 필수 → 아니면 panic("status must be Live; caller should advance_status first")
        이유: advance_status는 별도 keeper 책임. settle()는 "누군가 이미 Live로 전이시켰다"를 전제.
        NotReadyForSettlement와 별개의 에러로 분리: WrongPolicyStatus.
      - total_demand = policy_pending_total[policy_id]  // 0이면 early complete
      - total_supply_payment_u256 = U256(policy.sale_config.total_allocation) * U256(policy.sale_config.price_per_token)
      - if total_demand == 0:
          ratio_bps = 10000 (all match, no one)
        else:
          raw_ratio = total_supply_payment_u256 * 10000 / U256(total_demand)
          ratio_bps = min(10000, raw_ratio.as_u16())
      - policy_totals[policy_id] = PolicyTotals {
          total_demand, total_matched: 0, ratio_bps, settled_at: 0, is_complete: false
        }
      - settle_cursor[policy_id] = 0

   d. cursor = settle_cursor[policy_id]
      count = policy_investor_count[policy_id]
      batch_size = min(max_contributions.unwrap_or(50), count - cursor)

   e. for i in cursor..cursor+batch_size:
      - investor = policy_investors[flat_key(policy_id, i)]  // Some or zombie
      - contribution_key = sha256(investor_bytes || policy_id_le)
      - contribution = contributions[contribution_key]
      - if None: // zombie from rollback
          continue
      - matched = (U256(contribution.amount) * ratio_bps / 10000).as_u128()
      - token = matched / price_per_token
      - contribution.matched_amount = matched
      - contribution.token_amount = token
      - contribution.outcome = match (matched, amount):
            (m, a) if m == a => FullMatch,
            (0, _) => NoMatch,
            _ => PartialMatch,
      - contributions.insert(contribution_key, contribution)
      - totals.total_matched += matched
      - emit ContributionSettled { investor, policy_id, outcome, matched, token }

   f. new_cursor = cursor + batch_size
      settle_cursor[policy_id] = new_cursor
      policy_totals[policy_id].total_matched = totals.total_matched

   g. if new_cursor == count:  // 완료
      - policy_totals[policy_id].is_complete = true
      - policy_totals[policy_id].settled_at = env::block_timestamp()
      - emit PolicySettled { policy_id, total_demand, total_matched, ratio_bps }
      - Promise: policy_registry.mark_closed(policy_id)  // Live → Closed
        .then(Self::on_mark_closed_result(policy_id))
      - return PromiseOrValue::Promise(mark_closed_promise)
     else:
      - return PromiseOrValue::Value(SettleProgress { processed: batch_size, total: count, is_complete: false, totals: None })

4. on_mark_closed_result: 실패 로그만 남김 (settle 자체는 성공, 상태 전이만 재시도 필요)
```

### Overflow 처리
- `amount * ratio_bps / 10000`은 U128 amount에 대해 U128 * u16 → U256 캐스트 필수
- `uint` crate의 `U256` 또는 `primitive-types` 사용
- `matched_amount / price_per_token` (U128 / U128) → 결과 U128

### advance_status vs mark_closed 관계
- `advance_status`는 Upcoming→Subscribing, Subscribing→Live 전이만 담당 (permissionless)
- `mark_closed`는 Live→Closed 전이 전용, **escrow 계정만 호출 가능**
- settle() 마지막 배치가 mark_closed를 호출

### 에러
```rust
pub enum SettleError {
    PolicyNotFound,
    NotReadyForSettlement,     // subscription_end 미도달
    WrongPolicyStatus,         // status != Live (keeper가 advance_status 선행 필요)
    AlreadySettled,            // policy_totals.is_complete == true
    CrossContractFailed(String),
}
```

### 이벤트
```rust
SettleStarted      { policy_id, total_demand, ratio_bps }  // 첫 배치 시작 시
ContributionSettled { investor, policy_id, outcome, matched_amount, token_amount, timestamp }
PolicySettled      { policy_id, total_demand, total_matched, ratio_bps, timestamp }
```

### settle()과 advance_status()의 관계
- `settle()`는 policy가 **이미 Live** 여야만 실행. 그렇지 않으면 `WrongPolicyStatus`로 panic.
- `advance_status()`는 keeper 패턴으로 누구나 호출 가능하며, `Subscribing→Live` 전이를 수행.
- 데모 시나리오(`test-01`)는 다음 순서로 실행: `(time elapses)` → `advance_status` (Subscribing→Live) → `settle`.
- `settle()`의 마지막 배치는 `mark_closed`로 `Live→Closed`를 수행 (이때는 escrow가 권한자).

### 부동소수 없음
- 전부 정수 연산 (U256 필요 시 `primitive-types::U256`)
- `amount * ratio_bps / 10000` — overflow 방지 위해 U256 캐스트

## Acceptance Criteria
- [ ] `cargo build --target wasm32-unknown-unknown --release` 성공
- [ ] Unit test: ratio 계산 정확도 (엣지: demand==supply, demand<supply, demand>supply)
- [ ] workspaces-tests: 3개 투자자 scenarios
  - total_demand <= supply → 전원 FullMatch (ratio=10000)
  - total_demand > supply → 전원 PartialMatch (비율대로)
  - supply=0 edge → 전원 NoMatch
- [ ] workspaces-tests: max_contributions=1로 여러 번 호출 → 모두 처리
- [ ] workspaces-tests: settle() 완료 후 policy.status == Closed (mark_closed 호출 결과)
- [ ] workspaces-tests: 중복 settle() → AlreadySettled (첫 완료 이후)
- [ ] workspaces-tests: settle() 호출 시 policy.status == Subscribing → WrongPolicyStatus

## Test Cases
1. happy: 3명 × 100 = 300 demand, supply = 300 → 전원 FullMatch (ratio=10000)
2. happy: 3명 × 100 = 300 demand, supply = 150 → 전원 PartialMatch (ratio=5000, matched=50)
3. happy: 3명 × 100, supply = 150, batch max=2 → 2번 호출로 완료
4. edge: demand = 0 (NotSettled 없음) → 즉시 is_complete, totals.total_matched=0
5. edge: subscription_end 전 호출 → NotReadyForSettlement
6. edge: policy.status == Subscribing (advance_status 미호출) → WrongPolicyStatus
7. edge: 이미 완료된 policy 재 settle → AlreadySettled
8. edge: token_amount 계산 시 dust (matched_amount % price != 0) → token_amount = floor

## Open Questions
1. **Keeper 인센티브**: MVP는 없음. 재단이 직접 트리거.
2. **대규모 Contribution**: 1000명 이상이면 max_contributions로 N번 쪼개야 함. 클라이언트/keeper가 반복 호출

## References
- PRD §4.3 FR-IE-4
- ERD §6 Settlement 알고리즘
- https://docs.near.org/concepts/basics/transactions/gas
