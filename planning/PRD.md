# Buidl-NEAR AI — Product Requirements Document

> **TEE 기반 AI Attestation으로 재단이 직접 투자자를 선별하는 IDO 런치패드**
>
> 이 문서는 `ONE_PAGER.md`를 개발/디자인 의사결정에 쓸 수 있는 수준으로 확장한 PRD이다.
> 모든 기능 요구사항은 **Phase × Status state machine**(§5)에 정합해야 한다.

---

## 0. 변경 이력

| 버전 | 날짜 | 변경 |
| --- | --- | --- |
| v1.0 | 2026-04-12 | 초안 (iteration 1) |

---

## 1. 제품 비전

**한 문장**: 재단이 자신이 원하는 투자자를 직접 선별할 수 있도록, TEE 안의 AI가 프라이버시를 유지한 채 투자자의 페르소나를 심사해 서명된 Attestation을 발급하는 IDO 런치패드.

**이 제품이 없을 때의 세계**:
- 재단은 Legion/Echo/Buidlpad의 획일적인 티어 시스템에 의존한다
- 고래 독식 또는 추첨 방식으로 "장기 홀더"나 "개발자 기여자"를 골라내기 어렵다
- 신원·기여도 심사 결과가 플랫폼에 종속되어 이식 불가하다

**이 제품이 있을 때의 세계**:
- 재단은 자연어로 "내가 원하는 투자자" 기준을 등록한다
- 투자자는 한 번의 페르소나 제출로 AI 심사를 받는다
- TEE가 심사 과정에서 원본 데이터를 노출하지 않는다
- 온체인 Verifier가 Attestation 서명을 검증하고 IDO Claim을 가능하게 한다

---

## 2. 타겟 사용자

### 2.1 재단 (Foundation)
- **누구**: IDO를 준비하는 프로젝트 재단. 토큰 분배 대상을 질적으로 고를 필요가 있는 팀.
- **Goals**:
  - 원하는 기준에 맞는 투자자에게만 토큰을 분배
  - 심사 과정에 대한 투명성과 검증 가능성
  - 기존 런치패드의 티어 시스템에서 벗어나기
- **Pains**:
  - 자연어로 원하는 기준을 표현할 방법이 없음
  - 투자자의 온체인 이력을 종합 분석할 내부 역량 부족
  - 프라이버시 이슈로 투자자의 정보를 직접 수집하기 어려움

### 2.2 투자자 (Investor)
- **누구**: IDO 참여를 원하는 크립토 유저. 여러 지갑(NEAR + EVM)을 보유.
- **Goals**:
  - 자기 기여/보유 이력을 근거로 적격성 증명
  - 개인정보 노출 없이 심사 통과
  - 한 번 발급받은 Attestation을 여러 런치에 재사용 (로드맵)
- **Pains**:
  - KYC 과정에서 원본 문서 제출 불편
  - 스테이킹 기반 티어에서 고래에게 밀림
  - 심사 결과가 플랫폼마다 초기화됨

### 2.3 (로드맵) 타 런치패드
- MVP 범위 아님

---

## 3. 유저 스토리

### 3.1 재단 스토리

**F-1**. 재단으로서, 나는 자연어로 선별 기준을 작성하고 온체인에 등록하고 싶다. 그래야 런치패드 UI에 내 기준이 공식적으로 기록된다.

**F-2**. 재단으로서, 나는 IDO 세일 조건(총 할당, 가격, 기간)을 Policy와 함께 등록하고 싶다. 그래야 Subscribing Phase 진입 시점부터 투자자가 참여할 수 있다.

**F-3**. 재단으로서, 나는 Subscribing 단계에서 심사 중인 투자자 수와 통과 현황을 조회하고 싶다. 그래야 데모 영상에서 라이브로 보여줄 수 있다.

**F-4**. 재단으로서, 나는 Settlement 시점에 매칭 결과와 총 컨트리뷰션 규모를 확인하고 싶다.

**F-5** (로드맵). 재단으로서, 나는 Policy를 수정하고 싶다. 단, Upcoming 단계에서만.

### 3.2 투자자 스토리

**I-1**. 투자자로서, 나는 NEAR 지갑과 EVM 지갑 여러 개, 자기소개, GitHub 계정을 묶어 페르소나로 제출하고 싶다.

