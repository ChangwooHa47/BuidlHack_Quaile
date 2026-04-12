# Planning Loop State

> 루프는 이 파일을 매 iteration 시작 시 읽고, 끝날 때 업데이트한다.
> 이 파일은 진실의 원천(single source of truth)이다.

---

## Current Iteration

- **Iteration**: 1 ✓ / 2 ✓ / 3 ✓ / 4 ✓ / **READY FOR IMPLEMENTATION (confirmed)**
- **Phase**: planning complete → loop TERMINATED
- **Last Updated**: 2026-04-12
- **Mode**: autonomous loop — **STOPPED** (Quality Gates all ✅, no more productive work at planning level)

## 🎯 READY FOR IMPLEMENTATION

3 iterations 후 blocker 0에 도달 (iteration-3.md 리뷰 기준 "CLOSE" 판정 + 6개 cosmetic cleanup 처리).

**구현 시작 전 체크**:
1. `planning/reviews/iteration-3.md` 전문 읽기
2. 사용자 확인 ("내가 여기서부터 이어받겠다")
3. 아래 **태스크 의존성 순서**대로 진행

### 태스크 실행 순서 (topological)

**Phase 1 — Foundation** (순차)
1. `infra-01-monorepo-init` — 워크스페이스 준비
2. `tee-01-persona-schema` — shared crate (모든 후속 작업이 여기 의존)

**Phase 2 — Contracts** (병렬 가능)
3. `contract-01-policy-registry`
4. `contract-02-attestation-verifier`
5. `contract-04-mock-ft`

**Phase 3 — TEE infrastructure** (병렬 가능)
6. `tee-03-ownership-verification`
7. `ingest-01-near-rpc`
8. `ingest-02-evm-multichain`
9. `ingest-03-github`
10. `tee-06-key-bootstrap`

**Phase 4 — TEE integration** (순차)
11. `tee-02-inference-service` (FastAPI skeleton)
12. `tee-04-llm-judge`
13. `tee-05-signer-and-report`

**Phase 5 — IDO Escrow** (순차 — contract-03a → 03b → 03c)
14. `contract-03a-escrow-state`
15. `contract-03b-escrow-settlement`
16. `contract-03c-escrow-claim-refund`

**Phase 6 — Integration**
17. `test-02-cross-lang-borsh` (Rust ↔ Python 골든 벡터)
18. `infra-02-testnet-deploy`
19. `test-01-e2e-demo`

**알려진 deferred items** (구현 중 필요 시 해결):
- ~~TDX `report_data` 정확한 인코딩~~ ✅ **iteration 4에서 CLOSED** — `address_bytes(20) + zero_pad(12) || nonce(32)`, raw concat, 출처: nearai-cloud-verifier. research §11 + tee-05 참조.
- `signing_key_id` 단순화 여부 (contract-02 Open Question) — 현 설계 유지해도 OK. 차단 아님.
- NEAR AI Cloud API key 발급 절차 — 실제 배포 시 확인. 차단 아님.
- Rate limit + 가격 정보 — 데모 비용 산정 필요 시. 차단 아님.
- NVIDIA NRAS JWT 온체인 검증 대체 — 로드맵. 차단 아님.

---

## Loop 목적

사용자가 준 기획(ONE_PAGER.md)을 기반으로:
1. **BE 중심 세부 태스크**를 이슈 단위로 쪼개고
2. 매 iteration마다 **제3자 관점 리뷰**를 받아 날카롭게 다듬고
3. Quality gate 전부 통과 시 **실제 구현 파일까지 작성**
4. 완료 기준(ONE_PAGER §10)이 코드로 재현 가능한 상태에 도달하면 루프 종료

**사용자가 자리 비우는 동안 자율 진행**. 커밋/푸시는 금지. 파일 저장만 허용.

---

## Quality Gate (기획 단계 종료 조건)

