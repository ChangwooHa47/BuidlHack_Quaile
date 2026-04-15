---
id: fe-02-persona-submission
status: done
sub: FE
layer: fe
depends_on: [fe-01-contract-rpc]
estimate: 2h
demo_step: "Subscribing.Subscription → Review"
---

# FE: Persona 제출 플로우 (지갑 서명 + TEE 호출)

## Context
투자자가 Subscribe 버튼을 누르면: NEAR 지갑 서명 수집 → EVM 지갑 서명 수집 → self_intro 입력 → GitHub OAuth(선택) → TEE `/v1/attest` 호출 → 응답 저장.

기존 `IdentityContext`와 `WalletContext`를 활용하되, 실제 서명 수집 + TEE 호출 로직을 추가.

## Files
- `frontend/src/lib/near/sign.ts` (create — NEAR NEP-413 서명)
- `frontend/src/lib/tee/attest.ts` (create — TEE API 호출)
- `frontend/src/components/PersonaForm.tsx` (create — self_intro 입력 + 제출 UI)
- `frontend/src/components/SubscribingSidebar.tsx` (modify — Subscribe 버튼 연결)
- `frontend/src/contexts/IdentityContext.tsx` (modify — NEAR 서명 상태 추가)

## Spec

### NEAR 서명 수집 (sign.ts)
```typescript
import { buildCanonicalMessage, generateNonce, nowNs } from "@/lib/evm/message";

export async function signNearProof(
  wallet: any,  // wallet-selector wallet
  accountId: string,
  policyId: number,
  nonce: string,
): Promise<NearWalletProof> {
  const ts = nowNs();
  const message = buildCanonicalMessageNear(policyId, nonce, ts, accountId);
  // NEP-413 signMessage
  const signed = await wallet.signMessage({ message, recipient: accountId, nonce: Buffer.from(nonce, "hex") });
  return {
    account_id: accountId,
    public_key: signed.publicKey,
    signature: signed.signature,
    message,
    timestamp: Number(ts),
  };
}
```

`buildCanonicalMessageNear`: `buidl-near-ai|v1|{policyId}|{nonce}|{ts}|near:testnet|{accountId}`

### EVM 서명 수집
기존 `lib/evm/connect.ts` + `message.ts` 활용. `IdentityContext.markEvmSigned`에 실제 서명 호출 연결.

### TEE 호출 (attest.ts)
```typescript
import { TEE_API_URL } from "@/lib/near/config";

export interface AttestationResponse {
  bundle: AttestationBundle;
  tee_report: string;  // base64
  zk_input: {
    payload_hash_limbs: string[];
    criteria: number[];
    criteria_count: string;
  };
}

export async function submitPersona(persona: PersonaSubmission): Promise<AttestationResponse> {
  const res = await fetch(`${TEE_API_URL}/v1/attest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(persona),
  });
  if (!res.ok) throw new Error(`TEE error: ${res.status} ${await res.text()}`);
  return res.json();
}
```

### PersonaForm.tsx
- self_intro 텍스트 입력 (2000자 제한)
- GitHub OAuth 버튼 (선택, MVP에서는 skip 가능)
- 제출 버튼 → 서명 수집 → TEE 호출 → 응답을 sessionStorage에 저장 (fe-03에서 사용)

### GitHub OAuth (MVP 최소)
- GitHub OAuth PKCE 플로우는 복잡하므로 MVP에서는 수동 토큰 입력 또는 skip
- 환경변수: `NEXT_PUBLIC_GITHUB_CLIENT_ID` (optional)

## Acceptance Criteria
- [ ] NEAR wallet-selector로 NEP-413 서명 수집 성공
- [ ] EVM MetaMask로 EIP-191 서명 수집 성공
- [ ] TEE `/v1/attest` 호출 → `AttestationResponse` 수신
- [ ] 응답의 `bundle` + `zk_input`이 sessionStorage에 저장
- [ ] 에러 시 사용자에게 메시지 표시

## Test Cases
1. NEAR 연결 + EVM 연결 → self_intro 입력 → Subscribe → TEE 호출 성공
2. NEAR 미연결 → Subscribe 버튼 비활성
3. TEE 서비스 다운 → 에러 메시지
4. self_intro 빈 문자열 → 클라이언트 validation

## 코드리뷰 체크포인트
1. canonical message 형식이 `tee/shared/src/persona.rs`의 `CANONICAL_MSG_TEMPLATE`과 일치하는지
2. nonce가 32바이트 hex인지
3. timestamp가 nanoseconds인지 (milliseconds 아님)
4. TEE 응답의 `zk_input` 구조가 `circuits/input_example.json`과 호환되는지

## References
- NEP-413: https://github.com/nicholasgasior/NEPs/blob/nep413/neps/nep-0413.md
- 기존 WalletContext: `frontend/src/contexts/WalletContext.tsx`
- 기존 IdentityContext: `frontend/src/contexts/IdentityContext.tsx`
- 기존 evm/message.ts: `frontend/src/lib/evm/message.ts`
