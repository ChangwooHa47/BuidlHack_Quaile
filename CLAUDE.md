# Project: Qualie (Buidl-NEAR AI)

TEE 기반 AI Attestation IDO 런치패드. 모노레포.

## Build & Run

```bash
# Frontend
cd frontend && npm install && npm run dev

# Rust (contracts + shared crate)
cargo build --workspace
cargo build --target wasm32-unknown-unknown --release

# TEE Python
cd tee/inference && uv sync && uv run pytest
```

## Monorepo Layout

- `frontend/` — Next.js 16 + Tailwind v4 + TypeScript
- `contracts/` — Rust NEAR 스마트 컨트랙트
- `tee/shared/` — Rust shared crate (컨트랙트 + TEE 공용 타입)
- `tee/inference/` — Python FastAPI TEE 서비스
- `planning/` — PRD, ERD, 태스크 문서 (코드 아님)

## Branch Strategy

- `main` — 개발 통합. feature 브랜치 머지 대상
- `staging` — QA 배포 (Vercel Preview)
- `production` — 프로덕션 배포 (Vercel Production)
- feature: `feat/{description}-#{issue}`
- 1이슈 = 1브랜치 = 1PR. force push 금지

## Coding Rules

### Frontend
- Server Component 기본. `"use client"`는 상태/이벤트 필요할 때만
- 디자인 토큰은 `globals.css`의 `@theme inline` 사용. 하드코딩 색상/간격 금지
- Phase(4개): Upcoming / Subscribing / Live / Closed — 필터, chip용
- Status(8개): Phase 내 세부 상태 — CTA, 사이드바용
- `phaseOf(status)` 헬퍼로 Status→Phase 변환

### 프라이버시 (FE 전체 하드 룰)
- ❌ 개별 지갑 주소 렌더링 금지
- ❌ self_intro 원문 표시 금지
- ❌ GitHub login/email 표시 금지
- ✅ evidence_summary 집계 필드만 표시 (wallet_count, avg_holding_days 등)

### Rust
- `tee/shared` crate가 타입 SSOT. 컨트랙트와 TEE가 동일 타입 공유
- Borsh 직렬화. payload_hash = keccak256(borsh(payload))
- 서명: secp256k1 ECDSA (env::ecrecover)

### Python (TEE)
- `eth_keys.PrivateKey.sign_msg_hash` 사용 (eth_account.signHash 금지 — EIP-191 prefix 적용됨)
- `eth_hash.auto.keccak` 사용 (pysha3 금지 — Python 3.11+ 빌드 실패)

## Environment Variables (frontend/.env.local)

```
NEXT_PUBLIC_POLICY_REGISTRY=policy.buidlnear.testnet
NEXT_PUBLIC_ATTESTATION_VERIFIER=verifier.buidlnear.testnet
NEXT_PUBLIC_IDO_ESCROW=escrow.buidlnear.testnet
NEXT_PUBLIC_TEE_API_URL=http://localhost:8080
```

## Key References

- 기획: `planning/PRD.md`, `planning/ERD.md`
- 디자인: Figma `2jqTgg2yRVflKmWR2huonu`
- TEE 리서치: `planning/research/near-ai-tee-notes.md`
- NEAR testnet. 서명 알고리즘 secp256k1.
