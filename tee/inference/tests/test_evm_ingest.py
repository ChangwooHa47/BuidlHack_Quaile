from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path

import pytest

from ingest.chains import SUPPORTED_CHAINS, ChainConfig
from ingest.evm import EvmIngestor, UnsupportedChain
from schemas import EvmWalletProofModel

FIXTURES = Path(__file__).parent / "fixtures"
ADDRESS = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045"
SUPPORTED_CHAIN_IDS = [1, 8453, 42161, 10, 137, 56]


def _proof(chain_id: int = 1, address: str = ADDRESS) -> EvmWalletProofModel:
    return EvmWalletProofModel(
        chain_id=chain_id,
        address=address,
        signature="unused",
        message="unused",
        timestamp=1,
    )


def _chains(chain_ids: list[int]) -> dict[int, ChainConfig]:
    return {
        cid: ChainConfig(
            cid,
            SUPPORTED_CHAINS[cid].name,
            f"https://rpc.example/{cid}",
            f"https://explorer.example/{cid}",
            None,
        )
        for cid in chain_ids
    }


@pytest.mark.asyncio
async def test_happy_mock_rpc_parses_signal(httpx_mock, monkeypatch):
    sample = json.loads((FIXTURES / "evm_sample.json").read_text())
    monkeypatch.setattr("ingest.evm.asyncio.sleep", _no_sleep)
    monkeypatch.setattr("ingest.evm.time.time_ns", lambda: 1700864000000000000)

    ingestor = EvmIngestor(_chains([1]))
    ingestor.clients[1] = FakeWeb3(
        balance=sample["native_balance"],
        tx_count=sample["tx_count"],
        block_timestamp=sample["block_timestamp"],
    )
    httpx_mock.add_response(
        method="GET",
        url="https://explorer.example/1?module=account&action=txlist"
        f"&address={ADDRESS}&startblock=0&page=1&offset=1&sort=asc&chainid=1",
        json={
            "status": "1",
            "message": "OK",
            "result": [{"blockNumber": str(sample["first_seen_block"])}],
        },
    )
    for token in _ethereum_tokens():
        httpx_mock.add_response(
            method="GET",
            url="https://explorer.example/1?module=account&action=tokenbalance"
            f"&contractaddress={token}&address={ADDRESS}&tag=latest&chainid=1",
            json={
                "status": "1",
                "message": "OK",
                "result": str(sample["erc20_balance"]),
            },
        )

    signals, errors = await ingestor.collect([_proof()])

    assert errors == []
    assert len(signals) == 1
    signal = signals[0]
    assert signal.chain_id == 1
    assert signal.address == ADDRESS
    assert signal.native_balance_wei == sample["native_balance"].to_bytes(32, "big")
    assert signal.tx_count == sample["tx_count"]
    assert signal.first_seen_block == sample["first_seen_block"]
    assert signal.holding_days == 10
    assert signal.erc20s[0].balance_wei == sample["erc20_balance"].to_bytes(32, "big")

    await ingestor.http.aclose()


@pytest.mark.asyncio
async def test_six_chains_collect_in_parallel(httpx_mock, monkeypatch):
    monkeypatch.setattr("ingest.evm.asyncio.sleep", _no_sleep)
    monkeypatch.setattr("ingest.evm.time.time_ns", lambda: 1700864000000000000)
    ingestor = EvmIngestor(_chains(SUPPORTED_CHAIN_IDS))
    for cid in SUPPORTED_CHAIN_IDS:
        ingestor.clients[cid] = FakeWeb3(
            balance=cid,
            tx_count=cid,
            block_timestamp=1700000000,
        )
        httpx_mock.add_response(
            method="GET",
            url=f"https://explorer.example/{cid}?module=account&action=txlist"
            f"&address={ADDRESS}&startblock=0&page=1&offset=1&sort=asc&chainid={cid}",
            json={"status": "1", "message": "OK", "result": [{"blockNumber": "100"}]},
        )
        for token in _tokens_for(cid):
            httpx_mock.add_response(
                method="GET",
                url=f"https://explorer.example/{cid}?module=account&action=tokenbalance"
                f"&contractaddress={token}&address={ADDRESS}&tag=latest&chainid={cid}",
                json={"status": "1", "message": "OK", "result": "0"},
            )

    started = time.perf_counter()
    signals, errors = await ingestor.collect(
        [_proof(cid) for cid in SUPPORTED_CHAIN_IDS]
    )
    elapsed = time.perf_counter() - started

    assert errors == []
    assert len(signals) == 6
    assert {signal.chain_id for signal in signals} == set(SUPPORTED_CHAIN_IDS)
    assert elapsed < 0.9

    await ingestor.http.aclose()


