# Buidl-NEAR AI — MVP One-Pager (v2)

> **TEE 기반 AI Attestation으로 재단이 직접 투자자를 선별하는 IDO 런치패드**

---

## 1. 문제 정의

기존 IDO 런치패드(Legion, Echo, Buidlpad 등)는 다음의 한계를 가진다:

1. **재단에게 선별 자유도가 없다** — 런치패드의 기준(스테이킹 티어 등)에 종속됨
2. **고래 독식** — 스테이킹 기반 할당은 자본력 큰 지갑이 독점
3. **이해충돌** — 런치패드는 단기 수익 프로젝트 선호, 재단은 장기 홀더 선호
4. **검증 결과가 이식 불가** — 한 플랫폼의 KYC/심사가 다른 플랫폼에서 재사용 불가

결과적으로 재단이 원하는 **"프로덕트에 기여하는 장기 보유자"** 같은 질적 기준을 반영할 방법이 없다.

---

## 2. 솔루션

**재단이 자연어로 선별 기준을 정의 → TEE 안의 AI가 투자자의 페르소나를 심사 → TEE 서명된 Attestation 발급 → 재단이 Attestation 기반으로 IDO 할당**

핵심 차별점: **TEE 심사 단계 하나.** 나머지 IDO 메커니즘(Phase/Status, Escrow, Settlement, Claim)은 업계 표준(Legion/Echo/Buidlpad) 플로우를 그대로 따른다.

- **재단 주권 (기준 정의에 국한)**: 선별 기준을 재단이 직접 자연어로 정의. 런치패드 기준에 종속 ❌
- **프라이버시 비대칭성 (핵심 설계)**: 재단조차 투자자의 원본 지갑/자기소개/GitHub를 보지 못한다. TEE가 심사 결과(verdict + score + 집계 요약)만 서명하여 노출. 재단은 "AI가 내 기준을 이해했다"를 신뢰하는 대가로 원본 접근권을 포기. 이게 기존 런치패드와의 근본 차이다.
- **검증 가능성**: 모든 Attestation에 TEE 서명 + Attestation Report 첨부. 온체인 검증 가능
- **이식성**: 한 번 발급된 Attestation은 다른 런치패드에서도 재사용 가능 (로드맵)

---

## 3. 핵심 가설

| # | 가설 | 검증 방법 |
| --- | --- | --- |
| **H1** | 재단은 자신만의 기준으로 투자자를 선별하고 싶다 | Policy Builder로 자연어 기준 등록 가능 여부 |
| **H2** | TEE 안의 AI가 페르소나(지갑+자기소개+GitHub)만으로 신뢰할 수 있는 심사를 할 수 있다 | TEE 서명된 Attestation 발급 + 온체인 서명 검증 |
| **H3** | 투자자는 개인정보 노출 없이 적격성을 증명할 수 있다 | 원본 페르소나 데이터는 TEE 외부로 나가지 않음 |

---

## 4. 페르소나 정의

투자자가 TEE에 제출하는 **Persona** = 다음 3가지 묶음:

| 구성 요소 | 내용 | 수집 방법 |
| --- | --- | --- |
| **지갑 목록** | NEAR 지갑 + EVM 지갑들 (Ethereum, Base, Arbitrum, Optimism, Polygon, BSC 등 주요 체인) | 클라이언트에서 서명으로 소유권 증명 후 TEE에 주소 전달 |
| **자기소개** | 자연어 텍스트 (경력, 관심 분야, 투자 철학 등) | 폼 입력 |
| **GitHub** | GitHub 계정 | OAuth PKCE → TEE가 직접 API 호출 |

TEE는 이 페르소나를 수집한 뒤:
- 각 지갑의 **온체인 이력** (보유 기간, 거래 패턴, DAO 투표, 토큰 홀딩 구성) 수집
- GitHub의 **기여 이력** (커밋 수, 관여한 프로젝트, 언어, 활동 기간) 수집
- 자기소개 텍스트와 함께 **재단 Policy에 따라 LLM이 판정**

> MVP에서 **지갑 데이터가 주 시그널**, 자기소개/GitHub는 보조 시그널로 사용.

---

## 5. IDO 상태 모델 (Phase × Status)

표준 IDO 런치패드(Legion/Echo/Buidlpad)의 플로우를 따르며, **TEE 심사 단계**가 `Subscribing.Review`에 삽입된다.