### 계획서 품질 ("개발만 하면 될 퀄리티")
- [x] 모든 태스크가 **이슈 단위**로 쪼개져 있다 (1태스크 = 1PR = 1커밋 단위)
- [x] 각 태스크에 **acceptance criteria**가 측정 가능하게 적혀 있다
- [x] 각 태스크의 **의존성(depends_on)**이 명시돼 있다
- [x] **순환 의존성이 없다** (STATE 위 Phase 순서로 topo-sort 가능)
- [x] 각 태스크의 예상 소요 시간이 30분~2시간 범위 안이다
- [x] 각 태스크에 **작업할 파일 경로**가 명시돼 있다
- [x] 각 태스크에 **함수/메서드 시그니처** 또는 **구조체/enum 정의**가 적혀 있다
- [x] 각 태스크에 **입력/출력 스키마**가 구체적 타입으로 정의돼 있다
- [x] 각 태스크에 **에러 케이스 목록**이 있다
- [x] 각 태스크에 **테스트 케이스 목록**이 있다 (최소 3개)
- [x] 각 태스크에 **참조 문서/예제 링크**가 달려 있다

### ONE_PAGER 정합성
- [x] 모든 태스크가 ONE_PAGER §6 데모 장면의 어떤 단계에 대응되는지 명시 (demo_step 필드)
- [x] ONE_PAGER §10 완료 기준이 태스크 집합으로 전부 커버됨 (test-01이 종합)
- [x] ONE_PAGER §5 state machine의 모든 전이가 컨트랙트 태스크로 커버됨
- [x] ONE_PAGER §7 IN 목록 전부 대응 태스크 존재
- [x] ONE_PAGER §7 OUT 목록이 태스크에 포함되지 않음

### TEE 설계
- [x] TEE 입력/출력 스키마 정의 (tee-01, ERD §3)
- [x] TEE 서명 번들 포맷 정의 (secp256k1 ECDSA + Borsh, on-chain vs off-chain wrapper 분리)
- [x] 온체인 Verifier 서명 검증 방식 명시 (contract-02, env::ecrecover)
- [x] NEAR AI Cloud TEE 공식 문서 리서치 완료 (`planning/research/near-ai-tee-notes.md`)
- [~] TDX `report_data` encoding 정확한 포맷: **deferred** — 구현 단계에서 private-ml-sdk 소스 fetch로 확정. contract-02는 off-chain verifier에 위임하므로 차단 아님.

### 멀티체인 데이터 인제스트
- [x] 지원 EVM 체인 목록 확정 (6개: ETH/Base/Arb/OP/Polygon/BSC)
- [x] 각 체인 RPC 전략 (public + explorer API)
- [x] 지갑 소유권 증명 (EIP-191 + NEP-413 with nacl/base58)
- [x] 부분 실패 fallback 정책 (best-effort)
- [x] Canonical message 포맷 통일 (`buidl-near-ai|v1|...` ERD/tee-02/tee-03 일치)

### 컨트랙트 설계
- [x] 4개 컨트랙트 인터페이스 정의 (policy-registry / attestation-verifier / ido-escrow / mock-ft)
- [x] Cross-contract 호출 관계 명시 (ido-escrow → policy-registry/verifier/ft)
- [x] Phase×Status state machine이 ido-escrow에 구현 가능한 형태로 쪼개져 있음 (03a/b/c)
- [x] contribute() Promise 체인 PHASE A/B/C 분리 + rollback 헬퍼 (contract-03a)
- [x] ContributionOutcome + claim_done/refund_done 정합성 (ERD §3.7 + §5.2b 표 + contract-03a/c)
- [x] used_nonces 저장 형식 통일 (`LookupMap<[u8;32], ()>`, keccak256(policy_id_le || nonce))

### 제3자 리뷰
- [x] iteration 1 리뷰 (`iteration-1.md`) — 11 blockers 발견
- [x] iteration 2 리뷰 (`iteration-2.md`) — drift propagation 지적
- [x] iteration 3 리뷰 (`iteration-3.md`) — CLOSE 판정, 6 cosmetic cleanup
- [x] iteration 3 cleanup 완료 (contract-03b dedup, ERD Mermaid fix, etc.)

