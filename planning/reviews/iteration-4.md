# Iteration 4 Review — TDX report_data closure

## Trigger
사용자가 자리 비운 동안 추가 autonomous loop 실행 요청 (재진입).
iteration 3에서 READY 상태 도달 후, **deferred item 중 가장 가치 있는 항목 1개**를 처리.

## Scope
단 1개 항목:
- **Deferred #1**: TDX `report_data` 정확한 인코딩 (iteration-1 blocker #10, 이후 tee-05 Open Question #2로 남아있던 것)

다른 cosmetic item은 iteration 3에서 이미 정리됨.

## What was done

### 1. 공식 구현 소스 직접 fetch
- `nearai-cloud-verifier/py/model_verifier.py` 의 `check_report_data()` / `fetch_report()` 전체 읽음
- TDX quote 파싱 + report_data 필드 해석 로직 확인

### 2. 확정된 인코딩

**Mode A (MVP)**:
```
report_data (64 bytes) = signing_address_padded32 || nonce(32)
  signing_address_padded32 = address_bytes(20) + zero_pad(12)   # raw concat, NO hash
  nonce                    = 32 bytes from query param
```

**Mode B (TLS fingerprint binding)** — 로드맵:
```
report_data[0..32]  = sha256(signing_address_bytes(20) || tls_cert_fingerprint_bytes)
report_data[32..64] = nonce(32)
```

### 3. 파일 반영
- `planning/research/near-ai-tee-notes.md` §11 신규 섹션 추가 (full spec + verifier check logic + impact analysis)
- `planning/research/near-ai-tee-notes.md` §8 Q8 ✅ CLOSED 마킹
- `planning/tasks/tee-05-signer-and-report.md`:
  - `fetch_report()` 파라미터 확장 (`model`, `signing_algo=ecdsa` 필수)
  - TDX report_data 인코딩 섹션 추가
  - Off-chain verifier 검증 플로우 의사코드 추가
  - Open Question #2 ✅ CLOSED 마킹

### 4. 설계 영향 확인
- 우리 tee-05 `sign_and_attach()`는 이미 `nonce = bundle.payload_hash` 전달 방식. 위 스펙과 호환. **코드 수정 불필요**.
- `nonce = payload_hash` 선택의 근거 강화: "TEE attestation이 하드웨어 수준에서 특정 payload에 바인딩됨"

## Blockers from iteration-3 review — status update

- **contract-03b duplicate 에러/이벤트 블록**: ✅ CLOSED (iteration 3 cleanup에서 처리됨)
- **ERD Mermaid live_start/tee_report**: ✅ CLOSED (iteration 3 cleanup)
- **ERD §6 line 563 (status==Pending)**: ✅ CLOSED (iteration 3 cleanup)
- **contract-03c cached_policy_or_fetch**: ✅ CLOSED (iteration 3 cleanup)
- **infra-01 pynacl/base58 missing**: ✅ CLOSED (iteration 3 cleanup)
- **contract-01 InvalidTransition 잔재**: ✅ CLOSED (iteration 3 cleanup)
- **Deferred TDX report_data encoding**: ✅ **CLOSED in iteration 4** (this iteration)

## New issues introduced
없음. 증분 편집만 수행, 기존 파일 손상 없음.

## Remaining deferred items (구현 단계에서 처리)
1. `signing_key_id` 단순화 여부 (contract-02 design) — 차단 아님
2. NEAR AI Cloud API key 발급 절차 (tee-05 Open Q #1) — 실제 배포 시 확인
3. Rate limit + 가격 정보 — 데모 비용 산정 필요 시
4. NVIDIA NRAS JWT 온체인 검증 대체 방법 — 로드맵

## Verdict

**여전히 READY FOR IMPLEMENTATION**, 그리고 한 층 더 단단해졌음. TDX report_data 인코딩이 코드 수준에서 확정되어, `tee-05`를 구현하는 개발자가 공식 SDK 규격과 100% 호환되는 attestation 플로우를 쓸 수 있다.

iteration 5는 불필요 — 남은 deferred items는 전부 "구현 단계에서 외부 리소스 접근 시점에만 해결 가능" 성격. 기획 수준에서 더 할 일이 없다. **루프 종료.**