**I-2**. 투자자로서, 나는 내 EVM 지갑이 실제 내 것임을 EIP-191 서명으로 증명하고 싶다. 그래야 남의 지갑을 도용할 수 없다.

**I-3**. 투자자로서, 나는 TEE가 심사 중임을 눈으로 확인하고, 심사 결과(적격/부적격 + 점수 + 근거 요약)를 받고 싶다.

**I-4**. 투자자로서, 나는 적격 판정을 받은 후 Contribution 단계에서 자금을 에스크로에 예치하고 싶다.

**I-5**. 투자자로서, 나는 Settlement 이후 매칭된 분량의 토큰을 Claim하거나 미매칭 자금을 Refund 받고 싶다.

**I-6**. 투자자로서, 나는 내 자기소개나 지갑 원본 데이터가 TEE 밖으로 나가지 않는다는 것을 기술적으로 확인하고 싶다 (Attestation Report).

---

## 4. 기능 요구사항 (FR)

### 4.1 Policy Registry (온체인)

| ID | 요구사항 | 우선순위 |
| --- | --- | --- |
| FR-PR-1 | 재단이 Policy를 등록할 수 있다 (자연어 + IPFS CID + SaleConfig) | P0 |
| FR-PR-2 | 등록된 재단만 register_policy 호출 가능하다 | P0 |
| FR-PR-3 | Policy는 state machine에 따라 status 전이를 한다 (Upcoming→Subscribing→Live→Closed) | P0 |
| FR-PR-4 | state 전이는 시간 기준(subscription_start 등)을 어기지 못한다 | P0 |
| FR-PR-5 | Policy 목록을 status 기준으로 조회할 수 있다 | P1 |
| FR-PR-6 | Policy 등록 시 PolicyRegistered 이벤트 발행 | P1 |
| FR-PR-7 | 잘못된 SaleConfig(시간 역전, 0 할당)는 거부한다 | P0 |

### 4.2 Attestation Verifier (온체인)

| ID | 요구사항 | 우선순위 |
| --- | --- | --- |
| FR-AV-1 | TEE 서명된 AttestationBundle의 서명을 검증한다 | P0 |
| FR-AV-2 | payload_hash가 payload의 실제 해시와 일치하는지 검증한다 | P0 |
| FR-AV-3 | TEE 공개키는 owner만 갱신할 수 있다 | P0 |
| FR-AV-4 | verdict = Eligible 여부를 조회할 수 있다 (is_eligible) | P0 |
| FR-AV-5 | 키 로테이션 후 이전 키로 서명된 번들은 거부한다 | P0 |
| FR-AV-6 | Attestation이 policy의 subscription 기간 내에 발급되었는지 검증한다 | P1 |

### 4.3 IDO Escrow (온체인)

| ID | 요구사항 | 우선순위 |
| --- | --- | --- |
| FR-IE-1 | Subscribing.Contribution 단계에서만 contribute() 호출 가능 | P0 |
| FR-IE-2 | contribute() 시점에 AttestationVerifier로 is_eligible 확인 | P0 |
| FR-IE-3 | 동일 (investor, policy_id) 쌍으로 중복 예치 불가 | P0 |
| FR-IE-4 | settle() 호출 시 총 수요/공급 매칭 후 각 Contribution의 `outcome`을 `FullMatch` / `PartialMatch` / `NoMatch` 중 하나로 확정. `matched_amount`, `token_amount`도 같이 저장 | P0 |
| FR-IE-5 | `outcome ∈ {FullMatch, PartialMatch}` 이고 `claim_done == false`인 투자자는 `claim()`으로 토큰 수령 → `claim_done = true` | P0 |
| FR-IE-6 | `outcome ∈ {PartialMatch, NoMatch}` 이고 `refund_done == false`인 투자자는 `refund()`로 잔여 자금 수령 → `refund_done = true`. `PartialMatch`는 claim/refund를 독립적으로 각각 1회씩 호출 가능 | P0 |
| FR-IE-7 | Phase 위반 호출은 WrongPhase 에러로 거부 | P0 |
| FR-IE-8 | settle()은 policy의 subscription_end 이후에만 호출 가능 | P0 |

### 4.4 TEE 추론 코어

