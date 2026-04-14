from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class ChainConfig:
    chain_id: int
    name: str
    rpc: str | None
    explorer_api: str | None
    etherscan_api_key_env: str | None


SUPPORTED_CHAINS: dict[int, ChainConfig] = {
    1: ChainConfig(
        1,
        "ethereum",
        os.getenv("RPC_ETHEREUM"),
        "https://api.etherscan.io/v2/api",
        "ETHERSCAN_API_KEY",
    ),
    42161: ChainConfig(
        42161,
        "arbitrum",
        os.getenv("RPC_ARBITRUM"),
        "https://api.etherscan.io/v2/api",
        "ETHERSCAN_API_KEY",
    ),
    137: ChainConfig(
        137,
        "polygon",
        os.getenv("RPC_POLYGON"),
        "https://api.etherscan.io/v2/api",
        "ETHERSCAN_API_KEY",
    ),
}