```
Phase:      Upcoming ──→ Subscribing ──────────────→ Live ──────────────→ Closed
                              │                         │
                         ┌────┴────┐               ┌────┴────┐
Status:  Upcoming        │Subscription             │Settlement         Closed
                         │    ↓                    │    ↓
                         │Review (← TEE 심사)      │Refund  │  Claim (병렬)
                         │    ↓
                         │Contribution
```

### 상태 정의

| Phase | Status | 의미 |
| --- | --- | --- |
| **Upcoming** | Upcoming | 재단이 Policy + IDO 조건 등록. 투자자 참여 불가 |
| **Subscribing** | Subscription | 투자자가 페르소나(지갑+자기소개+GitHub) 제출 |
| **Subscribing** | Review | TEE가 페르소나를 재단 Policy 기준으로 심사 → Attestation 발급 |
| **Subscribing** | Contribution | 적격 판정 받은 투자자가 에스크로에 자금 예치 (기여 확정) |
| **Live** | Settlement | 총 수요 vs 공급 매칭, 최종 할당 확정 |
| **Live** | Refund | 미매칭분 자금 환불 |
| **Live** | Claim | 매칭분 토큰 Claim (Refund와 병렬 가능) |
| **Closed** | Closed | 세일 종료 |

### 기본 정책 결정

- **Review = TEE 심사**: 재단의 수동 검토 ❌. TEE 안의 AI가 전담
- **Contribution = Review 통과 후**: 부적격자는 애초에 예치 불가 → 환불 플로우 최소화
- **Settlement 이후 Refund/Claim 병렬**: 초과 수요 시 일부만 매칭, 미매칭분은 환불

---

## 6. 데모 장면 (End-to-End, state machine 반영)

```
[Phase: Upcoming]
  재단: Policy Registry 컨트랙트에 자연어 Policy + IDO 조건 등록
        "장기 보유 성향이 강한 홀더 대상"
                    ↓
[Phase: Subscribing / Status: Subscription]
  투자자: 페르소나 제출
    - NEAR 지갑 + EVM 지갑들 (소유권 서명)
    - 자기소개
    - GitHub OAuth
                    ↓
[Phase: Subscribing / Status: Review]
  TEE:
    - 각 체인 RPC로 지갑 이력 수집
    - GitHub API로 기여 이력 수집
    - LLM이 Policy 기준으로 판정 (적격/부적격 + 점수)
    - TEE 서명 Attestation 번들 생성 (Attestation Report 포함)
                    ↓
[Phase: Subscribing / Status: Contribution]
  투자자: 적격 판정 시 에스크로 컨트랙트에 자금 예치
          컨트랙트가 Attestation 서명을 온체인 Verifier로 검증
                    ↓
[Phase: Live / Status: Settlement]
  총 수요/공급 매칭 → 할당 확정
                    ↓
[Phase: Live / Status: Refund] ──┬── [Phase: Live / Status: Claim]
  미매칭분 환불                  │    매칭분 토큰 Claim
                    ↓
[Phase: Closed]
```

**데모 영상으로 남길 범위**: 재단 Policy 등록 → 투자자 페르소나 제출 → TEE 심사 → Attestation → Claim. testnet 환경에서 end-to-end 시연.

**프론트엔드는 가장 마지막**. 이번 루프는 BE(컨트랙트 + TEE 통합 + 인제스트)에 집중.

---

## 7. MVP IN / OUT

### ✅ IN (이번 루프에서 완성할 것)

**온체인 레이어 (Rust + NEAR SDK)**
- [ ] `policy-registry` 컨트랙트 — 재단 Policy + IDO 조건 등록/조회
- [ ] `attestation-verifier` 컨트랙트 — TEE 서명 검증 (공개키 기반)
- [ ] `ido-escrow` 컨트랙트 — Subscription/Contribution/Settlement/Refund/Claim state machine, 에스크로, 정산

**TEE 추론 코어 (NEAR AI Cloud TEE)**
- [ ] 페르소나 수신 엔드포인트 (지갑 + 자기소개 + GitHub OAuth token)
- [ ] 데이터 인제스트: NEAR RPC + EVM RPC (멀티체인) + GitHub API
- [ ] LLM 심사 파이프라인 (Policy → 판정/점수)
- [ ] TEE 서명 Attestation 번들 생성 (Report 포함)

