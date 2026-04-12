# Planning — Buidl-NEAR AI

> 이 폴더는 자율 루프(3 iterations)를 거쳐 생성된 기획 산출물입니다.
> 사용자가 자리 비운 동안 작업했고, **구현 시작 준비 완료** 상태입니다.

## 먼저 읽을 것 (추천 순서)

1. **[ONE_PAGER.md](./ONE_PAGER.md)** — 프로젝트 개요, 데모 장면, IN/OUT 범위
2. **[PRD.md](./PRD.md)** — 기능 요구사항(FR) 29개 + 비기능(NFR) 13개
3. **[ERD.md](./ERD.md)** — 온체인/오프체인 엔티티 + 데이터 모델 (v2)
4. **[STATE.md](./STATE.md)** — 현재 상태 + 태스크 실행 순서 (Phase 1~6)
5. **[research/near-ai-tee-notes.md](./research/near-ai-tee-notes.md)** — NEAR AI Cloud TEE 리서치 노트
6. **[tasks/](./tasks/)** — 19개 이슈 단위 태스크 (개발만 하면 될 퀄리티)
7. **[reviews/iteration-3.md](./reviews/iteration-3.md)** — 최종 제3자 리뷰 (CLOSE 판정)

## 핵심 결정 요약

| 주제 | 결정 |
| --- | --- |
| **서명 알고리즘** | secp256k1 ECDSA (NEAR AI Cloud 호환) — `env::ecrecover` |
| **Canonicalization** | Borsh (Rust SSOT, Python 수동 구현 + 골든 벡터 CI) |
| **Payload hash** | keccak256(Borsh(payload)) |
| **Phase × Status** | 온체인 Phase 4개, Status는 오프체인 UI 라벨 |
| **Settlement** | pro-rata with cap, settle_cursor 기반 배치, mark_closed로 Live→Closed |
| **Contribution 상태** | `ContributionOutcome` enum + `claim_done`/`refund_done` 플래그 |
| **지원 EVM 체인** | Ethereum, Base, Arbitrum, Optimism, Polygon, BSC (6개) |
| **Persona** | 지갑(NEAR + EVM) + 자기소개 + GitHub OAuth |
| **TEE 추론** | Python FastAPI in CVM + NEAR AI Cloud OpenAI 호환 API |
| **LLM 트러스트 경계** | NEAR AI Cloud = federated TEE (remote attestation 필수) |
| **TEE 서명 키** | MVP: env 주입 (tee-06 모드 A), 로드맵: CVM 내부 생성 |

## 태스크 목록 (19개)

### Infrastructure (2)
- `infra-01-monorepo-init` — Cargo workspace + Python pyproject
- `infra-02-testnet-deploy` — NEAR testnet 자동 배포

### Smart Contracts (5)
- `contract-01-policy-registry` — 재단 Policy 등록 + 상태 전이
- `contract-02-attestation-verifier` — secp256k1 서명 검증 + 키 로테이션
- `contract-03a-escrow-state` — contribute() Promise chain (PHASE A/B/C)
- `contract-03b-escrow-settlement` — pro-rata 매칭 + mark_closed
- `contract-03c-escrow-claim-refund` — outcome/flags 기반 claim/refund
- `contract-04-mock-ft` — 데모용 NEP-141 토큰

### TEE Service (6)
- `tee-01-persona-schema` — shared crate (Rust SSOT, on-chain/off-chain split)
- `tee-02-inference-service` — Python FastAPI 엔트리
- `tee-03-ownership-verification` — NEP-413 + EIP-191 (nacl + eth_keys)
- `tee-04-llm-judge` — 2-stage LLM (structurize + judge)
- `tee-05-signer-and-report` — Borsh 직렬화 + secp256k1 서명 + TDX report
- `tee-06-key-bootstrap` — TEE signer 키 생성 + 등록 플로우

### Data Ingestion (3)
- `ingest-01-near-rpc` — NEAR archival RPC + NearBlocks API
- `ingest-02-evm-multichain` — 6개 EVM 체인 병렬 수집
- `ingest-03-github` — GitHub GraphQL API (해시 마스킹)

### Testing (2)
- `test-01-e2e-demo` — testnet end-to-end 시나리오 (데모 영상용)
- `test-02-cross-lang-borsh` — Rust↔Python 골든 벡터 CI

## 루프 로그 요약

| Iteration | 산출물 | 리뷰 결과 |
| --- | --- | --- |
| 0 | ONE_PAGER v2, 초기 태스크 스켈레톤 | — |
| 1 | PRD, ERD v1, 16 tasks, NEAR AI 리서치 | 11 blockers, 12+ major |
| 2 | ERD v2 (AttestationBundle split, outcome/flags, Promise rewrite), 3 missing tasks 추가 | 4 CLOSED, 3 PARTIAL, drift propagation 필요 |
| 3 | drift propagation (19 items), Mermaid fix, dead code 제거 | **CLOSE 판정** + 6 cosmetic cleanup 완료 |
| 4 | TDX `report_data` 인코딩 SDK 소스로 확정 (research §11 신규, tee-05 fetch_report 구체화) | deferred #1 ✅ CLOSED, 루프 공식 종료 |

## 알려진 Deferred 항목 (구현 중 처리)

- ~~**TDX `report_data` 정확한 인코딩**~~: ✅ **iteration 4에서 CLOSED**. `address_bytes(20) + zero_pad(12) || nonce(32)` (Mode A). 출처: nearai-cloud-verifier. 상세는 `research/near-ai-tee-notes.md` §11, `tasks/tee-05-signer-and-report.md`.
- **`signing_key_id` 단순화**: 현재 설계 유지해도 OK. 추후 리팩터링.
- **NEAR AI Cloud API key 발급 절차**: 실제 배포 시 확인.
- **전체 보안 감사**: 구현 완료 후 별도 iteration.

## 다음 단계 (사용자 액션)

1. 이 README + STATE.md + ONE_PAGER.md를 읽어 전체 그림 확인
2. `planning/reviews/iteration-3.md` 확인 — 남은 cosmetic items 확인
3. 만족스러우면:
   - Dev Agent에게 Phase 1 태스크부터 시작하라고 지시
   - 또는 직접 `infra-01-monorepo-init.md`부터 구현 시작
4. 추가 수정이 필요하면:
   - STATE.md의 Open Questions 섹션 확인
   - 해당 태스크 파일 열어 수정
   - 재실행 시 이 README의 순서대로 돌아오면 됨

---

*이 폴더는 `file saves only` 모드로 생성되었고, 어떤 git 커밋/푸시도 수행되지 않았습니다.*
*모든 변경은 `/Users/changwooha/Desktop/NEARAI/planning/` 하위에만 존재합니다.*
