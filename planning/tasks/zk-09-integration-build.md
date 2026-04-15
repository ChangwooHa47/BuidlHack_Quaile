---
id: zk-09-integration-build
status: done
sub: INFRA
layer: test
depends_on: ["zk-05-escrow-zk-integration", "zk-07-tee-zk-input-response", "zk-08-golden-vectors"]
estimate: 30m
demo_step: "전체"
---

# 최종 통합 빌드 + 정리

## Context
ZK 마이그레이션의 모든 태스크(zk-01~zk-08)가 완료된 뒤, 전체 workspace가 정상 빌드/테스트되는지 최종 확인.

계획 문서: `docs/superpowers/plans/2026-04-15-zk-eligibility-migration.md` Task 9

## Files
- `.gitignore` (modify — `circuits/build/` 확인)
- 전체 workspace (build + test)

## Spec

### 빌드 검증 항목

**Rust workspace:**
```bash
cargo build --workspace
cargo test --workspace
```

**Wasm 빌드 (전 컨트랙트):**
```bash
cargo build --target wasm32-unknown-unknown --release -p policy-registry
cargo build --target wasm32-unknown-unknown --release -p attestation-verifier
cargo build --target wasm32-unknown-unknown --release -p ido-escrow
cargo build --target wasm32-unknown-unknown --release -p zk-verifier
cargo build --target wasm32-unknown-unknown --release -p mock-ft
```

**Python TEE:**
```bash
cd tee/inference && uv run pytest -v
```

**Circom circuit:**
```bash
cd circuits && snarkjs groth16 verify build/verification_key.json build/public.json build/proof.json
```

### 정리 항목
- `.gitignore`에 `circuits/build/` 포함 확인
- 불필요한 TODO/FIXME 주석 제거
- 기존 `EvidenceSummary`, `score` 관련 코드 잔재 없음 확인

### 기존 태스크 파일 정리
- `tee-04-llm-judge.md` — status를 `superseded`로 변경 (zk-06으로 대체)
- `tee-05-signer-and-report.md` — 서명 로직은 유지되므로 status 변경 불필요

## Acceptance Criteria
- [ ] `cargo build --workspace` 성공
- [ ] `cargo test --workspace` 성공
- [ ] wasm 빌드 5개 전부 성공
- [ ] `uv run pytest -v` 전부 통과
- [ ] circom proof verify OK
- [ ] `grep -r "EvidenceSummary" tee/ contracts/` → 결과 없음 (주석 제외)
- [ ] `.gitignore`에 `circuits/build/` 포함

## Test Cases
1. workspace 전체 빌드 성공
2. workspace 전체 테스트 통과
3. wasm 바이너리 5개 생성 확인
4. Python 테스트 전부 통과
5. circom proof 검증 통과

## 코드리뷰 체크포인트
이 태스크 완료 후 (최종 리뷰):
1. ZK 마이그레이션으로 인한 breaking change 목록 정리
2. 기존 FE 코드가 새 TEE 응답 형식에 영향받는 부분 확인 (FE는 별도 태스크)
3. `planning/STATE.md` 업데이트 확인

## References
- 계획 문서 Task 9
- 전체 계획: `docs/superpowers/plans/2026-04-15-zk-eligibility-migration.md`