@pytest.mark.asyncio
async def test_unsupported_chain_raises_and_collect_reports_error():
    ingestor = EvmIngestor(_chains([1]))

    with pytest.raises(UnsupportedChain):
        await ingestor._collect_one(_proof(999))

    signals, errors = await ingestor.collect([_proof(999)])
    assert signals == []
    assert errors == [f"999:{ADDRESS}: UnsupportedChain"]

    await ingestor.http.aclose()


@pytest.mark.asyncio
async def test_rpc_500_retries_then_succeeds(httpx_mock, monkeypatch):
    monkeypatch.setattr("ingest.evm.asyncio.sleep", _no_sleep)
    monkeypatch.setattr("ingest.evm.time.time_ns", lambda: 1700864000000000000)

    ingestor = EvmIngestor(_chains([1]))
    ingestor.clients[1] = FakeWeb3(
        balance=1,
        tx_count=2,
        block_timestamp=1700000000,
        fail_balance_times=1,
    )
    httpx_mock.add_response(
        method="GET",
        url="https://explorer.example/1?module=account&action=txlist"
        f"&address={ADDRESS}&startblock=0&page=1&offset=1&sort=asc&chainid=1",
        json={"status": "1", "message": "OK", "result": [{"blockNumber": "100"}]},
    )
    for token in _ethereum_tokens():
        httpx_mock.add_response(
            method="GET",
            url="https://explorer.example/1?module=account&action=tokenbalance"
            f"&contractaddress={token}&address={ADDRESS}&tag=latest&chainid=1",
            json={"status": "1", "message": "OK", "result": "0"},
        )

    signals, errors = await ingestor.collect([_proof()])

    assert errors == []
    assert len(signals) == 1
    assert ingestor.clients[1].eth.balance_calls == 2

    await ingestor.http.aclose()


@pytest.mark.asyncio
async def test_one_chain_timeout_keeps_other_chain_success(httpx_mock, monkeypatch):
    monkeypatch.setattr("ingest.evm.asyncio.sleep", _no_sleep)
    monkeypatch.setattr("ingest.evm.time.time_ns", lambda: 1700864000000000000)

    ingestor = EvmIngestor(_chains([1, 42161]))
    ingestor.clients[1] = FakeWeb3(balance=1, tx_count=2, block_timestamp=1700000000)
    ingestor.clients[42161] = FakeWeb3(
        balance=1,
        tx_count=2,
        block_timestamp=1700000000,
        always_timeout=True,
    )
    httpx_mock.add_response(
        method="GET",
        url="https://explorer.example/1?module=account&action=txlist"
        f"&address={ADDRESS}&startblock=0&page=1&offset=1&sort=asc&chainid=1",
        json={"status": "1", "message": "OK", "result": [{"blockNumber": "100"}]},
    )
    for token in _ethereum_tokens():
        httpx_mock.add_response(
            method="GET",
            url="https://explorer.example/1?module=account&action=tokenbalance"
            f"&contractaddress={token}&address={ADDRESS}&tag=latest&chainid=1",
            json={"status": "1", "message": "OK", "result": "0"},
        )

    signals, errors = await ingestor.collect([_proof(1), _proof(42161)])

    assert len(signals) == 1
    assert signals[0].chain_id == 1
    assert errors == [f"42161:{ADDRESS}: RpcFailure"]

    await ingestor.http.aclose()


