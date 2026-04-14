from __future__ import annotations

import asyncio
import os
import time
from typing import Any

import httpx
import web3

from schemas import Erc20HoldingModel, EvmWalletProofModel, EvmWalletSignalModel

from .chains import ChainConfig

DAY_NS = 86_400 * 1_000_000_000
RETRY_DELAYS = (0.25, 0.5, 1.0)

ERC20_WHITELIST: dict[int, tuple[str, ...]] = {
    1: (
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        "0xdac17f958d2ee523a2206206994597c13d831ec7",
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        "0x6b175474e89094c44da98b954eedeac495271d0f",
        "0x514910771af9ca656af840dff83e8264ecf986ca",
    ),
    8453: (
        "0x833589fcd6edb6e08f4c7c32d4f71b54bdA02913".lower(),
        "0x4200000000000000000000000000000000000006",
    ),
    42161: (
        "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
        "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
        "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    ),
    10: (
        "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
        "0x4200000000000000000000000000000000000006",
    ),
    137: (
        "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
        "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
        "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
        "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
    ),
    56: (
        "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
        "0x55d398326f99059ff775485246999027b3197955",
        "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
    ),
}


class EvmIngestError(Exception):
    pass


class UnsupportedChain(EvmIngestError):
    def __init__(self, chain_id: int):
        super().__init__(f"unsupported chain_id: {chain_id}")
        self.chain_id = chain_id


class RpcFailure(EvmIngestError):
    pass


class ExplorerApiFailure(EvmIngestError):
    pass


class RateLimited(EvmIngestError):
    pass


class EvmIngestor:
    def __init__(self, chains: dict[int, ChainConfig]):
        self.chains = chains
        self.clients = {
            cid: web3.AsyncWeb3(web3.AsyncHTTPProvider(c.rpc))
            for cid, c in chains.items()
        }
        self.http = httpx.AsyncClient(timeout=10.0)
        self._chain_sems = {cid: asyncio.Semaphore(3) for cid in chains}

    async def collect(
        self, proofs: list[EvmWalletProofModel]
    ) -> tuple[list[EvmWalletSignalModel], list[str]]:
        tasks = [self._collect_one(p) for p in proofs]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        signals: list[EvmWalletSignalModel] = []
        errors: list[str] = []
        for proof, result in zip(proofs, results):
            if isinstance(result, Exception):
                error_type = type(result).__name__
                errors.append(f"{proof.chain_id}:{proof.address}: {error_type}")
            else:
                signals.append(result)
        return signals, errors

    async def _collect_one(self, proof: EvmWalletProofModel) -> EvmWalletSignalModel:
        config = self.chains.get(proof.chain_id)
        if config is None:
            raise UnsupportedChain(proof.chain_id)

        async with self._chain_sems[proof.chain_id]:
            address = proof.address.lower()
            checksum_address = web3.Web3.to_checksum_address(address)
            client = self.clients[proof.chain_id]

            native_balance = await self._rpc_call(
                client.eth.get_balance,
                checksum_address,
            )
            tx_count = await self._rpc_call(
                client.eth.get_transaction_count,
                checksum_address,
            )
            first_seen_block = await self._first_seen_block(config, address)
            holding_days = await self._holding_days(client, first_seen_block)
            erc20s = await self._erc20_holdings(config, address)
            await self._ens_name(client, proof.chain_id, checksum_address)

            return EvmWalletSignalModel(
                chain_id=proof.chain_id,
                address=address,
                first_seen_block=first_seen_block,
                holding_days=holding_days,
                tx_count=int(tx_count),
                native_balance_wei=_u256_bytes(int(native_balance)),
                erc20s=erc20s,
            )

    async def _rpc_call(self, fn: Any, *args: Any) -> Any:
        last_error: Exception | None = None
        for attempt in range(len(RETRY_DELAYS) + 1):
            try:
                return await fn(*args)
            except Exception as exc:
                last_error = exc
                if attempt == len(RETRY_DELAYS):
                    raise RpcFailure(str(exc)) from exc
                await asyncio.sleep(RETRY_DELAYS[attempt])
        raise RpcFailure(str(last_error))

    async def _first_seen_block(self, config: ChainConfig, address: str) -> int:
        data = await self._explorer_get(
            config,
            {
                "module": "account",
                "action": "txlist",
                "address": address,
                "startblock": "0",
                "page": "1",
                "offset": "1",
                "sort": "asc",
            },
        )
        result = data.get("result", [])
        if not result:
            return 0
        return int(result[0].get("blockNumber") or 0)

    async def _erc20_holdings(
        self, config: ChainConfig, address: str
    ) -> list[Erc20HoldingModel]:
        holdings: list[Erc20HoldingModel] = []
        for token in ERC20_WHITELIST.get(config.chain_id, ()):
            data = await self._explorer_get(
                config,
                {
                    "module": "account",
                    "action": "tokenbalance",
                    "contractaddress": token,
                    "address": address,
                    "tag": "latest",
                },
            )
            balance = int(data.get("result") or 0)
            if balance > 0:
                holdings.append(
                    Erc20HoldingModel(
                        token=token,
                        balance_wei=_u256_bytes(balance),
                        first_acquired_block=0,
                    )
                )
        return holdings

    async def _explorer_get(
        self, config: ChainConfig, params: dict[str, str]
    ) -> dict[str, Any]:
        if config.explorer_api is None:
            raise ExplorerApiFailure("missing explorer api")
        params = dict(params)
        params["chainid"] = str(config.chain_id)
        if config.etherscan_api_key_env:
            api_key = os.getenv(config.etherscan_api_key_env)
            if api_key:
                params["apikey"] = api_key

        last_error: Exception | None = None
        for attempt in range(len(RETRY_DELAYS) + 1):
            try:
                resp = await self.http.get(config.explorer_api, params=params)
                if resp.status_code == 429:
                    raise RateLimited("explorer rate limited")
                resp.raise_for_status()
                data = resp.json()
                message = str(data.get("message", ""))
                result = data.get("result")
                if data.get("status") == "0" and result not in ([], "0", 0):
                    if "rate limit" in message.lower():
                        raise RateLimited(message)
                    raise ExplorerApiFailure(message)
                return data
            except RateLimited:
                if attempt == len(RETRY_DELAYS):
                    raise
                await asyncio.sleep(RETRY_DELAYS[attempt])
            except Exception as exc:
                last_error = exc
                if attempt == len(RETRY_DELAYS):
                    raise ExplorerApiFailure(str(exc)) from exc
                await asyncio.sleep(RETRY_DELAYS[attempt])
        raise ExplorerApiFailure(str(last_error))

    async def _holding_days(self, client: Any, first_seen_block: int) -> int:
        if first_seen_block == 0:
            return 0
        try:
            block = await self._rpc_call(client.eth.get_block, first_seen_block)
        except RpcFailure:
            return 0
        timestamp = int(block.get("timestamp", 0))
        if timestamp == 0:
            return 0
        return max(0, int((time.time_ns() - timestamp * 1_000_000_000) / DAY_NS))

    async def _ens_name(self, client: Any, chain_id: int, address: str) -> str | None:
        if chain_id != 1:
            return None
        try:
            ens = getattr(client, "ens", None)
            if ens is None:
                return None
            name = ens.name(address)
            if hasattr(name, "__await__"):
                return await name
            return name
        except Exception:
            return None


def _u256_bytes(value: int) -> bytes:
    return value.to_bytes(32, "big")
