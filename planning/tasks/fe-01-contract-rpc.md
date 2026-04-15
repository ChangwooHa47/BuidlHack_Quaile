---
id: fe-01-contract-rpc
status: done
sub: FE
layer: fe
depends_on: []
estimate: 1.5h
demo_step: "전체 (데이터 레이어)"
---

# FE: 컨트랙트 RPC 레이어

## Context
현재 메인 페이지(`page.tsx`)와 company 페이지가 전부 하드코딩 mock 데이터. NEAR RPC로 policy-registry, ido-escrow를 실제 조회하도록 전환.

## Files
- `frontend/src/lib/near/rpc.ts` (create — NEAR RPC view call 유틸)
- `frontend/src/lib/near/contracts.ts` (create — 컨트랙트별 view 함수)
- `frontend/src/app/page.tsx` (modify — mock → 실제 조회)
- `frontend/src/app/projects/[slug]/page.tsx` (modify — policy 동적 조회)
- `frontend/src/app/company/page.tsx` (modify — mock → 실제 조회)
- `frontend/src/lib/mock/policies.ts` (유지 — fallback/개발용)

## Spec

### rpc.ts — NEAR view call 유틸
```typescript
import { NEAR_CONFIG } from "./config";

export async function viewCall<T>(
  contractId: string,
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(NEAR_CONFIG.nodeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "view",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: method,
        args_base64: btoa(JSON.stringify(args)),
      },
    }),
  });
  const data = await res.json();
  const bytes = new Uint8Array(data.result.result);
  return JSON.parse(new TextDecoder().decode(bytes));
}
```

### contracts.ts — 컨트랙트별 함수
```typescript
import { CONTRACT_IDS } from "./config";
import { viewCall } from "./rpc";

// Policy 타입 (온체인 구조체 미러)
export interface OnChainPolicy {
  id: number;
  foundation: string;
  natural_language: string;
  ipfs_cid: string;
  sale_config: {
    token_contract: string;
    total_allocation: string;
    price_per_token: string;
    payment_token: "Near" | { Nep141: string };
    subscription_start: number;
    subscription_end: number;
    live_end: number;
  };
  status: "Upcoming" | "Subscribing" | "Live" | "Closed";
  created_at: number;
}

export async function getAllPolicies(): Promise<OnChainPolicy[]> {
  return viewCall(CONTRACT_IDS.policyRegistry, "get_all_policies");
}

export async function getPolicy(id: number): Promise<OnChainPolicy | null> {
  return viewCall(CONTRACT_IDS.policyRegistry, "get_policy", { id });
}

export async function getContribution(investor: string, policyId: number) {
  return viewCall(CONTRACT_IDS.idoEscrow, "get_contribution", {
    investor, policy_id: policyId,
  });
}

export async function getPolicyTotals(policyId: number) {
  return viewCall(CONTRACT_IDS.idoEscrow, "get_policy_totals", { policy_id: policyId });
}
```

### page.tsx 변경
- `PROJECTS` 하드코딩 배열 제거
- Server Component에서 `getAllPolicies()` 호출
- `OnChainPolicy` → `ProjectMeta` 변환 함수 작성
- fallback: RPC 실패 시 mock 데이터 사용 (개발 편의)

### config.ts 추가
```typescript
export const ZK_VERIFIER_ID = process.env.NEXT_PUBLIC_ZK_VERIFIER ?? `zkverifier.buidlnear.${NEAR_NETWORK}`;
```

## Acceptance Criteria
- [ ] 메인 페이지가 testnet에서 Policy 목록을 실제 조회
- [ ] company 페이지가 특정 Policy 상세 조회
- [ ] RPC 실패 시 에러 핸들링 (빈 목록 또는 fallback)
- [ ] `npm run build` 성공

## Test Cases
1. testnet에 Policy 1개 등록 → 메인 페이지에 표시
2. Policy 없는 상태 → 빈 목록 표시
3. RPC 응답 지연 → loading 상태 표시
4. company 페이지: policy detail + contribution 통계 표시

## 코드리뷰 체크포인트
1. `get_all_policies` 메서드가 policy-registry 컨트랙트에 실제 존재하는지 확인. 없으면 `get_policy(id)` + `get_policy_count()`로 순회 필요
2. `near-api-js` 대신 raw fetch 사용 이유: SSR에서 가벼움. 필요 시 near-api-js로 전환 가능
3. NEAR_CONFIG.nodeUrl이 환경변수로 오버라이드 가능한지

## References
- NEAR RPC: https://docs.near.org/api/rpc/introduction
- 기존 config.ts: `frontend/src/lib/near/config.ts`
- 기존 mock: `frontend/src/lib/mock/policies.ts`
