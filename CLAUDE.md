# Buidl-NEAR AI (Qualie)

## 프로젝트 개요
TEE 기반 AI Attestation IDO 런치패드. 재단이 투자자 선별 기준을 자연어로 등록하고, TEE 안의 AI가 투자자의 페르소나를 심사하여 서명된 Attestation을 발급.

## 브랜치 전략
```
main        ← 개발 통합 (feature 브랜치 머지 대상)
staging     ← QA / 테스트 배포 (main에서 머지)
production  ← 프로덕션 배포 (staging 검증 후 머지)
```

- feature 브랜치: `feat/{description}-#{issue}` (예: `feat/fe-publishing-#2`)
- 1이슈 = 1브랜치 = 1PR
- force push 금지, 브랜치 삭제 금지 (머지 후 자동 정리)

## 모노레포 구조
```
NEARAI/
├── frontend/          # Next.js 16 + Tailwind v4 + TypeScript
├── contracts/         # Rust NEAR 스마트 컨트랙트 (다른 팀 담당)
├── tee/               # TEE 추론 서비스 Python (다른 팀 담당)
├── planning/          # PRD, ERD, 태스크, 리서치
└── scripts/           # 배포/테스트 스크립트
```

## Frontend (frontend/)

### 기술 스택
- Next.js 16.2.3 (App Router)
- Tailwind CSS v4 (`@theme inline` 토큰)
- TypeScript (strict)
- DM Sans (Google Fonts)

### 실행
```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
npm run build      # 프로덕션 빌드
```

### 환경변수 (frontend/.env.local)
```bash
NEXT_PUBLIC_POLICY_REGISTRY=policy.buidlnear.testnet
NEXT_PUBLIC_ATTESTATION_VERIFIER=verifier.buidlnear.testnet
NEXT_PUBLIC_IDO_ESCROW=escrow.buidlnear.testnet
NEXT_PUBLIC_TEE_API_URL=http://localhost:8080
```
환경변수 없어도 기본값(testnet)으로 동작.

### 배포
- **플랫폼**: Vercel 권장
- **staging**: `staging` 브랜치 push 시 자동 배포 (Vercel Preview)
- **production**: `production` 브랜치 push 시 자동 배포 (Vercel Production)
- **Vercel 설정**:
  - Root Directory: `frontend`
  - Framework Preset: Next.js
  - Build Command: `npm run build`
  - Output Directory: `.next`
  - Environment Variables: 위 `.env.local` 항목을 Vercel 대시보드에 등록

### 디자인 시스템
- Figma: `2jqTgg2yRVflKmWR2huonu`
- 토큰: `frontend/src/app/globals.css`의 `@theme inline` 블록
- 컬러: Gray scale (0~1000), Alpha white, Neon accent (#C8FF00), Status colors
- 타이포: DM Sans (400/500/600/700)
- 간격: 2xs~3xl (4~64px)
- Radius: xs~pill

### Phase × Status 모델
```
Phase (온체인 4개, 필터/chip):  Upcoming → Subscribing → Live → Closed
Status (세부 8개, CTA/사이드바):
  Upcoming:     Upcoming
  Subscribing:  Subscription → Review → Contribution
  Live:         Settlement → Refund → Claim
  Closed:       Closed
```

### 프라이버시 제약 (FE 전체 적용)
- ❌ 개별 지갑 주소 렌더링 금지
- ❌ self_intro 원문 표시 금지
- ❌ GitHub login/email 표시 금지
- ✅ evidence_summary 집계 필드만 표시

## BE (contracts/ + tee/)
다른 팀이 담당. 상세는 `planning/PRD.md`, `planning/ERD.md` 참조.

### NEAR 컨트랙트 (testnet)
- `policy-registry` — 재단 Policy 등록
- `attestation-verifier` — TEE 서명 검증 (secp256k1 ecrecover)
- `ido-escrow` — IDO 에스크로 (contribute/settle/claim/refund)
- `mock-ft` — 데모용 NEP-141 토큰

### TEE 서비스
- Python FastAPI, NEAR AI Cloud TEE
- secp256k1 ECDSA 서명
- 상세: `planning/research/near-ai-tee-notes.md`
