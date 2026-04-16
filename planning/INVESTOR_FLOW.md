# Investor Flow — Subscription → Review → Contribution → Settlement → Claim/Refund

이 문서는 투자자 관점의 페이즈/상태 진행과 FE(sidebar + identity 페이지)가 어떤 정보를 어떤 소스에서 읽어 어떤 CTA를 렌더할지를 정의한다. PRD §F / ERD §5 / ONE_PAGER §5의 추상 상태 머신을 실제 화면 동작과 연결하는 레이어다.

## 1. 온체인 Phase vs 투자자 Status

- **온체인 PolicyStatus (4개)**: `Upcoming → Subscribing → Live → Closed`. 정책 전체의 큰 창구. 모두에게 동일.
- **투자자 Status (개별)**: 같은 Subscribing phase 안에서도 투자자마다 다르다. 단계:
  1. `Subscription` — persona 제출 단계
  2. `Review` — TEE 심사 진행 중
  3. `Contribution` — 심사 완료(Eligible), 공여 가능
  4. `Settlement` — Live phase 진입 후 settle() 실행 중
  5. `Claim` / `Refund` — settle 완료 후 각자의 outcome에 따라
  6. `Closed` — 완료

`Subscribing` 이 지속되는 동안 투자자는 1→2→3을 본인 페이스로 이동한다. 3 이후는 정책의 Live/Closed 전이에 따라간다.

## 2. 상태의 진실 소스 (Source of Truth)

| 정보 | 소스 | 왜 |
|---|---|---|
| PolicyStatus | `getPolicy(id).status` (policy-registry 뷰) | 온체인 확정값 |
| Contribution 여부 | `getContribution(investor, id)` (ido-escrow 뷰) | 온체인 확정값. null 이면 아직 공여 안 함 |
| Contribution outcome | 같은 contribution 레코드 | settle() 후 확정 |
| Attestation (Eligible) | `localStorage.attestation_<policyId>` | TEE가 발급한 bundle. 영속 저장해 세션 끊겨도 사용자가 나중에 Subscribe 가능. 만료는 TEE `expires_at` + 컨트랙트 `FR-AV-6`이 관리 |
| Ineligible 플래그 | `localStorage.ineligible_<policyId>` | 같은 정책에 한 번 부적격 판정을 받았는지. Submit 버튼을 영구 비활성화하는 근거 |
| Identity form 진행도 | `IdentityContext` (React state) | 메모리 스크래치. 새로고침 시 리셋 |

**원칙**: CTA 활성화 조건은 가능한 한 **온체인 상태**에서 유도한다. 온체인으로는 알 수 없는 "이 investor × policy 조합에서 attestation을 받았나 / Ineligible 확정인가"만 localStorage로 보조한다.

## 3. 투자자 쪽 FE 상태 머신

Sidebar(`SubscribingSidebar.tsx`)가 렌더할 단일 "flow" 값은 다음 규칙으로 결정한다:

```
PolicyStatus      Contribution       localStorage 상태                          flow
------------------------------------------------------------------------------------
Upcoming          —                  —                                           locked (안내만)
Subscribing       null               ineligible_<id> === true                    rejected   (재심사 불가 안내)
Subscribing       null               attestation_<id>(Eligible) 있음             contribute (Subscribe 활성)
Subscribing       null               둘 다 없음                                   identity   (Build Identity)
Subscribing       NotSettled         —                                           waiting    (before Live)
Live              NotSettled         —                                           waiting    (settlement pending)
Live              FullMatch & !claim_done                                       claim
Live              PartialMatch & !claim_done                                    claim   (→ claim 후 자동 refund 흐름)
Live              PartialMatch & !refund_done & claim_done                      refund
Live              NoMatch & !refund_done                                        refund
Live/Closed       all flags done                                                done
```

주의: Contribution 레코드가 생긴 이후 단계(waiting/claim/refund/done)에선 localStorage 값은 무시한다. 온체인이 진실의 원천.

## 4. Identity 페이지 동작

`/projects/<slug>/identity` 에서 "Submit for Review" 버튼 클릭 시:

1. PolicyStatus == Subscribing 인지 재확인. 아니면 버튼 비활성.
2. **이미 Ineligible 확정(`localStorage.ineligible_<policyId> === "true"`)이면 페이지 진입 즉시 Submit 영구 비활성화**. 위 §3의 flow 계산과 동일한 근거로 분기한다.
3. IdentityContext의 필수 항목 확인 (EVM 서명 1개 이상, self_intro 20자 이상).
4. `POST /v1/attest` 호출. 응답 `bundle.payload.verdict` ∈ {`Eligible`, `Ineligible`}.
5. verdict 에 따라 localStorage 기록 + 라우팅:
   - `Eligible` → `localStorage.setItem('attestation_' + policyId, JSON.stringify(response))` → `/projects/<slug>` 로 이동. Sidebar가 자동으로 `contribute` flow 렌더.
   - `Ineligible` → `localStorage.setItem('ineligible_' + policyId, 'true')` (attestation은 저장하지 않음) → 같은 페이지에 "Review declined — this persona does not meet the policy's criteria" 안내 + "Return to project" 링크. 자동 redirect 하지 않음.
6. TEE/네트워크 오류로 verdict 미수신 시 에러 박스만 띄우고 **localStorage는 건드리지 않는다**. 사용자는 곧바로 재시도 가능 (새 nonce 사용 → TEE의 nonce 재사용 금지에 걸리지 않음).

## 5. Sidebar가 attestation을 읽는 방식

- mount / policyId 변경 시 `getContribution`을 **먼저** 조회. 레코드 있으면 그 outcome 기준으로 flow를 고정한다 (contribute 이후 단계는 온체인이 진실).
- 레코드 없으면 (= 아직 contribute 전) localStorage를 순서대로 확인:
  1. `localStorage.getItem('ineligible_' + policyId) === 'true'` → flow = `rejected`
  2. `localStorage.getItem('attestation_' + policyId)` 파싱 성공 + `bundle.payload.subject === accountId` → flow = `contribute`
  3. 어느 쪽도 해당 없음 → flow = `identity`

위 2단계의 `subject` 검증이 §10-3의 wallet switch 감지를 처리한다. mismatch 시 해당 키를 `localStorage.removeItem`하고 flow = `identity` 로 떨어진다.

localStorage가 영속이므로 새 탭 / 재접속에서도 상태가 복원된다. attestation 유효기간은 컨트랙트가 관리 — 만료된 attestation으로 `contribute()` 하면 verifier가 reject하고, FE는 그 에러를 받으면 키를 제거하고 다시 `identity` 로 복귀시킨다 (§6 참조).

## 6. Contribute 단계의 책임

`flow === "contribute"` 일 때 Subscribe 버튼을 누르면:

1. `localStorage` 에서 attestation을 꺼낸다.
2. `bundle` + `zk_proof_json` + `zk_public_inputs_json` 을 `contribute(wallet, policyId, bundle, ...)` 에 넘긴다.
3. 성공 시 `localStorage.removeItem('attestation_' + policyId)` (재사용 방지, 다음 방문 시 contribution 레코드로부터 상태 재구성).
4. 실패 시 에러 종류에 따라 분기:
   - **만료 / verifier 거부** (FR-AV-6에서 정의한 AttestationExpired, InvalidSignature 등) → attestation 키를 제거하고 flow = `identity` 로 복귀. 사용자가 새 심사를 받도록 한다. 이 경우 `ineligible_<policyId>` 는 세우지 않는다 (부적격이 아니라 만료일 뿐).
   - **네트워크 / 지갑 / 가스 에러** → attestation 보존, 사용자가 재시도 가능.

## 7. Rejected 상태 UX

