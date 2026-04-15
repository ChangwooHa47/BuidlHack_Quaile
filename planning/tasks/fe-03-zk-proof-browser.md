---
id: fe-03-zk-proof-browser
status: done
sub: FE
layer: fe
depends_on: [fe-02-persona-submission, zk-01-circom-circuit]
estimate: 1.5h
demo_step: "Subscribing.Contribution (전처리)"
---

# FE: 브라우저에서 ZK proof 생성 (snarkjs)

## Context
TEE 응답의 `zk_input`을 받아 브라우저에서 snarkjs로 groth16 proof를 생성. 이 proof가 `contribute()` 호출의 인자가 됨.

## Files
- `frontend/src/lib/zk/prove.ts` (create — snarkjs wrapper)
- `frontend/public/zk/eligibility.wasm` (copy from circuits/build/)
- `frontend/public/zk/eligibility_final.zkey` (copy from circuits/build/)
- `frontend/package.json` (modify — snarkjs 의존성 추가)

## Spec

### snarkjs 설치
```bash
cd frontend && npm install snarkjs
```

### circuit 산출물 배치
```bash
# circuits/build/ → frontend/public/zk/
cp circuits/build/eligibility_js/eligibility.wasm frontend/public/zk/
cp circuits/build/eligibility_final.zkey frontend/public/zk/
```

### prove.ts
```typescript
import * as snarkjs from "snarkjs";

export interface ZkCircuitInput {
  payload_hash_limbs: string[];
  criteria: number[];
  criteria_count: string;
}

export interface ZkProofResult {
  proof: object;    // snarkjs proof JSON
  publicSignals: string[];  // [limb0, limb1, limb2, limb3, eligible]
}

const WASM_URL = "/zk/eligibility.wasm";
const ZKEY_URL = "/zk/eligibility_final.zkey";

export async function generateEligibilityProof(
  input: ZkCircuitInput,
): Promise<ZkProofResult> {
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    WASM_URL,
    ZKEY_URL,
  );
  // 마지막 publicSignal이 eligible (1 = pass)
  const eligible = publicSignals[publicSignals.length - 1];
  if (eligible !== "1") {
    throw new Error("ZK proof: not eligible (criteria not all passed)");
  }
  return { proof, publicSignals };
}
```

### 플로우
1. fe-02에서 TEE 응답의 `zk_input`을 sessionStorage에서 로드
2. `generateEligibilityProof(zk_input)` 호출
3. proof + publicSignals를 JSON 직렬화하여 fe-04의 contribute에 전달

### 주의사항
- snarkjs `fullProve`는 wasm + zkey를 fetch로 가져옴 → `public/zk/`에 배치
- zkey 파일이 클 수 있음 (수 MB) → 프로덕션에서는 CDN 고려
- 브라우저에서 proof 생성은 1~3초 소요 → loading UI 필요

## Acceptance Criteria
- [ ] `npm install snarkjs` 성공
- [ ] `public/zk/` 에 wasm + zkey 파일 존재
- [ ] `generateEligibilityProof(validInput)` → proof + publicSignals 반환
- [ ] eligible=0인 input → Error throw
- [ ] `npm run build` 성공 (snarkjs SSR 호환 확인)

## Test Cases
1. 전부 pass input → proof 생성 성공, eligible="1"
2. 일부 fail input → Error "not eligible"
3. wasm/zkey 파일 없음 → fetch 에러 핸들링
4. 대기 시간 측정 (3초 이내)

## 코드리뷰 체크포인트
1. snarkjs가 Next.js SSR에서 문제 없는지 — `"use client"` 필요할 수 있음
2. wasm/zkey 파일 크기 확인 → Vercel 무료 플랜 제한 (100MB) 내인지
3. `ZkCircuitInput` 타입이 TEE 응답의 `zk_input` 구조와 일치하는지

## References
- snarkjs npm: https://www.npmjs.com/package/snarkjs
- snarkjs browser usage: https://github.com/iden3/snarkjs#in-the-browser
- circuit 산출물: `circuits/build/`
