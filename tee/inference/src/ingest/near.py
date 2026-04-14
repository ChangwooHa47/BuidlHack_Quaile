from __future__ import annotations

import asyncio
import base64
import json
import time
from typing import Any

import httpx

from schemas import (
    DaoVoteModel,
    FtHoldingModel,
    NearWalletProofModel,
    NearWalletSignalModel,
)

from .near_schema import (
    AccountViewResult,
    CallFunctionResult,
    JsonRpcResponse,
    NearBlocksToken,
    NearBlocksTxn,
)

NEARBLOCKS_API = "https://api.nearblocks.io/v1"
DAO_ACCOUNT = "dao.sputnik-v2.near"
RETRY_DELAYS = (0.25, 0.5, 1.0, 2.0, 4.0)
DAY_NS = 86_400 * 1_000_000_000


class NearIngestError(Exception):
    pass


class NearRpcTimeout(NearIngestError):
    pass


class NearRpcRateLimit(NearIngestError):
    pass


class NearWalletNotFound(NearIngestError):
    pass


class NearIndexerDown(NearIngestError):
    pass


class NearIngestor:
    def __init__(self, rpc_url: str, archival_rpc_url: str, timeout: float = 10.0):
        self.rpc = rpc_url
        self.archival = archival_rpc_url
        self.client = httpx.AsyncClient(timeout=timeout)
        self._wallet_sem = asyncio.Semaphore(4)

    async def collect(
        self, proofs: list[NearWalletProofModel]
    ) -> list[NearWalletSignalModel]:
        results = await asyncio.gather(
            *(self._collect_one(p) for p in proofs),
            return_exceptions=True,
        )
        return [r for r in results if isinstance(r, NearWalletSignalModel)]

    async def _collect_one(self, proof: NearWalletProofModel) -> NearWalletSignalModel:
        async with self._wallet_sem:
            account_id = proof.account_id
            account = await self._view_account(account_id)

            try:
                first_seen_block, holding_days, total_txs = await self._first_seen(
                    account_id
                )
            except NearIndexerDown:
                first_seen_block = 0
                holding_days = 0
                total_txs = 0

            await self._view_access_key_list(account_id)
            fts = await self._ft_holdings(account_id)
            dao_votes = await self._dao_votes(account_id)

            return NearWalletSignalModel(
                account_id=account_id,
                first_seen_block=first_seen_block,
                holding_days=holding_days,
                total_txs=total_txs,
                native_balance=int(account.get("amount", "0")),
                fts=fts,
                dao_votes=dao_votes,
            )

    async def _view_account(self, account_id: str) -> AccountViewResult:
        result = await self._rpc_query(
            self.rpc,
            {
                "request_type": "view_account",
                "finality": "final",
                "account_id": account_id,
            },
        )
        return result

    async def _view_access_key_list(self, account_id: str) -> dict[str, Any]:
        return await self._rpc_query(
            self.rpc,
            {
                "request_type": "view_access_key_list",
                "finality": "final",
                "account_id": account_id,
            },
        )

    async def _rpc_query(self, rpc_url: str, params: dict[str, Any]) -> dict[str, Any]:
        body = {
            "jsonrpc": "2.0",
            "id": "buidl-near-ai",
            "method": "query",
            "params": params,
        }
        resp = await self._request("POST", rpc_url, json=body)
        data: JsonRpcResponse = resp.json()
        if "error" in data:
            error = data["error"]
            raw = json.dumps(error)
            if "UNKNOWN_ACCOUNT" in raw or "does not exist" in raw:
                raise NearWalletNotFound(error.get("message", "account not found"))
            raise NearIngestError(error.get("message", "NEAR RPC error"))
        return data.get("result", {})

    async def _request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        last_error: Exception | None = None
        for attempt in range(len(RETRY_DELAYS) + 1):
            try:
                resp = await self.client.request(method, url, **kwargs)
                if resp.status_code not in (401, 429, 500):
                    resp.raise_for_status()
                    return resp
                if attempt == len(RETRY_DELAYS):
                    if resp.status_code == 429:
                        raise NearRpcRateLimit("NEAR RPC rate limited")
                    raise NearIngestError(f"HTTP {resp.status_code}")
                await asyncio.sleep(RETRY_DELAYS[attempt])
            except httpx.TimeoutException as exc:
                last_error = exc
                if attempt == len(RETRY_DELAYS):
                    raise NearRpcTimeout(str(exc)) from exc
                await asyncio.sleep(RETRY_DELAYS[attempt])
            except httpx.HTTPStatusError as exc:
                last_error = exc
                if attempt == len(RETRY_DELAYS):
                    raise NearIngestError(str(exc)) from exc
                await asyncio.sleep(RETRY_DELAYS[attempt])
        raise NearIngestError(str(last_error))

    async def _first_seen(self, account_id: str) -> tuple[int, int, int]:
        url = (
            f"{NEARBLOCKS_API}/account/{account_id}/txns-only"
            "?order=asc&per_page=1"
        )
        try:
            resp = await self._request("GET", url)
            data = resp.json()
        except Exception as exc:
            raise NearIndexerDown(str(exc)) from exc

        txns: list[NearBlocksTxn] = data.get("txns") or data.get("transactions") or []
        total_txs = int(data.get("total") or data.get("count") or len(txns))
        if not txns:
            return 0, 0, total_txs

        txn = txns[0]
        first_seen_block = int(txn.get("block_height") or 0)
        timestamp_ns = _to_ns(
            txn.get("block_timestamp") or txn.get("block_time") or txn.get("created_at")
        )
        holding_days = 0
        if timestamp_ns:
            holding_days = max(0, int((time.time_ns() - timestamp_ns) / DAY_NS))
        return first_seen_block, holding_days, total_txs

    async def _ft_holdings(self, account_id: str) -> list[FtHoldingModel]:
        url = f"{NEARBLOCKS_API}/account/{account_id}/tokens"
        try:
            resp = await self._request("GET", url)
            raw_tokens: list[NearBlocksToken] = resp.json().get("tokens", [])
        except Exception:
            return []

        holdings: list[FtHoldingModel] = []
        for item in raw_tokens:
            token = (
                item.get("contract")
                or item.get("contract_id")
                or item.get("token_id")
            )
            balance = item.get("balance") or item.get("amount")
            if token is None or balance is None:
                continue
            holdings.append(
                FtHoldingModel(
                    token=token,
                    balance=int(balance),
                    first_acquired=int(item.get("first_acquired") or 0),
                )
            )
        return holdings

    async def _dao_votes(self, account_id: str) -> list[DaoVoteModel]:
        args = base64.b64encode(json.dumps({"from_index": 0, "limit": 50}).encode())
        try:
            result: CallFunctionResult = await self._rpc_query(
                self.archival,
                {
                    "request_type": "call_function",
                    "finality": "final",
                    "account_id": DAO_ACCOUNT,
                    "method_name": "get_proposals",
                    "args_base64": args.decode("ascii"),
                },
            )
            proposals = json.loads(bytes(result.get("result", [])).decode())
        except Exception:
            return []

        votes: list[DaoVoteModel] = []
        if not isinstance(proposals, list):
            return votes
        for proposal in proposals:
            if not isinstance(proposal, dict):
                continue
            proposal_votes = proposal.get("votes", {})
            if not isinstance(proposal_votes, dict) or account_id not in proposal_votes:
                continue
            votes.append(
                DaoVoteModel(
                    dao=DAO_ACCOUNT,
                    proposal_id=int(proposal.get("id") or 0),
                    vote=str(proposal_votes[account_id]),
                    timestamp=int(proposal.get("submission_time") or 0),
                )
            )
        return votes


def _to_ns(value: object) -> int:
    if value is None:
        return 0
    if isinstance(value, str) and not value.isdigit():
        return 0
    raw = int(value)
    if raw > 10**17:
        return raw
    if raw > 10**14:
        return raw * 1_000
    if raw > 10**11:
        return raw * 1_000_000
    return raw * 1_000_000_000