| ID | 요구사항 | 우선순위 |
| --- | --- | --- |
| FR-TEE-1 | Persona를 수신하고 nonce 재사용을 검출한다 | P0 |
| FR-TEE-2 | EVM 지갑은 EIP-191 서명으로 소유권을 재검증한다 | P0 |
| FR-TEE-3 | NEAR 지갑은 FullAccess 공개키 서명으로 소유권을 재검증한다 | P0 |
| FR-TEE-4 | 제출된 지갑들의 온체인 이력을 수집한다 (NEAR + 지원 EVM 체인 전부) | P0 |
| FR-TEE-5 | GitHub OAuth 토큰이 있으면 기여 이력을 수집한다 | P1 |
| FR-TEE-6 | Policy의 natural_language를 LLM으로 StructuredRules로 변환한다 | P0 |
| FR-TEE-7 | 수집 데이터 + StructuredRules로 LLM이 최종 판정한다 (verdict + score + rationale) | P0 |
| FR-TEE-8 | AttestationPayload를 Borsh로 직렬화해 Keccak256 해시 생성 | P0 |
| FR-TEE-9 | TEE 키로 해시에 서명하고 Attestation Report와 함께 반환 | P0 |
| FR-TEE-10 | 원본 Persona는 심사 후 메모리에서 폐기한다 | P0 |
| FR-TEE-11 | LLM 호출 실패 시 재시도 후 최종 실패 반환 | P1 |
| FR-TEE-12 | 부분 체인 실패 시 best-effort 플래그와 함께 심사 진행 | P1 |

### 4.5 데이터 인제스트

| ID | 요구사항 | 우선순위 |
| --- | --- | --- |
| FR-IN-1 | NEAR archival RPC로 지갑 tx/holding 조회 | P0 |
| FR-IN-2 | Ethereum, Base, Arbitrum, Optimism, Polygon, BSC 6개 체인 지원 | P0 |
| FR-IN-3 | 각 체인에서 native balance, nonce, first_seen_block, 주요 ERC20 holding 수집 | P0 |
| FR-IN-4 | 체인별 rate limit 준수 (exponential backoff) | P1 |
| FR-IN-5 | 한 체인 실패가 전체 심사를 막지 않는다 | P1 |
| FR-IN-6 | GitHub API로 계정의 최근 1년 contribution 통계 수집 | P1 |

---

## 5. 비기능 요구사항 (NFR)

### 5.1 보안

#### 프라이버시 모델 (핵심 설계 원칙)

**재단은 투자자의 원본 데이터를 절대 보지 못한다. 이것은 버그가 아니라 기능이다.**

재단이 온체인 또는 대시보드에서 접근 가능한 정보:
- ✅ `AttestationPayload.subject` (투자자 NEAR account — contribute 호출자)
- ✅ `AttestationPayload.verdict` (Eligible / Ineligible)
- ✅ `AttestationPayload.score` (0..=10000)
- ✅ `AttestationPayload.evidence_summary`:
  - `wallet_count_near`, `wallet_count_evm` (정수, 지갑 개수)
  - `avg_holding_days` (평균값)
  - `total_dao_votes` (합계)
  - `github_included` (bool)
  - `rationale` (≤280자, LLM이 생성한 PII 마스킹 요약)

재단이 **절대** 접근 불가능한 정보:
- ❌ 투자자가 제출한 개별 NEAR/EVM 지갑 주소
- ❌ 지갑별 잔액, 거래 이력
- ❌ `self_intro` 원문
- ❌ GitHub login, email, 저장소 목록
- ❌ LLM이 내부적으로 본 전체 signal (anon_summary)

**이 모델의 결과**: 재단은 "AI가 내 기준을 이해했다"를 신뢰하는 대가로 원본 데이터 접근권을 포기한다. 이는 Legion/Echo/Buidlpad 대비 근본 차별점이다 — 재단 주권을 "기준 정의"에만 국한시키고 "데이터 접근"은 포기시킴으로써 투자자 프라이버시를 하드웨어 루트로 보장.

