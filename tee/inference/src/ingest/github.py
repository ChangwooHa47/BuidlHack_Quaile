from __future__ import annotations

import asyncio
import hashlib
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from schemas import GithubSignalModel

GITHUB_GRAPHQL_URL = "https://api.github.com/graphql"
RETRY_DELAYS = (0.25,)


class GithubIngestError(Exception):
    pass


class GithubAuthFailed(GithubIngestError):
    pass


class GithubRateLimit(GithubIngestError):
    pass


class GithubTimeout(GithubIngestError):
    pass


class GithubIngestor:
    def __init__(self, user_agent: str = "buidl-near-ai/0.1"):
        self.client = httpx.AsyncClient(
            headers={
                "User-Agent": user_agent,
                "Accept": "application/vnd.github+json",
            },
            timeout=15.0,
        )

    async def collect(self, oauth_token: str) -> GithubSignalModel | None:
        headers = {"Authorization": f"Bearer {oauth_token}"}
        try:
            data = await self._graphql(headers)
            user = data["data"]["viewer"]
            login = user["login"]
            contributions = user["contributionsCollection"]
            repositories = user["repositories"]["nodes"]

            return GithubSignalModel(
                login_hash=hashlib.sha256(login.encode("utf-8")).digest(),
                public_repo_count=int(user["publicRepos"]["totalCount"]),
                contributions_last_year=int(
                    contributions["totalCommitContributions"]
                )
                + int(contributions["totalPullRequestContributions"]),
                account_age_days=_account_age_days(user["createdAt"]),
                primary_languages=_primary_languages(repositories),
            )
        except (GithubAuthFailed, GithubTimeout):
            return None
        finally:
            headers["Authorization"] = ""
            oauth_token = ""

    async def _graphql(self, headers: dict[str, str]) -> dict[str, Any]:
        body = {
            "query": """
query($from: DateTime!) {
  viewer {
    login
    createdAt
    publicRepos: repositories(privacy: PUBLIC) { totalCount }
    contributionsCollection(from: $from) {
      totalCommitContributions
      totalPullRequestContributions
    }
    repositories(first: 20, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { primaryLanguage { name } }
    }
  }
}
""",
            "variables": {
                "from": datetime.fromtimestamp(
                    time.time() - 365 * 86_400,
                    tz=timezone.utc,
                ).isoformat().replace("+00:00", "Z")
            },
        }
        last_error: Exception | None = None
        for attempt in range(len(RETRY_DELAYS) + 1):
            try:
                resp = await self.client.post(
                    GITHUB_GRAPHQL_URL,
                    headers=headers,
                    json=body,
                )
                if resp.status_code == 401:
                    raise GithubAuthFailed("github auth failed")
                if resp.status_code == 403:
                    if attempt == len(RETRY_DELAYS):
                        raise GithubRateLimit("github rate limited")
                    await asyncio.sleep(RETRY_DELAYS[attempt])
                    continue
                resp.raise_for_status()
                return resp.json()
            except httpx.TimeoutException as exc:
                raise GithubTimeout(str(exc)) from exc
            except GithubRateLimit as exc:
                last_error = exc
                if attempt == len(RETRY_DELAYS):
                    raise
        raise GithubIngestError(str(last_error))


def _account_age_days(created_at: str) -> int:
    created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    return max(0, int((time.time() - created.timestamp()) / 86_400))


def _primary_languages(repositories: list[dict[str, Any]]) -> list[str]:
    languages: list[str] = []
    for repo in repositories:
        primary = repo.get("primaryLanguage")
        if not primary:
            continue
        name = primary.get("name")
        if name and name not in languages:
            languages.append(name)
        if len(languages) == 5:
            break
    return languages
