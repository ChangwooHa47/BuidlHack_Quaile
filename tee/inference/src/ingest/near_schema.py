from __future__ import annotations

from typing import Any, Literal, TypedDict


class JsonRpcRequest(TypedDict):
    jsonrpc: Literal["2.0"]
    id: str
    method: str
    params: dict[str, Any]


class JsonRpcError(TypedDict, total=False):
    code: int
    message: str
    name: str
    cause: dict[str, Any]
    data: Any


class JsonRpcResponse(TypedDict, total=False):
    jsonrpc: str
    id: str
    result: dict[str, Any]
    error: JsonRpcError


class AccountViewResult(TypedDict, total=False):
    amount: str
    locked: str
    code_hash: str
    storage_usage: int
    storage_paid_at: int
    block_height: int
    block_hash: str


class AccessKeyListResult(TypedDict, total=False):
    keys: list[dict[str, Any]]
    block_height: int
    block_hash: str


class CallFunctionResult(TypedDict, total=False):
    result: list[int]
    logs: list[str]
    block_height: int
    block_hash: str


class NearBlocksTxn(TypedDict, total=False):
    block_height: int
    block_timestamp: int | str
    block_time: int | str
    created_at: int | str


class NearBlocksTxnsOnlyResponse(TypedDict, total=False):
    txns: list[NearBlocksTxn]
    transactions: list[NearBlocksTxn]
    total: int
    count: int


class NearBlocksToken(TypedDict, total=False):
    contract: str
    contract_id: str
    token_id: str
    balance: str
    amount: str
    first_acquired: int


class NearBlocksTokensResponse(TypedDict, total=False):
    tokens: list[NearBlocksToken]