**데이터 인제스트**
- [ ] NEAR RPC 클라이언트 (지갑 보유/거래/DAO 투표)
- [ ] EVM RPC 멀티체인 클라이언트 (Ethereum, Base, Arbitrum, Optimism, Polygon, BSC)
- [ ] GitHub API 클라이언트 (OAuth PKCE 토큰 기반)

**인프라**
- [ ] 모노레포 세팅 (루트 = `/Users/changwooha/Desktop/NEARAI`)
- [ ] NEAR testnet 배포 스크립트
- [ ] End-to-end 통합 테스트 (재단 등록 → 투자자 심사 → Claim)

### ❌ OUT

- **프론트엔드** (디자인 중, 가장 마지막)
- ZK 증명 생성
- NEAR Private Shard
- 소셜(Twitter 등) 데이터
- 타 런치패드 호환 (Attestation 재사용)
- 메인넷 배포

---

## 8. 기술 스택

| 레이어 | 기술 |
| --- | --- |
| **스마트 컨트랙트** | Rust + NEAR SDK |
| **TEE 추론** | NEAR AI Cloud TEE (공식 문서 참조하면서 진행) |
| **데이터 소스** | NEAR RPC, EVM RPC (각 체인), GitHub API |
| **Policy 저장** | IPFS (원문) + NEAR 온체인 (CID + 해시) |
| **서명 검증** | TEE 공개키 → 온체인 `attestation-verifier` |
| **테스트 환경** | NEAR testnet + 로컬 EVM RPC 또는 퍼블릭 RPC |
| **프론트엔드** | Next.js 14 + Tailwind (**이번 루프 범위 밖**) |

---

## 9. 모노레포 구조

```
NEARAI/                              # 모노레포 루트
├── planning/                        # 이 루프의 기획 산출물
│   ├── ONE_PAGER.md                 # (이 파일)
│   ├── STATE.md                     # iteration 상태 + quality gate
│   ├── tasks/                       # 이슈 단위 태스크 파일
│   └── reviews/                     # 제3자 리뷰 로그
├── contracts/                       # Rust 스마트 컨트랙트
│   ├── policy-registry/
│   ├── attestation-verifier/
│   └── ido-escrow/
├── tee/                             # TEE 추론 코어
│   ├── ingestion/                   # 멀티체인 + GitHub 데이터 수집기
│   ├── inference/                   # LLM 심사 파이프라인
│   └── attestation/                 # 서명 번들 생성
├── scripts/                         # 배포/테스트 스크립트
└── frontend/                        # (이번 루프 범위 밖)
```

---

## 10. 완료 기준 (Definition of Done)

이 MVP가 "끝났다"고 말할 수 있으려면:

1. ✅ **재단이 자연어 Policy를 온체인에 등록**할 수 있다 (Phase: Upcoming)
2. ✅ **투자자가 페르소나(지갑들 + 자기소개 + GitHub)를 TEE에 제출**할 수 있다 (Subscription)
3. ✅ **TEE가 멀티체인 + GitHub 데이터를 수집**하고 **Policy 기준으로 LLM 심사**를 수행한다 (Review)
4. ✅ **TEE가 서명된 Attestation을 발급**하고, **온체인 Verifier가 서명을 검증**한다
5. ✅ **적격 투자자가 에스크로에 Contribution** → **Settlement** → **Claim**까지 실행할 수 있다
6. ✅ 위 [1]~[5]를 **NEAR testnet에서 end-to-end로 시연** 가능 (데모 영상용)

---

## 11. 참조

- **IDO 플로우 참조**: [Legion](https://legion.cc/), [Echo](https://echo.xyz/), [Buidlpad](https://buidlpad.com/)
- **NEAR AI Cloud TEE 공식 문서**: 루프 중 필요 시점에 참조 (TEE 연동 / Attestation Report 형식 / 서명 검증)
- **NEAR 스마트 컨트랙트 개발**: NEAR SDK (Rust) 공식 문서

---

**이 One-Pager는 루프의 기준점이다.** 모든 태스크와 구현은 §6 데모 장면과 §10 완료 기준에 부합해야 한다. 루프는 이 기준에 닿을 때까지 계획을 날카롭게 다듬고, 이후 구현 태스크를 쪼갠다.