**구현에 주는 영향**:
- 재단 대시보드(UI, 이번 루프 OUT of scope)는 evidence_summary만 렌더링. 지갑 목록 UI 금지.
- Policy Registry 컨트랙트는 Persona 데이터를 저장/전달할 수 있는 메서드를 노출하지 않는다.
- `AttestationPayload`는 개인 식별 데이터를 담지 않도록 스키마가 설계되어 있다 (ERD §3.6 EvidenceSummary).
- `evidence_summary.rationale`은 `tee-04-llm-judge`의 PII 필터(정규식 + self_intro 부분 문자열 차단)를 통과해야만 서명된다.

- **NFR-SEC-1**: 투자자의 self_intro, github_oauth_token, 지갑 원본 서명은 **연합 TEE 경계(federated TEE)** 밖으로 유출되지 않는다.
  - 연합 TEE 경계 = (우리 CVM + NEAR AI Cloud CVM). LLM 호출 시 NEAR AI Cloud의 `/v1/attestation/report`로 상대 CVM을 원격 증명한 후에만 self_intro 등 민감 데이터 전송 허용.
  - 연합 TEE를 원하지 않는 로드맵 옵션: 로컬 CVM에 임베디드 LLM 탑재 → 완전 단일 TEE 경계 (PRD §10 Beta 참조)
- **NFR-SEC-2**: TEE 키는 TEE 인스턴스 내부에서만 생성되거나, 외부 주입 시 attestation으로 증명된 채널로만 주입된다. **MVP debt**: 현재 MVP는 env injection(`tee-06` 모드 A) — NFR-SEC-2를 완전히 충족하지 않음. 로드맵에서 CVM 내부 생성(모드 B)으로 전환.
- **NFR-SEC-3**: 컨트랙트는 재진입 공격에 안전하다 (payable 메서드에서 cross-contract call 후 state 변경 금지)
- **NFR-SEC-4**: Attestation replay 불가 (nonce + subject + policy_id 조합으로 중복 사용 방지)
- **NFR-SEC-5**: payload canonicalization은 Borsh 단일 포맷으로 고정 (serializer ambiguity 제거)

### 5.2 성능
- **NFR-PERF-1**: 한 건의 심사는 ≤ 30초 안에 완료 (데모용)
- **NFR-PERF-2**: contribute() 호출은 1 NEAR 블록 (~1초) 안에 처리
- **NFR-PERF-3**: EVM 멀티체인 수집은 병렬 처리 (6 체인 동시)

### 5.3 가용성
- **NFR-AVAIL-1**: 개별 체인 RPC 실패가 전체 심사를 중단시키지 않는다 (graceful degradation)
- **NFR-AVAIL-2**: TEE 재시작 후 in-flight 심사는 실패로 처리하고 클라이언트가 재시도

### 5.4 관측성
- **NFR-OBS-1**: 컨트랙트는 모든 state 전이에 대해 이벤트를 발행한다
- **NFR-OBS-2**: TEE는 요청별 구조화 로그를 남긴다 (개인정보 마스킹)

### 5.5 테스트 가능성
- **NFR-TEST-1**: 각 컨트랙트는 unit test + workspaces-tests integration test를 갖춘다
- **NFR-TEST-2**: TEE 추론은 mock LLM + mock RPC로 CI 재현 가능해야 한다
- **NFR-TEST-3**: End-to-end 테스트 스크립트로 `register_policy → persona 제출 → 심사 → contribute → settle → claim` 전 구간을 검증

---

## 6. 성공 지표

### 6.1 데모 성공 (1차 목표)
- [ ] NEAR testnet에서 재단 계정이 Policy 등록 성공
- [ ] 투자자 계정이 페르소나 제출 후 Attestation 수령
- [ ] Contribution → Settlement → Claim 전 구간 성공
- [ ] 전체 흐름을 데모 영상 1개로 녹화 가능

### 6.2 기술 지표
- 심사 한 건 평균 응답 시간 ≤ 30초
- EVM 멀티체인 수집 6/6 체인에서 데이터 반환
- Attestation 서명 검증 실패율 0%
- 컨트랙트 테스트 커버리지 ≥ 80%

### 6.3 기획 지표 (이 루프의 종료 조건)
- PRD, ERD, tasks/ 전부 `STATE.md`의 Quality Gate 통과
- 제3자 리뷰(최소 2회)에서 blocker 0건

---

## 7. 리스크 및 완화