- 전용 flow = `rejected` 로 렌더. Subscribe 버튼을 비활성화하고 그 자리에 "Review declined — your persona did not meet this policy's criteria." 메시지를 고정 노출한다.
- **재심사 링크 없음**. 같은 정책에서 같은 accountId로 재심사하는 경로를 UI에서 제공하지 않는다 (§10-2 참조). 사용자가 localStorage를 직접 비우면 기술적으로 다시 제출은 가능하지만, 그건 의도적 우회이므로 FE는 막는 시늉만 한다.
- 예외: 브라우저가 바뀌거나 다른 기기로 접속하면 localStorage가 없으니 다시 심사받을 수 있다. 이건 막지 않는다 (어뷰즈는 TEE rate limit / 체인 레벨에서 추후 대응).

## 8. 브라우저 라이프사이클 요약

| 이벤트 | IdentityContext | localStorage attestation / ineligible | 온체인 contribution |
|---|---|---|---|
| 페이지 새로고침 | 유지 (브라우저 탭 동안) | 유지 | 유지 |
| 탭 닫기 → 재오픈 | 리셋 | 유지 (localStorage는 브라우저 전역) | 유지 |
| Wallet disconnect → 다른 계정 로그인 | 리셋 | subject 미스매치 감지 → attestation만 삭제. ineligible 플래그는 정책 단위라 보존 | 유지 |
| `contribute()` 성공 | 유지 | attestation **삭제**, ineligible 그대로 | 새 레코드 생성 |
| Attestation 만료로 verifier 거부 | 유지 | attestation **삭제** (§6), ineligible 그대로 | 실패 |

## 9. 구현 체크리스트

### 9.1 Identity 페이지 (`/projects/[slug]/identity`)
- [x] PolicyStatus 로드 후 Subscribing 가드
- [x] Submit 성공 시 `sessionStorage.setItem('attestation_' + id, ...)`
- [ ] verdict === "Ineligible" 분기 — 즉시 redirect 하지 말고 안내 노출
- [ ] verdict === "Eligible" 일 때만 `router.push` 로 project 페이지 복귀

### 9.2 Sidebar (`SubscribingSidebar.tsx`)
- [ ] mount 시 contribution + attestation 두 소스를 순서대로 조회
- [ ] `identity` / `rejected` / `contribute` 3-way 분기 도입
- [ ] Subscribe 버튼 활성화 조건을 `flow === "contribute"` 로 교체 (`isIdentityComplete` 의존 제거)
- [ ] `rejected` flow 전용 패널 (비활성 버튼 + 안내 + 재심사 링크)

### 9.3 ContributeButton (`flow === "contribute"`)
- [ ] sessionStorage 에서 attestation 꺼내 `contribute()` 호출
- [ ] 성공 시 sessionStorage 정리
- [ ] 만료/거부(attestation 기간 초과 등) 에러 시 sessionStorage 정리 + `identity` 로 이동

### 9.4 Wallet disconnect
- [ ] `WalletContext.signOut` 호출 시 IdentityContext.reset() 도 같이 트리거 (현재는 안 함)

## 10. 확정 결정 사항

1. **Attestation 보관 위치 = localStorage** (영속). sessionStorage가 탭 단위라 사용자가 탭을 닫으면 새로 심사받아야 해서 UX가 나쁘다. Attestation 만료는 TEE가 `expires_at`으로, 컨트랙트가 `FR-AV-6`으로 자체 관리하므로 FE는 시간 기반 정리 책임을 지지 않는다.
2. **Ineligible 재심사 불가 (정책당 1회 심사)**. LLM의 non-determinism을 악용한 반복 제출 / 프롬프트 엔지니어링 공격을 차단하기 위해 FE가 `localStorage.ineligible_<policyId> = true` 플래그를 저장하고 Submit 버튼을 영구 비활성화한다. 예외는 TEE / 네트워크 오류로 verdict를 아예 못 받은 경우 — 이건 "새 심사"가 아니라 "같은 요청 재전송"으로 취급해 플래그를 세우지 않는다.
3. **Wallet switch 시 attestation 삭제**. 로그인 시 저장된 attestation의 `bundle.payload.subject`가 현재 `accountId`와 다르면 즉시 `localStorage.removeItem('attestation_' + policyId)`. IdentityContext도 `WalletContext.signOut` 에 맞물려 `reset()` 호출. 혼란 / 컨트랙트 거부 방지.
