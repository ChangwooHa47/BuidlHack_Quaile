# Tasks

이슈 단위로 쪼개진 BE 태스크 파일들. 각 파일은 하나의 PR/커밋에 해당한다.

## 네이밍 규칙

```
{layer}-{NN}-{slug}.md

layer:
  - infra     # 모노레포/빌드/배포 인프라
  - contract  # 스마트 컨트랙트
  - tee       # TEE 추론 코어
  - ingest    # 데이터 인제스트
  - test      # 통합 테스트/E2E
```

예: `contract-01-policy-registry-init.md`, `tee-03-github-ingestion.md`

## 태스크 파일 포맷

```markdown
---
id: contract-01-policy-registry-init
status: todo            # todo | in_progress | done | verified
sub: BE                 # FE | BE | INFRA | TEE
layer: contract
depends_on: []          # 다른 태스크 id 배열
estimate: 1h            # 30m ~ 2h
demo_step: "Upcoming"   # ONE_PAGER §6 어느 단계인가
---

# 제목

## Context
왜 이 태스크가 필요한가. ONE_PAGER의 어느 부분과 연결되는가.

## Files
- `contracts/policy-registry/Cargo.toml` (create)
- `contracts/policy-registry/src/lib.rs` (create)

## Spec
### 구조체/타입
```rust
pub struct Policy {
    pub id: PolicyId,
    pub foundation: AccountId,
    pub natural_language: String,
    pub ipfs_cid: String,
    pub created_at: u64,
}
```

### 메서드 시그니처
```rust
pub fn register_policy(&mut self, natural_language: String, ipfs_cid: String) -> PolicyId;
pub fn get_policy(&self, id: PolicyId) -> Option<Policy>;
```

### 에러 케이스
- `PolicyNotFound` — 존재하지 않는 id 조회
- `Unauthorized` — 재단이 아닌 계정이 등록 시도

## Acceptance Criteria
- [ ] cargo build 성공
- [ ] unit test: register → get 라운드트립
- [ ] unit test: 권한 없는 계정 등록 거부
- [ ] unit test: 동일 재단이 여러 policy 등록 가능

## Test Cases
1. happy path: 재단이 policy 등록 → 반환된 id로 조회 가능
2. edge: 빈 natural_language → 거부 (PolicyValidation)
3. edge: 잘못된 IPFS CID 형식 → 거부 (PolicyValidation)

## References
- NEAR SDK Rust: https://docs.near.org/sdk/rust/introduction
```

## 루프가 이 폴더에 하는 일

- 초기 스켈레톤만 깔려 있으면, 루프가 매 iteration마다 가장 약한 태스크를 골라서
  - Spec 섹션의 시그니처를 구체화
  - Acceptance Criteria를 측정 가능하게 강화
  - Test Cases를 최소 3개 이상으로 확장
  - References에 실제 문서 링크 추가
- 필요 시 **큰 태스크를 2개 이상으로 분할**
- 필요 시 **누락된 태스크 신규 생성**
- 모든 태스크가 STATE.md의 Quality Gate를 통과할 때까지 반복