| 리스크 | 영향 | 가능성 | 완화 |
| --- | --- | --- | --- |
| NEAR AI Cloud TEE의 서명/Report 포맷이 예상과 다름 | H | M | `tee-02` 태스크에서 공식 문서 리서치 선행 |
| EVM RPC 요금/레이트리밋으로 데모 중 실패 | M | M | public RPC + fallback, best-effort 정책 |
| LLM 비결정성으로 같은 페르소나에 다른 판정 | M | M | 온도 0, deterministic sampling, rationale 로그 |
| payload canonicalization mismatch (TEE ↔ 컨트랙트) | H | L | 공유 crate(`tee/shared`)로 단일 소스 | 
| Settlement 매칭 알고리즘 미정 → 구현 블록 | M | M | `contract-03` 쪼갤 때 pro-rata 기본값 문서화 |
| Attestation 키 신뢰 체인 미정 | H | M | MVP는 owner 수동 등록, 로드맵에 하드웨어 루트 |
| 데모 시점에 NEAR testnet 지연/장애 | H | L | sandbox 환경 백업 |

---

## 8. 범위 밖 (Out of Scope)

- 프론트엔드 (디자인 진행 중, 가장 마지막 작업)
- ZK 증명 생성/검증
- NEAR Private Shard
- 소셜(Twitter 등) 데이터
- 다국어 Policy
- 메인넷 배포
- 재단 DAO 거버넌스 기반 whitelist
- Policy 수정 기능 (MVP는 불변)
- Vesting 스케줄 (MVP는 즉시 claim)
- 다중 payment token 지원 (MVP는 단일)

---

## 9. 의존성

- **외부**:
  - NEAR Protocol testnet
  - NEAR AI Cloud TEE (런타임 + 서명 인프라)
  - EVM public RPC endpoints (or Alchemy/Infura API keys)
  - GitHub OAuth (선택적)
  - IPFS (Pinata 또는 web3.storage)

- **내부**:
  - Rust 1.7x 이상
  - wasm32-unknown-unknown 타겟
  - `near-sdk` (버전은 `infra-01`에서 확정)
  - `tee/shared` crate (스키마 공유)

---

## 10. 릴리즈 계획 (MVP → Beta)

### MVP (이 루프의 목표)
- 모든 §4 P0 기능
- testnet 데모 영상 녹화 가능 상태

### Beta (이 루프 밖)
- 프론트엔드 탑재
- Attestation 재사용 (여러 IDO)
- Policy 수정 기능
- Vesting 지원
- 하드웨어 루트 attestation 검증

### v1.0 (이 루프 밖)
- 메인넷 배포
- 타 런치패드 통합 (B2B)
- DAO 거버넌스 기반 재단 등록

---

## 11. 용어집

| 용어 | 정의 |
| --- | --- |
| **Persona** | 투자자가 TEE에 제출하는 데이터 묶음: 지갑 목록(NEAR+EVM) + 자기소개 + GitHub |
| **Policy** | 재단이 자연어로 등록한 선별 기준 + IDO 세일 조건. 온체인 기록 |
| **StructuredRules** | LLM이 natural_language Policy를 변환한 정형 규칙 (심사 중간 산출물) |
| **AttestationBundle** | TEE가 발급한 서명된 심사 결과 (payload + signature + TEE report) |
| **TEE Report** | 하드웨어 루트 증명. Attestation이 실제로 TEE 안에서 생성되었음을 증명 |
| **Phase** | IDO의 큰 타임라인 상태 (Upcoming / Subscribing / Live / Closed) |
| **Status** | Phase 내 세부 상태 (Subscription / Review / Contribution / Settlement / Refund / Claim) |
| **Contribution** | 투자자가 에스크로에 자금을 예치하는 행위 또는 그 결과 엔티티 |
| **ContributionOutcome** | settlement 결과 상태. `NotSettled` → `FullMatch` / `PartialMatch` / `NoMatch` 중 하나로 확정 |
| **Settlement** | 총 수요/공급 매칭. 각 Contribution의 outcome 확정 |

---

**PRD는 이 루프의 기준점 중 하나다.** 모든 태스크는 §4 FR 또는 §5 NFR을 참조해야 하며, 참조되지 않는 태스크는 삭제되거나 FR/NFR이 추가되어야 한다.
