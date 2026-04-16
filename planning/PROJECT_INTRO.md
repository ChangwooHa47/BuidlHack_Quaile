# Qualie — AI-Powered Private IDO Launchpad on NEAR

## 한 줄 소개

**재단이 자연어로 투자자 선별 기준을 정의하면, TEE 안의 AI가 심사하고, ZK proof로 프라이버시를 보장하는 IDO 런치패드.**

---

## 문제

기존 IDO 런치패드(Legion, Echo, Buidlpad)는 스테이킹 티어로 투자자를 선별한다. 재단은 "장기 보유자", "DAO 참여자", "개발 기여자" 같은 질적 기준을 반영할 방법이 없고, 결국 자본력 큰 지갑이 할당을 독점한다.

더 근본적인 문제는 — 심사를 하려면 투자자의 지갑 이력, 활동 내역, 개인 정보를 열람해야 하는데, 이걸 재단이나 런치패드에 넘기는 순간 프라이버시가 깨진다.

**"심사는 하되, 아무도 원본 데이터를 보지 못하게"** — 이 모순을 풀어야 한다.

---

## 솔루션

### 핵심 플로우

```
1. 재단: 자연어로 선별 기준 등록
   "장기 보유 성향이 강한 홀더 대상, DAO 거버넌스 참여자 우대"
        ↓
   LLM이 세부 평가 항목 자동 생성 → 재단이 수정/확정
   세부 criteria를 TEE 공개키로 암호화 → IPFS 저장 → 온체인에 CID만 등록
        ↓
2. 투자자: 지갑 연결 + 자기소개 작성 → Subscribe
        ↓
3. TEE (Trusted Execution Environment):
   - IPFS에서 암호화된 criteria 가져옴 → TEE 개인키로 복호화
   - 멀티체인 온체인 데이터 자동 수집 (NEAR + 6개 EVM 체인)
   - AI(LLM)가 세부 criteria 기준으로 항목별 Pass/Fail 판정
   - 판정 결과에 TEE 서명
   - 원본 데이터 즉시 폐기 — 재단도, 운영자도, 누구도 못 봄
        ↓
4. ZK Proof (브라우저):
   - "전부 Pass = 적격"을 영지식 증명으로 생성
   - 온체인에는 적격 여부 1bit + ZK proof만 올라감
   - 어떤 항목에서 통과/실패했는지조차 안 보임
        ↓
5. 온체인 (NEAR):
   - TEE 서명 검증 + ZK proof 검증
   - 적격 투자자만 에스크로에 자금 예치
   - Settlement → Claim/Refund
        ↓
6. Claim (로드맵):
   - NEAR Chain Signatures(MPC)로 cross-chain 토큰 수령
   - "NEAR에서 투자했는데, MetaMask에 토큰이 도착"
```

### 왜 다른가

| | 기존 런치패드 | Qualie |
|---|---|---|
| **선별 기준** | 스테이킹 티어 (런치패드가 정함) | 재단이 자연어로 정의 |
| **심사 방식** | 없음 또는 KYC 서류 제출 | AI가 온체인 데이터로 자동 판정 |
| **프라이버시** | 지갑 주소, 거래 내역 노출 | TEE 안에서만 처리, 외부 노출 제로 |
| **평가 기준 보호** | 공개 또는 없음 | IPFS 암호화 저장, TEE만 복호화 |
| **온체인 증명** | 서명 or 없음 | TEE 서명 + ZK proof 이중 검증 |
| **멀티체인** | 단일 체인 | NEAR + Ethereum/Base/Arbitrum/Optimism/Polygon/BSC |

---

## 기술 아키텍처

```
┌─ Frontend (Browser) ─────────────────────────────────────────┐
│                                                               │
│  재단: Criteria 입력 → LLM 세부항목 생성 → 수정/확정            │
│        → TEE 공개키로 암호화 → IPFS 업로드 → 온체인에 CID 등록   │
│                                                               │
│  투자자: Identity 구성 → Subscribe → ZK proof 생성 → Contribute │
│                                                               │
└───────────────────────────┬───────────────────────────────────┘
                            │
              ┌─────────────┼──────────────┐
              ▼             │              ▼
┌──────────────────────┐    │    ┌─────────────────────────────┐
│  Qualie CVM (TEE 1)  │    │    │  NEAR AI Cloud (TEE 2)      │
│                      │◄───┘    │                             │
│  IPFS에서 암호화된    │ Inference│  LLM이 TEE 안에서 실행       │
│  criteria 가져옴     ├────────►│  cloud-api.near.ai          │
│  → TEE 개인키로 복호화│ Criteria │                             │
│                      │◄────────┤  항목별 Pass/Fail 판정       │
│  데이터 수집:         │         │                             │
│  ├ NEAR RPC          │         └─────────────────────────────┘
│  ├ EVM RPC (6 chains)│
│  └ GitHub API        │
│                      │
│  TEE 서명 (secp256k1)│
│  → bundle + zk_input │
│  → 데이터 즉시 폐기  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Browser             │
│  ZK proof 생성       │     Criteria stays private
│  (snarkjs, groth16)  │     Only eligible bit exits
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  NEAR Chain (On-chain)                                        │
│                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │   Verify    │  │   Escrow    │  │       Claim         │   │
│  │ TEE sig + ZK│  │ Contribute  │  │    Settlement       │   │
│  └─────────────┘  └─────────────┘  └──────────┬──────────┘   │
│                                                │              │
└────────────────────────────────────────────────┼──────────────┘
                                                 │
                                                 ▼
                                    ┌────────────────────────┐
                                    │ Chain Signatures (MPC)  │
                                    │ Cross-chain token claim │    Ethereum
                                    │                        │    Base
                                    │ NEAR에서 투자 →         │    Arbitrum
                                    │ MetaMask에서 수령       │    ...
                                    └────────────────────────┘
```