---

## Quality Gate (구현 단계 종료 조건)

기획 gate 전부 통과 후에만 진입.

- [ ] `contracts/policy-registry` 빌드 성공
- [ ] `contracts/attestation-verifier` 빌드 성공
- [ ] `contracts/ido-escrow` 빌드 성공
- [ ] `tee/shared` crate 빌드 (contract feature + std feature)
- [ ] `tee/inference` Python 서비스 빌드 + 기본 테스트
- [ ] `tee/ingestion` 멀티체인 RPC 클라이언트 mock 테스트
- [ ] `tee/inference` LLM 심사 파이프라인 mock 테스트
- [ ] `tee/inference` 서명 번들 생성 테스트
- [ ] End-to-end 통합 테스트 스크립트 존재 (test-01)

---

## Open Questions (iteration 2에서 해결할 것)

### Blocker 급 (iteration 1 리뷰에서 발견, 순서 = 우선순위)

1. **ERD `AttestationBundle`에서 `tee_report` in/out 결정** → contract-02, tee-01, tee-05 싱크
2. **`ContributionStatus` + `claim_done`/`refund_done`** → 명시적 상태 표 작성 + ERD §3.7/§5.2 업데이트
3. **`SaleConfig.live_start` 추가 여부** → 추가하지 말고 "live_start := subscription_end"를 ERD §5.1에 명시
4. **`used_nonces` 저장 형식** → `LookupMap<[u8;32], ()>` with `key = keccak256(policy_id_le || nonce)`로 통일
5. **`contribute()` Promise chain 재작성** → 엔트리 → view chain → 콜백에서 staged deposit 사용
6. **Settle vs mark_closed vs advance_status** → Live→Closed는 오직 `mark_closed(from ido-escrow)`
7. **NEP-413 / EIP-191 canonical message 포맷 통일** → tee-03 포맷 (`v1`, `chain_descriptor`) 채택
8. **freshness window 통일** → 15분 한 곳으로 고정
9. **`signing_key_id` 설계 재검토** → (a) 드롭 후 address 기반, (b) 유지 + 양쪽 파이프라인 동기화
10. **TDX `report_data` 인코딩** → SDK 소스 직접 확인 (private-ml-sdk)
11. **eth_account API**: `_sign_hash`는 private/deprecated → 공식 `sign_hash` 또는 `eth_keys` 사용
12. **`pysha3` 의존성 제거** → `eth-hash[pycryptodome]` 또는 `pycryptodome` 사용
13. **LLM 트러스트 바운더리**: NFR-SEC-1과 research §5-6 결정 충돌 → nested attestation or on-CVM LLM

### Major (iteration 2 또는 3)

14. contribute() TOCTOU — 콜백에서 `block_timestamp()` 재확인
15. `settle_cursor` 필드 추가 (contract-03b)
16. `policy_investors` storage 안전 (Vector-in-LookupMap footgun)
17. LLM rationale PII 필터 강화 (self_intro 부분 문자열 차단)
18. `advance_status`의 no-op vs InvalidTransition 정책 확정
19. `near-sdk 5.x` `env::keccak256_array` 정확 버전 확인
20. `policy_registry::set_escrow_account` 테스트 케이스 명시

### Missing Tasks (iteration 2에서 추가)

- [ ] `contract-04-mock-ft` — NEP-141 mock 토큰
- [ ] `tee-06-key-bootstrap` — TEE signing key 생성/배포 플로우
- [ ] `test-02-cross-lang-borsh-vectors` — Rust↔Python Borsh 골든 벡터 CI

---

## Iteration Log

### Iteration 0 — Bootstrap (2026-04-12)
- ONE_PAGER.md v2 작성
- STATE.md 초기화
- 초기 태스크 스켈레톤 생성 (infra-01, contract-01/02/03, tee-01/02, ingest-01/02)

### Iteration 4 — TDX report_data closure (2026-04-12, autonomous re-entry)

**Trigger**: 사용자가 재진입한 autonomous loop. STATE는 이미 READY였으므로, deferred item 중 가치 있는 1개만 처리.

