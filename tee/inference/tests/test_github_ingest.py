from __future__ import annotations

import hashlib

import httpx
import pytest

from ingest.github import GITHUB_GRAPHQL_URL, GithubIngestor


@pytest.mark.asyncio
async def test_happy_mock_graphql_parses_signal(httpx_mock, monkeypatch):
    monkeypatch.setattr("ingest.github.time.time", lambda: 1_700_864_000)
    httpx_mock.add_response(
        method="POST",
        url=GITHUB_GRAPHQL_URL,
        json=_graphql_response(
            login="octocat",
            public_repo_count=8,
            commit_contributions=12,
            pr_contributions=3,
            created_at="2022-11-24T00:00:00Z",
            languages=["Python", "Rust", "Python", "TypeScript", "Go", "Shell"],
        ),
    )
    ingestor = GithubIngestor()

    signal = await ingestor.collect("gho_test")

    assert signal is not None
    assert signal.login_hash == hashlib.sha256(b"octocat").digest()
    assert signal.public_repo_count == 8
    assert signal.contributions_last_year == 15
    assert signal.account_age_days == 365
    assert signal.primary_languages == ["Python", "Rust", "TypeScript", "Go", "Shell"]
    assert "login" not in signal.model_dump()

    await ingestor.client.aclose()


@pytest.mark.asyncio
async def test_401_returns_none(httpx_mock):
    httpx_mock.add_response(method="POST", url=GITHUB_GRAPHQL_URL, status_code=401)
    ingestor = GithubIngestor()

    assert await ingestor.collect("expired") is None

    await ingestor.client.aclose()


@pytest.mark.asyncio
async def test_rate_limit_backs_off_then_succeeds(httpx_mock, monkeypatch):
    monkeypatch.setattr("ingest.github.asyncio.sleep", _no_sleep)
    monkeypatch.setattr("ingest.github.time.time", lambda: 1_700_864_000)
    httpx_mock.add_response(method="POST", url=GITHUB_GRAPHQL_URL, status_code=403)
    httpx_mock.add_response(
        method="POST",
        url=GITHUB_GRAPHQL_URL,
        json=_graphql_response(
            login="octocat",
            public_repo_count=1,
            commit_contributions=1,
            pr_contributions=0,
            created_at="2023-11-15T00:00:00Z",
            languages=["Python"],
        ),
    )
    ingestor = GithubIngestor()

    signal = await ingestor.collect("gho_test")

    assert signal is not None
    assert signal.contributions_last_year == 1

    await ingestor.client.aclose()


@pytest.mark.asyncio
async def test_timeout_returns_none(httpx_mock):
    httpx_mock.add_exception(httpx.TimeoutException("timeout"))
    ingestor = GithubIngestor()

    assert await ingestor.collect("gho_test") is None

    await ingestor.client.aclose()


@pytest.mark.asyncio
async def test_primary_languages_less_than_five(httpx_mock, monkeypatch):
    monkeypatch.setattr("ingest.github.time.time", lambda: 1_700_864_000)
    httpx_mock.add_response(
        method="POST",
        url=GITHUB_GRAPHQL_URL,
        json=_graphql_response(
            login="octocat",
            public_repo_count=2,
            commit_contributions=0,
            pr_contributions=0,
            created_at="2023-11-15T00:00:00Z",
            languages=["Python", None, "Rust"],
        ),
    )
    ingestor = GithubIngestor()

    signal = await ingestor.collect("gho_test")

    assert signal is not None
    assert signal.primary_languages == ["Python", "Rust"]

    await ingestor.client.aclose()


@pytest.mark.asyncio
async def test_new_account_age_is_preserved(httpx_mock, monkeypatch):
    monkeypatch.setattr("ingest.github.time.time", lambda: 1_700_864_000)
    httpx_mock.add_response(
        method="POST",
        url=GITHUB_GRAPHQL_URL,
        json=_graphql_response(
            login="octocat",
            public_repo_count=0,
            commit_contributions=0,
            pr_contributions=0,
            created_at="2023-11-15T00:00:00Z",
            languages=[],
        ),
    )
    ingestor = GithubIngestor()

    signal = await ingestor.collect("gho_test")

    assert signal is not None
    assert signal.account_age_days == 9

    await ingestor.client.aclose()


async def _no_sleep(_delay):
    return None


def _graphql_response(
    *,
    login: str,
    public_repo_count: int,
    commit_contributions: int,
    pr_contributions: int,
    created_at: str,
    languages: list[str | None],
) -> dict:
    return {
        "data": {
            "viewer": {
                "login": login,
                "createdAt": created_at,
                "publicRepos": {"totalCount": public_repo_count},
                "contributionsCollection": {
                    "totalCommitContributions": commit_contributions,
                    "totalPullRequestContributions": pr_contributions,
                },
                "repositories": {
                    "nodes": [
                        {
                            "primaryLanguage": (
                                {"name": language} if language is not None else None
                            )
                        }
                        for language in languages
                    ]
                },
            }
        }
    }