### 3단계 Criteria 플로우

```
1단계: 재단이 자연어 입력
   "장기 보유 성향이 강한 홀더, DAO 참여자 우대"
                    ↓
2단계: LLM이 세부 criteria 생성 → 재단이 수정/확정
   - 토큰 보유 90일 이상
   - DAO 투표 3회 이상
   - 멀티체인 활동 이력
   → TEE 공개키로 암호화 → IPFS 저장
   → 온체인에 CID만 등록 (세부 내용 비공개)
                    ↓
3단계: TEE가 확정된 criteria로 투자자 판정
   IPFS에서 암호화된 criteria 가져옴 → TEE 개인키로 복호화 → pass/fail 판정
```

### 프라이버시 설계

```
투자자가 제출하는 것:       지갑 서명, 자기소개, GitHub
TEE 안에서 처리되는 것:     온체인 이력, 세부 criteria 복호화, LLM 판정, 서명 생성
TEE 밖으로 나오는 것:       적격/부적격 + TEE 서명 + ZK proof
온체인에 기록되는 것:       ZK proof (적격 여부 1bit) + criteria CID (암호화됨)
재단이 보는 것:            "적격 N명 / 부적격 M명" (누가, 왜인지 모름)
투자자가 보는 것:          "Eligible" 또는 "Ineligible" (어떤 항목인지 모름)
재단의 평가 기준:          IPFS에 암호화 저장, TEE만 복호화 가능
```

### 보안 레이어 요약

| 보호 대상 | 보호 방법 |
|---|---|
| 투자자 지갑 데이터 | TEE 안에서만 처리, 즉시 폐기 |
| 투자자 자기소개 | TEE 안에서만 처리, 즉시 폐기 |
| 재단 세부 평가 기준 | IPFS 암호화 저장, TEE만 복호화 |
| 심사 결과 (항목별) | ZK proof로 감싸서 eligible 1bit만 공개 |
| TEE 서명 키 | CVM 하드웨어 격리, TDX attestation |
| LLM 추론 | NEAR AI Cloud TEE 안에서 실행 |

---

## 기술 스택

| 레이어 | 기술 |
|---|---|
| Smart Contracts | Rust + NEAR SDK 5.3 (5개: policy-registry, attestation-verifier, zk-verifier, ido-escrow, mock-ft) |
| TEE Service | Python FastAPI on CVM (Intel TDX) |
| LLM Inference | NEAR AI Cloud (TEE에서 실행, OpenAI-compatible API) |
| ZK Circuit | circom 2.x + groth16 (snarkjs, MAX_CRITERIA=10) |
| Criteria Storage | IPFS (암호화) + 온체인 CID |
| Frontend | Next.js 16 + Tailwind v4 + TypeScript |
| 지갑 연결 | NEAR Wallet Selector + MetaMask (EVM) |
| 데이터 수집 | NEAR RPC + EVM RPC (6 chains) + GitHub API |
| 서명 | secp256k1 ECDSA (TEE signing key) |
| 온체인 검증 | env::ecrecover + groth16 verifier |
| Cross-chain (로드맵) | NEAR Chain Signatures (MPC) |

---

## 데모 시나리오

### Scene 1: 재단 — 평가 기준 등록

재단이 Admin 페이지에서 자연어 기준을 등록한다.

```
"장기 보유 성향이 강한 홀더 대상, DAO 거버넌스 참여자 우대"
```

AI가 자동으로 세부 평가 항목을 생성:
- 토큰 보유 90일 이상
- DAO 투표 3회 이상 참여
- 멀티체인 활동 이력
- 지갑 연령 180일 이상
- 자기소개에서 블록체인 경험 언급