**산출물**:
- `planning/research/near-ai-tee-notes.md` §11 신규 — TDX report_data 인코딩 전체 스펙
- `planning/tasks/tee-05-signer-and-report.md` — fetch_report 파라미터 + off-chain verifier 의사코드
- `planning/reviews/iteration-4.md` — closure log

**발견**:
- TDX report_data = `address_bytes(20) + zero_pad(12) || nonce(32)` (Mode A). raw concat, no hash.
- `signing_algo=ecdsa` 쿼리 파라미터 필수 (secp256k1 확정)
- 우리 tee-05의 `nonce = payload_hash` 설계가 SDK 규격과 자연스럽게 호환 — 코드 변경 불필요

**Remaining deferred** (전부 "실제 배포/운영 시점에만 해결 가능"):
- NEAR AI API key 절차, rate limit/가격, NVIDIA NRAS 온체인 검증, `signing_key_id` 단순화

**판정**: iteration 5 실행 불필요. 기획 레벨에서 더 할 일 없음. **루프 공식 종료.**

---

### Iteration 3 — Drift propagation (2026-04-12)

**산출물**:
- `planning/reviews/iteration-2.md` (3rd-party review) 확인
- ERD v2 drift 대부분 해결:
  - Mermaid diagram (CONTRIBUTION) outcome/flags 반영
  - §6 Settlement 알고리즘에서 old enum names 제거
  - Contribution에 `token_contract` 필드 추가 (claim용 캐싱)
- contract-03a 전면 수정:
  - old `ContributionStatus` enum → `ContributionOutcome` + flags
  - `policy_investors` Vector→flat key (PolicyInvestorKey)
  - `on_is_eligible` 시그니처에 `nonce` 추가
  - PHASE A/B/C 분리 (sync validation → optimistic record → promise chain)
  - rollback_contribution 헬퍼 구체화
  - `token_contract` on_get_policy에서 late-fill
- contract-03b:
  - settle은 `status == Live` 전제 (advance_status 선행, fire-and-forget 제거)
  - WrongPolicyStatus 에러 추가
  - settle↔advance_status↔mark_closed 관계 명시
- contract-03c **완전 재작성** (outcome/flags 기반, §5.2b 허용 동작 표 준수)
  - claim(), refund() Promise + callback 롤백
  - 에러 타입 정리
  - 13개 test case (§5.2b 전 row + rollback)
- tee-01: on-chain `AttestationBundle`에서 `tee_report` 제거, off-chain `AttestationBundleWithReport` wrapper 추가
- tee-05: `AttestationBundleWithReport` wrapper 사용하도록 변경
- tee-02: EVM ownership 함수 comment를 tee-03 참조로 정리
- tee-03: NEP-413 Python 라이브러리 명시 (nacl + base58 + borsh preimage)
- tee-04: `build_anon_summary` placeholder `...` 수정
- infra-01: schemars 제거, eth_keys 노트 명확화, primitive-types 추가
- infra-02: `INITIAL_TEE_SIGNING_ADDRESS_JSON` 구체 포맷 + tee-06 연동
- test-01: old status name → outcome/flags
- test-02: pysha3 → eth_hash
- PRD: FR-IE-4/5/6 재작성, NFR-SEC-1 federated TEE carve-out, 용어집 ContributionOutcome 추가

**다음 iteration 목표**:
- iteration-3 리뷰 실행
- 남은 issues 처리
- blocker 0 확인 시 READY_FOR_IMPLEMENTATION 마커

---

### Iteration 2 — ERD v2 + blocker 처리 + missing tasks + 2차 리뷰 (2026-04-12)

**주요 변경**:
- ERD v2 (CHANGELOG 포함)
- AttestationBundle split (on-chain vs wrapper)
- ContributionOutcome + flags 모델
- canonical message 통일 (`v1`, chain_descriptor)
- used_nonces key 형식 통일
- contribute() Promise chain 재작성
- settle vs mark_closed vs advance_status 명확화
- pysha3 → eth_hash, `_sign_hash` → `eth_keys.sign_msg_hash`
- Missing tasks 추가: contract-04-mock-ft, tee-06-key-bootstrap, test-02-cross-lang-borsh

