---
id: ingest-03-github
status: done
sub: TEE
layer: ingest
depends_on: [tee-01-persona-schema, tee-02-inference-service]
estimate: 1h
demo_step: "Subscribing.Review"
---

# GitHub 기여 이력 수집기

## Context
Persona에 github_oauth_token이 포함되면, TEE가 GitHub API를 호출해 `GithubSignal`을 생성.
**OAuth 토큰은 TEE 밖으로 절대 유출 불가.**

PRD FR-IN-6
ERD §3.4 GithubSignal

## Files
- `tee/inference/src/ingest/github.py`
- `tee/inference/tests/test_github_ingest.py`

## Spec

### 수집 시그널
```python
class GithubSignal(BaseModel):
    login_hash: bytes  # SHA256(login) — 식별 불가
    public_repo_count: int
    contributions_last_year: int  # approximate
    account_age_days: int
    primary_languages: list[str]  # top 5
```

### 클래스
```python
class GithubIngestor:
    def __init__(self, user_agent: str = "buidl-near-ai/0.1"):
        self.client = httpx.AsyncClient(
            headers={"User-Agent": user_agent, "Accept": "application/vnd.github+json"},
            timeout=15.0,
        )

    async def collect(self, oauth_token: str) -> GithubSignal | None:
        headers = {"Authorization": f"Bearer {oauth_token}"}
        # 1. GET /user → login, public_repos, created_at
        # 2. GET /search/commits?q=author:{login}+committer-date:>{1y ago} (approximate)
        #    또는 GraphQL: contributionsCollection.totalCommitContributions
        # 3. GET /users/{login}/repos?sort=updated → top 5 languages
        # 4. login_hash = sha256(login).digest()
        # 5. 원본 login/email은 폐기. login_hash만 유지.
```

### GraphQL 대안 (권장)
```graphql
query($login: String!) {
  user(login: $login) {
    createdAt
    publicRepos: repositories(privacy: PUBLIC) { totalCount }
    contributionsCollection(from: "<1y ago>") {
      totalCommitContributions
      totalPullRequestContributions
    }
    repositories(first: 20, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { primaryLanguage { name } }
    }
  }
}
```

REST보다 1 call로 끝나고 정확함. MVP는 GraphQL 권장.

### 개인정보 취급 (NFR-SEC-1)
- login, email, name: **절대 로그 금지**
- login_hash만 EvidenceSummary에 포함 (식별 불가)
- primary_languages는 집계 데이터 (식별 리스크 낮음)
- oauth_token은 ingest 종료 직후 메모리 zero-out

### Error handling
```python
class GithubIngestError(Exception): ...
class GithubAuthFailed(GithubIngestError): ...
class GithubRateLimit(GithubIngestError): ...
class GithubTimeout(GithubIngestError): ...
```

- 401 → GithubAuthFailed (persona에서 제외, github_included=false)
- 403 rate limit → 짧은 backoff
- timeout → None 반환 (partial)

## Acceptance Criteria
- [ ] `uv run pytest tests/test_github_ingest.py` 성공
- [ ] Mock GraphQL 응답 → GithubSignal 파싱 정확
- [ ] 401 응답 → GithubAuthFailed → collect 반환 None
- [ ] oauth_token이 None이면 collect 호출 안 함 (pipeline에서 분기)
- [ ] login 원본이 returned signal에 없는지 확인 (login_hash만)

## Test Cases
1. happy: mock GraphQL → signal 필드 전부 채움
2. edge: oauth_token 만료 (401) → None 반환
3. edge: rate limit (403) → backoff → 성공
4. edge: 네트워크 timeout → None
5. edge: primary_languages < 5 → 있는 만큼만 반환
6. edge: 신규 계정 (age < 30일) → 그대로 반환 (LLM이 판단)

## References
- GitHub REST: https://docs.github.com/en/rest
- GitHub GraphQL: https://docs.github.com/en/graphql
- `planning/PRD.md` FR-IN-6, NFR-SEC-1
- `planning/ERD.md` §3.4 GithubSignal

## Open Questions
1. OAuth token scope: 최소 권한(`read:user`, `public_repo`)이면 충분한가?
2. Private repo contributions 포함? → 프라이버시 고려해서 **퍼블릭만**
3. login_hash에 salt 사용? → MVP는 plain SHA256 (policy_id를 salt로 쓰는 옵션도 있음)