재단이 세부 항목을 수정/삭제/추가한 뒤 Publish.
세부 criteria는 TEE 공개키로 암호화되어 IPFS에 저장. 온체인에는 CID만.
투자자에게 공개할 기준(External)과 실제 평가 기준(Internal)을 분리 관리.

### Scene 2: 투자자 — 심사 + 투자

투자자가 NEAR 지갑 + MetaMask를 연결하고 Subscribe한다.

```
[TEE 내부 — 이 화면은 데모에서만 보여줌]

🔒 TEE Secure Environment
══════════════════════════

📋 Encrypted criteria loaded from IPFS → decrypted inside TEE

📡 Collecting on-chain signals...
   NEAR wallets: 1  |  EVM wallets: 2  |  GitHub: yes
   Avg holding days: 245  |  DAO votes: 7

🤖 Evaluating against criteria...
   ✓ Token holding > 90 days
   ✓ DAO participation >= 3 votes
   ✓ Multi-chain activity
   ✓ Wallet age > 180 days
   ✗ GitHub contributions

━━━━━━━━━━━━━━━━━━━━━━━
   Verdict: Ineligible (4/5)
━━━━━━━━━━━━━━━━━━━━━━━

🔐 ZK proof generated: only "ineligible" bit exits TEE
⚠️ Everything above stays inside the TEE
```

투자자 화면에는 **"Ineligible"** 한 단어만 보인다. 재단에게는 **"부적격 1명"** 숫자만 보인다.

적격 판정을 받으면 → ZK proof 생성 (브라우저에서 수 초) → NEAR로 Contribute.

### Scene 3: 정산 + 토큰 수령

Settlement 후 투자자가 할당된 토큰을 Claim한다.
(로드맵: NEAR Chain Signatures로 다른 체인 토큰도 직접 수령)

---

## Roadmap

### Prototype (Current)

End-to-end evaluation pipeline live on NEAR testnet. Five smart contracts deployed (policy-registry, attestation-verifier, zk-verifier, ido-escrow, mock-ft). Dual-TEE architecture: Qualie CVM handles data collection and orchestration; NEAR AI Cloud CVM runs LLM inference. Multi-chain data sources cover NEAR, Ethereum, Arbitrum, and GitHub. ZK proofs are generated in-browser via snarkjs, exposing only a single eligibility bit on-chain. Both Foundation admin and investor flows are implemented.

**Proves:** The combination of AI, TEE, and ZK for private IDO screening works end-to-end.

---

### MVP — Mainnet Launch

The shippable product. Onboard pilot Foundations and run real IDOs.

- **Complete Privacy** — Criteria encrypted with TEE pubkey, stored on IPFS. Only the CID lives on-chain.
- **Stablecoin Settlement** — USDt and USDC support via NEP-141, matching IDO market standard.
- **Cross-chain Claim** — NEAR Chain Signatures deliver tokens directly to Ethereum, Base, Arbitrum, or Bitcoin. Invest on NEAR, claim anywhere.
- **Expanded Data Sources** — Twitter/X, Farcaster, Discord, and Gitcoin Passport added alongside on-chain signals. Foundations selectively enable what they need.
- **Production Infrastructure** — TEE deployed to Phala Cloud CVM with real TDX attestation. Dev signer removed; signer keys generated inside the CVM.

**Proves:** Qualie is a product, not an experiment.

---

### Phase 2 — Frictionless Participation

Remove the NEAR wallet requirement entirely. EVM users participate with MetaMask alone. Chain Signatures generate NEAR transactions on their behalf, and meta-accounts are created automatically in the background. Contributions can be paid in EVM stablecoins. Investors never know they are touching NEAR.

**Proves:** Chain abstraction realized on both sides — Contribute and Claim.

---

## 구현 현황

| 영역 | 상태 |
|---|---|
| Smart Contracts (5개) | ✅ 구현 + testnet 배포 완료 |
| TEE Service (FastAPI) | ✅ 구현 완료 |
| ZK Circuit (circom) | ✅ 구현 + trusted setup 완료 |
| Frontend (Next.js) | ✅ 구현 완료 (Admin + 투자자 페이지) |
| 멀티체인 데이터 수집 | ✅ NEAR + 6 EVM chains |
| E2E 테스트 스크립트 | ✅ 구현 완료 |
| TEE 데모 시각화 (CLI) | ✅ 구현 완료 |
| Testnet 배포 | ✅ 5개 컨트랙트 + 8개 테스트 Policy |
| IPFS 암호화 criteria | 🔜 v1.1 |
| Cross-chain Claim | 🔜 v2 |

---

## 팀

| 역할 | 이름 |
|---|---|
| 기획 + 개발 | Changwoo Ha |

---

## 링크

- GitHub: https://github.com/ChangwooHa47/NEARAIwithZK
- NEAR Testnet Contracts: `*.rockettheraccon.testnet`
