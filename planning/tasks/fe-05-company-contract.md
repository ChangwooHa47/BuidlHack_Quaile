---
id: fe-05-company-contract
status: done
sub: FE
layer: fe
depends_on: [fe-01-contract-rpc]
estimate: 1.5h
demo_step: "Upcoming → Closed 전체"
---

# FE: 재단(Company) 페이지 컨트랙트 연동

## Context
company/ 페이지의 mock 데이터를 실제 컨트랙트 호출로 교체. 재단이 Policy 등록, advance_status, settle, claim/refund을 실행할 수 있도록.

## Files
- `frontend/src/lib/near/transactions.ts` (modify — 재단용 tx 함수 추가)
- `frontend/src/app/company/page.tsx` (modify — mock → 실제 조회 + 버튼 연결)
- `frontend/src/app/company/criteria/page.tsx` (modify — register_policy 실제 호출)

## Spec

### transactions.ts 추가 함수
```typescript
export async function registerPolicy(
  wallet: any,
  naturalLanguage: string,
  ipfsCid: string,
  saleConfig: SaleConfigArgs,
) {
  return wallet.signAndSendTransaction({
    receiverId: CONTRACT_IDS.policyRegistry,
    actions: [{
      type: "FunctionCall",
      params: {
        methodName: "register_policy",
        args: { natural_language: naturalLanguage, ipfs_cid: ipfsCid, sale_config: saleConfig },
        gas: "100000000000000",
        deposit: "0",
      },
    }],
  });
}

export async function advanceStatus(wallet: any, policyId: number) {
  return wallet.signAndSendTransaction({
    receiverId: CONTRACT_IDS.policyRegistry,
    actions: [{
      type: "FunctionCall",
      params: {
        methodName: "advance_status",
        args: { id: policyId },
        gas: "50000000000000",
        deposit: "0",
      },
    }],
  });
}

export async function settle(wallet: any, policyId: number, maxContributions: number = 100) {
  return wallet.signAndSendTransaction({
    receiverId: CONTRACT_IDS.idoEscrow,
    actions: [{
      type: "FunctionCall",
      params: {
        methodName: "settle",
        args: { policy_id: policyId, max_contributions: maxContributions },
        gas: "300000000000000",
        deposit: "0",
      },
    }],
  });
}
```

### criteria/page.tsx 변경
- `handlePublish()`: mock alert → `registerPolicy()` 실제 호출
- SaleConfig의 날짜를 nanoseconds로 변환 (NEAR 블록 타임스탬프 = ns)
- `total_allocation`, `price_per_token`을 U128 형식으로 변환

### company/page.tsx 변경
- `PROJECT` 하드코딩 → `getPolicy(id)` + `getPolicyTotals(id)` 호출
- "Advance to Live" 버튼 → `advanceStatus()` 연결
- "Start Settlement" 버튼 → `settle()` 연결
- Recent Contributions → `ido-escrow` view 함수로 실제 조회

## Acceptance Criteria
- [ ] criteria 페이지에서 Publish → testnet에 Policy 등록 tx 성공
- [ ] company 페이지에서 실제 Policy 데이터 표시
- [ ] Advance to Live 버튼 → advance_status tx 성공
- [ ] Start Settlement 버튼 → settle tx 성공
- [ ] `npm run build` 성공

## Test Cases
1. 재단: criteria 작성 → Publish → policy-registry에 등록 확인
2. 재단: Advance to Live → policy.status == Live
3. 재단: Settle → policy_totals 생성 확인
4. 재단: Policy 없는 상태 → "No policies" 표시
5. 비재단 계정: register_policy → Unauthorized 에러

## 코드리뷰 체크포인트
1. SaleConfig의 timestamp가 nanoseconds인지 (밀리초 아님)
2. U128 값이 문자열로 전달되는지 (JSON에서 큰 숫자는 문자열)
3. payment_token이 `{"Near": null}` 형식인지 (Rust enum JSON 표현)

## References
- policy-registry: `contracts/policy-registry/src/lib.rs`
- ido-escrow settlement: `contracts/ido-escrow/src/settlement.rs`