@pytest.mark.asyncio
async def test_ens_lookup_failure_does_not_drop_signal(httpx_mock, monkeypatch):
    monkeypatch.setattr("ingest.evm.asyncio.sleep", _no_sleep)
    monkeypatch.setattr("ingest.evm.time.time_ns", lambda: 1700864000000000000)

    ingestor = EvmIngestor(_chains([1]))
    ingestor.clients[1] = FakeWeb3(
        balance=0,
        tx_count=0,
        block_timestamp=1700000000,
        ens_failure=True,
    )
    httpx_mock.add_response(
        method="GET",
        url="https://explorer.example/1?module=account&action=txlist"
        f"&address={ADDRESS}&startblock=0&page=1&offset=1&sort=asc&chainid=1",
        json={"status": "1", "message": "OK", "result": []},
    )
    for token in _ethereum_tokens():
        httpx_mock.add_response(
            method="GET",
            url="https://explorer.example/1?module=account&action=tokenbalance"
            f"&contractaddress={token}&address={ADDRESS}&tag=latest&chainid=1",
            json={"status": "1", "message": "OK", "result": "0"},
        )

    signals, errors = await ingestor.collect([_proof()])

    assert errors == []
    assert len(signals) == 1
    assert signals[0].native_balance_wei == (0).to_bytes(32, "big")
    assert signals[0].holding_days == 0

    await ingestor.http.aclose()


@pytest.mark.skipif(
    not bool(os.environ.get("EVM_INTEGRATION_TEST")),
    reason="set EVM_INTEGRATION_TEST=1 to run EVM multichain integration",
)
@pytest.mark.asyncio
async def test_vitalik_multichain_integration():
    missing_envs = _missing_integration_envs()
    assert missing_envs == [], f"missing integration envs: {', '.join(missing_envs)}"

    ingestor = EvmIngestor(
        {cid: SUPPORTED_CHAINS[cid] for cid in SUPPORTED_CHAIN_IDS}
    )
    try:
        signals, errors = await ingestor.collect(
            [_proof(cid) for cid in SUPPORTED_CHAIN_IDS]
        )
    finally:
        await ingestor.http.aclose()

    assert errors == []
    assert len(signals) == 6
    assert {signal.chain_id for signal in signals} == set(SUPPORTED_CHAIN_IDS)


class FakeWeb3:
    def __init__(
        self,
        *,
        balance: int,
        tx_count: int,
        block_timestamp: int,
        fail_balance_times: int = 0,
        always_timeout: bool = False,
        ens_failure: bool = False,
    ):
        self.eth = FakeEth(
            balance,
            tx_count,
            block_timestamp,
            fail_balance_times,
            always_timeout,
        )
        self.ens = FailingEns() if ens_failure else None


class FakeEth:
    def __init__(
        self,
        balance: int,
        tx_count: int,
        block_timestamp: int,
        fail_balance_times: int,
        always_timeout: bool,
    ):
        self.balance = balance
        self.tx_count = tx_count
        self.block_timestamp = block_timestamp
        self.fail_balance_times = fail_balance_times
        self.always_timeout = always_timeout
        self.balance_calls = 0

    async def get_balance(self, _address: str) -> int:
        self.balance_calls += 1
        if self.always_timeout:
            await asyncio.sleep(0)
            raise TimeoutError("timeout")
        if self.balance_calls <= self.fail_balance_times:
            raise RuntimeError("HTTP 500")
        return self.balance

    async def get_transaction_count(self, _address: str) -> int:
        if self.always_timeout:
            raise TimeoutError("timeout")
        return self.tx_count

    async def get_block(self, _block_number: int) -> dict:
        return {"timestamp": self.block_timestamp}


class FailingEns:
    def name(self, _address: str) -> str:
        raise RuntimeError("ens down")


async def _no_sleep(_delay: float) -> None:
    return None


def _ethereum_tokens() -> tuple[str, ...]:
    return _tokens_for(1)


def _tokens_for(chain_id: int) -> tuple[str, ...]:
    from ingest.evm import ERC20_WHITELIST

    return ERC20_WHITELIST[chain_id]


def _missing_integration_envs() -> list[str]:
    missing: list[str] = []
    for cid in SUPPORTED_CHAIN_IDS:
        config = SUPPORTED_CHAINS[cid]
        if not config.rpc:
            rpc_env = f"RPC_{config.name.upper()}"
            if config.name == "ethereum":
                rpc_env = "RPC_ETHEREUM"
            missing.append(rpc_env)
        if config.etherscan_api_key_env and not os.environ.get(
            config.etherscan_api_key_env
        ):
            missing.append(config.etherscan_api_key_env)
    return missing
