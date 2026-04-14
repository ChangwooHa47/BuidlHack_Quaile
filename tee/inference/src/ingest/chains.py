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
        "https://api.etherscan.io/api",
        "ETHERSCAN_API_KEY",
    ),
    8453: ChainConfig(
        8453,
        "base",
        os.getenv("RPC_BASE"),
        "https://api.basescan.org/api",
        "BASESCAN_API_KEY",
    ),
    42161: ChainConfig(
        42161,
        "arbitrum",
        os.getenv("RPC_ARBITRUM"),
        "https://api.arbiscan.io/api",
        "ARBISCAN_API_KEY",
    ),
    10: ChainConfig(
        10,
        "optimism",
        os.getenv("RPC_OPTIMISM"),
        "https://api-optimistic.etherscan.io/api",
        "OPTIMISM_API_KEY",
    ),
    137: ChainConfig(
        137,
        "polygon",
        os.getenv("RPC_POLYGON"),
        "https://api.polygonscan.com/api",
        "POLYGONSCAN_API_KEY",
    ),
    56: ChainConfig(
        56,
        "bsc",
        os.getenv("RPC_BSC"),
        "https://api.bscscan.com/api",
        "BSCSCAN_API_KEY",
    ),
}
