from __future__ import annotations

import json
from pathlib import Path

import pytest

from ingest.near import NearIngestor, NearWalletNotFound
from schemas import NearWalletProofModel

FIXTURES = Path(__file__).parent / "fixtures"
RPC_URL = "https://rpc.mainnet.near.org"
ARCHIVAL_URL = "https://archival-rpc.mainnet.near.org"
NEARBLOCKS_TXNS = (
    "https://api.nearblocks.io/v1/account/near/txns-only?order=asc&per_page=1"
)
NEARBLOCKS_TOKENS = "https://api.nearblocks.io/v1/account/near/tokens"


def _proof(account_id: str = "near") -> NearWalletProofModel:
    return NearWalletProofModel(
        account_id=account_id,
        public_key="ed25519:unused",
        signature="unused",
        message="unused",
        timestamp=1,
    )


def _rpc_query_response(result: object) -> dict:
    return {"jsonrpc": "2.0", "id": "buidl-near-ai", "result": result}


def _dao_response(value: object) -> dict:
    return _rpc_query_response({"result": list(json.dumps(value).encode())})


@pytest.mark.asyncio
async def test_happy_mock_rpc_parses_signal(httpx_mock, monkeypatch):
    sample = json.loads((FIXTURES / "near_sample.json").read_text())
    monkeypatch.setattr("ingest.near.time.time_ns", lambda: 1700864000000000000)

    httpx_mock.add_response(method="POST", url=RPC_URL, json=sample["view_account"])
    httpx_mock.add_response(method="GET", url=NEARBLOCKS_TXNS, json=sample["txns_only"])
    httpx_mock.add_response(
        method="POST", url=RPC_URL, json=sample["access_key_list"]
    )
    httpx_mock.add_response(
        method="GET", url=NEARBLOCKS_TOKENS, json=sample["tokens"]
    )
    httpx_mock.add_response(
        method="POST", url=ARCHIVAL_URL, json=_dao_response(sample["dao"])
    )

    ingestor = NearIngestor(RPC_URL, ARCHIVAL_URL)
    signals = await ingestor.collect([_proof()])

    assert len(signals) == 1
    signal = signals[0]
    assert signal.account_id == "near"
    assert signal.first_seen_block == 10
    assert signal.holding_days == 10
    assert signal.total_txs == 7
    assert signal.native_balance == 1230000000000000000000000
    assert signal.fts[0].token == "token.near"
    assert signal.fts[0].balance == 42
    assert signal.dao_votes[0].proposal_id == 3
    assert signal.dao_votes[0].vote == "Approve"

    await ingestor.client.aclose()


@pytest.mark.asyncio
async def test_wallet_not_found_is_skipped_by_collect(httpx_mock):
    for _ in range(2):
        httpx_mock.add_response(
            method="POST",
            url=RPC_URL,
            json={
                "jsonrpc": "2.0",
                "id": "buidl-near-ai",
                "error": {"message": "UNKNOWN_ACCOUNT: account does not exist"},
            },
        )

    ingestor = NearIngestor(RPC_URL, ARCHIVAL_URL)
    with pytest.raises(NearWalletNotFound):
        await ingestor._collect_one(_proof("xxx-nope-9999.near"))
    signals = await ingestor.collect([_proof("xxx-nope-9999.near")])
    assert signals == []

    await ingestor.client.aclose()


@pytest.mark.asyncio
async def test_429_retries_then_succeeds(httpx_mock, monkeypatch):
    monkeypatch.setattr("ingest.near.asyncio.sleep", _no_sleep)
    monkeypatch.setattr("ingest.near.time.time_ns", lambda: 1700864000000000000)

    httpx_mock.add_response(method="POST", url=RPC_URL, status_code=429)
    httpx_mock.add_response(
        method="POST",
        url=RPC_URL,
        json=_rpc_query_response({"amount": "1"}),
    )
    httpx_mock.add_response(
        method="GET",
        url=NEARBLOCKS_TXNS,
        json={"txns": [{"block_height": 1, "block_timestamp": 1700000000000000000}]},
    )
    httpx_mock.add_response(method="POST", url=RPC_URL, json=_rpc_query_response({}))
    httpx_mock.add_response(method="GET", url=NEARBLOCKS_TOKENS, json={"tokens": []})
    httpx_mock.add_response(method="POST", url=ARCHIVAL_URL, json=_dao_response([]))

    ingestor = NearIngestor(RPC_URL, ARCHIVAL_URL)
    signals = await ingestor.collect([_proof()])

    assert len(signals) == 1
    assert signal_count(httpx_mock, "POST", RPC_URL) == 3

    await ingestor.client.aclose()


@pytest.mark.asyncio
async def test_retry_exhaustion_returns_partial_results(httpx_mock, monkeypatch):
    monkeypatch.setattr("ingest.near.asyncio.sleep", _no_sleep)

    for _ in range(6):
        httpx_mock.add_response(method="POST", url=RPC_URL, status_code=500)

    ingestor = NearIngestor(RPC_URL, ARCHIVAL_URL)
    signals = await ingestor.collect([_proof()])

    assert signals == []
    assert signal_count(httpx_mock, "POST", RPC_URL) == 6

    await ingestor.client.aclose()


@pytest.mark.asyncio
async def test_nearblocks_down_sets_first_seen_and_holding_days_zero(
    httpx_mock, monkeypatch
):
    monkeypatch.setattr("ingest.near.asyncio.sleep", _no_sleep)

    httpx_mock.add_response(
        method="POST",
        url=RPC_URL,
        json=_rpc_query_response({"amount": "1"}),
    )
    for _ in range(6):
        httpx_mock.add_response(method="GET", url=NEARBLOCKS_TXNS, status_code=500)
    httpx_mock.add_response(method="POST", url=RPC_URL, json=_rpc_query_response({}))
    httpx_mock.add_response(method="GET", url=NEARBLOCKS_TOKENS, json={"tokens": []})
    httpx_mock.add_response(method="POST", url=ARCHIVAL_URL, json=_dao_response([]))

    ingestor = NearIngestor(RPC_URL, ARCHIVAL_URL)
    signal = (await ingestor.collect([_proof()]))[0]

    assert signal.first_seen_block == 0
    assert signal.holding_days == 0
    assert signal.total_txs == 0

    await ingestor.client.aclose()


@pytest.mark.skipif(
    not bool(__import__("os").environ.get("NEAR_INTEGRATION_TEST")),
    reason="set NEAR_INTEGRATION_TEST=1 to run mainnet RPC integration",
)
@pytest.mark.asyncio
async def test_mainnet_near_account_integration():
    ingestor = NearIngestor(RPC_URL, ARCHIVAL_URL)
    signal = (await ingestor.collect([_proof("near")]))[0]
    assert signal.holding_days > 0
    await ingestor.client.aclose()


async def _no_sleep(_delay: float) -> None:
    return None


def signal_count(httpx_mock, method: str, url: str) -> int:
    return sum(
        1
        for request in httpx_mock.get_requests()
        if request.method == method and str(request.url) == url
    )