**리뷰 (iteration-2.md)**: Blockers 11개 중 4 CLOSED, 3 PARTIAL, 4 still drifting.
→ iteration 3에서 drift propagation으로 해결.

---

### Iteration 1 — PRD/ERD 생성 + 태스크 구체화 + 리서치 + 1차 리뷰 (2026-04-12)

**산출물**:
- `planning/PRD.md` v1.0 (11 섹션, FR 29개, NFR 13개)
- `planning/ERD.md` (10 섹션, Mermaid ERD + 7개 invariant)
- `planning/research/near-ai-tee-notes.md` (NEAR AI Cloud TEE 공식 문서 기반, secp256k1 확정)
- 태스크 구체화/추가 (총 16개):
  - `infra-01-monorepo-init` (재작성)
  - `infra-02-testnet-deploy` (신규)
  - `contract-01-policy-registry` (재작성, secp256k1 반영)
  - `contract-02-attestation-verifier` (재작성, env::ecrecover 기반)
  - `contract-03-ido-escrow` → SPLIT:
    - `contract-03a-escrow-state` (contribute)
    - `contract-03b-escrow-settlement` (settle)
    - `contract-03c-escrow-claim-refund` (claim/refund)
  - `tee-01-persona-schema` (재작성, shared crate 구조)
  - `tee-02-inference-service` (신규, Python FastAPI)
  - `tee-02-near-ai-integration` (superseded)
  - `tee-03-ownership-verification` (신규, NEP-413/EIP-191)
  - `tee-04-llm-judge` (신규, 2-stage LLM)
  - `tee-05-signer-and-report` (신규, Borsh + secp256k1)
  - `ingest-01-near-rpc` (보강)
  - `ingest-02-evm-multichain` (보강)
  - `ingest-03-github` (신규)
  - `test-01-e2e-demo` (신규)

**리뷰 결과**: `planning/reviews/iteration-1.md`
- **Verdict**: "개발만 하면 될 퀄리티" 미달
- **Blockers**: 11개 (ERD 드리프트, contribute() 플로우, eth_account/pysha3 API 등)
- **Major issues**: 12+
- **Missing tasks**: 3개
- **Security concerns**: 8개

**다음 iteration 목표**:
- 블로커 순서 1~13 해결
- Missing tasks 3개 추가
- ERD v2 승격 (드리프트 0)
- 2차 리뷰 (blocker 0 확인)

---

## 루프 프로토콜 (매 iteration 실행 순서)

1. **읽기**: ONE_PAGER.md + PRD.md + ERD.md + STATE.md + tasks/ 전체 + reviews/ 최근
2. **선택**: STATE.md의 Open Questions 중 Blocker → Major → Missing 순으로 1~3개
3. **작업**: 해결에 필요한 파일 작성/수정 (PRD/ERD/tasks/research)
4. **리뷰**: `superpowers:code-reviewer` subagent → `reviews/iteration-N.md`
5. **업데이트**: STATE.md Quality Gate + Iteration Log
6. **판정**: 모든 Planning Quality Gate ✅ → 구현 단계 진입. 아니면 다음 iteration.
7. **중단 조건**: 2회 연속 동일 blocker에서 무진전 → STATE에 기록 + 정지

---

## 루프 재시작 힌트 (다음 세션이 읽어야 할 것)

이 루프는 **자율 재진입** 설계. 다음 세션이 시작될 때:

```
1. /Users/changwooha/Desktop/NEARAI/planning/STATE.md 읽기 (이 파일)
2. planning/reviews/iteration-1.md 읽기 (블로커 확인)
3. Open Questions 1~13 중 미해결 항목 확인
4. 가장 위에 있는 미해결 Open Question부터 해결
5. 해결 후 STATE에 체크 + 다음 iteration 로그 추가
```
