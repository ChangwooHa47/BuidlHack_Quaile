---
id: fe-04-contribute-flow
status: done
sub: FE
layer: fe
depends_on: [fe-03-zk-proof-browser]
estimate: 1.5h
demo_step: "Subscribing.Contribution"
---

# FE: Contribute 플로우 (bundle + ZK proof → ido-escrow)

## Context
투자자가 TEE attestation + ZK proof를 받은 뒤, `ido-escrow.contribute()`를 호출하여 자금을 예치.

## Files
- `frontend/src/lib/near/transactions.ts` (create — 컨트랙트 호출 유틸)
- `frontend/src/components/ContributeButton.tsx` (create — 금액 입력 + 제출)
- `frontend/src/app/projects/[slug]/page.tsx` (modify — ContributeButton 연결)

## Spec

### transactions.ts — 컨트랙트 호출
```typescript
import { CONTRACT_IDS } from "./config";

export async function contribute(
  wallet: any,  // wallet-selector wallet
  policyId: number,
  bundle: object,  // AttestationBundle JSON
  zkProofJson: string,  // JSON.stringify(proof)
  zkPublicInputsJson: string,  // JSON.stringify(publicSignals)
  depositNear: string,  // "10" (NEAR 단위)
) {
  return wallet.signAndSendTransaction({
    receiverId: CONTRACT_IDS.idoEscrow,
    actions: [{
      type: "FunctionCall",
      params: {
        methodName: "contribute",
        args: {
          policy_id: policyId,
          bundle,
          zk_proof_json: zkProofJson,
          zk_public_inputs_json: zkPublicInputsJson,
        },
        gas: "200000000000000",  // 200 TGas
        deposit: parseNearAmount(depositNear),
      },
    }],
  });
}
```

### ContributeButton.tsx
- 금액 입력 (NEAR 단위)
- "Contribute" 버튼
- 클릭 시:
  1. sessionStorage에서 bundle + zk proof 로드
  2. `contribute()` 호출
  3. tx 결과 표시 (성공/실패)
  4. 성공 시 sessionStorage 클리어

### 프로젝트 상세 페이지 연결
- `projects/[slug]/page.tsx`의 "Subscribe" 버튼 → PersonaForm → TEE 호출 → ZK proof → ContributeButton 순서
- 상태 머신: `idle → signing → attesting → proving → contributing → done`

## Acceptance Criteria
- [ ] 투자자가 금액 입력 → Contribute → NEAR tx 성공
- [ ] tx에 bundle + ZK proof가 올바르게 전달
- [ ] 200 TGas 설정
- [ ] deposit이 NEAR 단위 → yoctoNEAR 변환
- [ ] tx 실패 시 에러 메시지 + rollback 없음 (컨트랙트가 자동 refund)

## Test Cases
1. happy: 유효 bundle + proof + 10 NEAR → contribute 성공
2. fail: 만료된 attestation → 컨트랙트 에러 → FE에서 에러 표시
3. fail: 이미 contributed → "AlreadyContributed" 에러
4. edge: 0 NEAR deposit → "InsufficientDeposit" 에러
5. edge: 지갑 연결 안 됨 → 버튼 비활성

## 코드리뷰 체크포인트
1. `zk_proof_json`과 `zk_public_inputs_json`이 문자열(JSON string)으로 전달되는지 (object가 아니라)
2. gas 200 TGas가 verify + verify_proof 체인에 충분한지
3. NEAR amount가 yoctoNEAR로 올바르게 변환되는지 (1 NEAR = 10^24 yoctoNEAR)

## References
- NEAR wallet-selector signAndSendTransaction: https://github.com/near/wallet-selector
- ido-escrow contribute 시그니처: `contracts/ido-escrow/src/subscription.rs`
