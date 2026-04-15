#!/usr/bin/env python3
"""TEE internal evaluation viewer — demo/presentation only.

Visualizes what happens inside the TEE during investor evaluation.
In production, this process is completely opaque. This script exists
solely to demonstrate the privacy architecture.

Usage:
    # Real LLM (requires NEAR AI API key in tee/inference/.env)
    python scripts/demo/tee_viewer.py --policy-id 2 --investor alice.testnet

    # Mock mode (no network needed)
    python scripts/demo/tee_viewer.py --policy-id 2 --investor alice.testnet --mock
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time

# Add TEE source to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "tee", "inference", "src"))

from schemas import (
    AggregatedSignalModel,
    EvmWalletSignalModel,
    GithubSignalModel,
    NearWalletSignalModel,
)


# ── Display helpers ──

def header(text: str) -> None:
    print(f"\n\033[1;36m{text}\033[0m")


def step(num: int, text: str) -> None:
    print(f"\n\033[1;33m  Step {num}.\033[0m {text}")


def info(text: str) -> None:
    print(f"  \033[90m{text}\033[0m")


def ok(text: str) -> None:
    print(f"  \033[32m✓\033[0m {text}")


def fail(text: str) -> None:
    print(f"  \033[31m✗\033[0m {text}")


def bold(text: str) -> None:
    print(f"\033[1m{text}\033[0m")


def pause(seconds: float = 1.0) -> None:
    """Dramatic pause for presentation."""
    time.sleep(seconds)


# ── Mock signals (since we're not actually connecting wallets) ──

def build_mock_signals() -> AggregatedSignalModel:
    return AggregatedSignalModel(
        near=[
            NearWalletSignalModel(
                account_id="demo.testnet",
                first_seen_block=100,
                holding_days=245,
                total_txs=89,
                native_balance=10**24,
                fts=[],
                dao_votes=[
                    {"dao": "dao1.sputnik-dao.near", "proposal_id": 1, "vote": "Approve", "timestamp": 0},
                    {"dao": "dao1.sputnik-dao.near", "proposal_id": 5, "vote": "Approve", "timestamp": 0},
                    {"dao": "dao2.sputnik-dao.near", "proposal_id": 3, "vote": "Approve", "timestamp": 0},
                    {"dao": "dao2.sputnik-dao.near", "proposal_id": 7, "vote": "Approve", "timestamp": 0},
                    {"dao": "dao3.sputnik-dao.near", "proposal_id": 2, "vote": "Reject", "timestamp": 0},
                    {"dao": "dao3.sputnik-dao.near", "proposal_id": 8, "vote": "Approve", "timestamp": 0},
                    {"dao": "dao3.sputnik-dao.near", "proposal_id": 12, "vote": "Approve", "timestamp": 0},
                ],
            ),
        ],
        evm=[
            EvmWalletSignalModel(
                chain_id=1,
                address="0x1234567890abcdef1234567890abcdef12345678",
                first_seen_block=15000000,
                holding_days=310,
                tx_count=94,
                native_balance_wei=b"\x00" * 32,
                erc20s=[],
            ),
        ],
        github=GithubSignalModel.from_login(
            login="demo-dev",
            public_repo_count=8,
            contributions_last_year=42,
            account_age_days=730,
            primary_languages=["Rust", "TypeScript"],
        ),
        partial=False,
        collection_errors=[],
    )


async def run_demo(policy_nl: str, investor: str, use_mock: bool) -> None:
    print()
    bold("🔒 TEE Secure Environment")
    print("══════════════════════════════════════════════════")
    pause(0.5)

    # ── Step 1: Policy ──
    step(1, "Loading policy criteria")
    pause(0.5)
    info(f"Policy: \"{policy_nl[:80]}...\"")
    pause(0.3)

    # ── Step 2: Signals ──
    step(2, "Collecting on-chain signals")
    pause(0.8)

    signals = build_mock_signals()
    summary = signals.anon_summary()

    info(f"NEAR wallets: {summary['near_wallet_count']}  |  "
         f"EVM wallets: {summary['evm_wallet_count']}  |  "
         f"GitHub: {'yes' if summary['github_contribs'] > 0 else 'no'}")
    info(f"Avg holding days: {summary['avg_holding_days']}  |  "
         f"DAO votes: {summary['dao_votes']}  |  "
         f"Total TXs: {summary['total_tx_count']}")
    pause(0.5)

    # ── Step 3: Structurize ──
    step(3, "LLM generating evaluation criteria")
    pause(0.5)

    if use_mock:
        from mock_llm import MockLlmClient
        llm = MockLlmClient()
    else:
        from nearai_client import NearAIClient
        from dotenv import load_dotenv
        env_path = os.path.join(os.path.dirname(__file__), "..", "..", "tee", "inference", ".env")
        load_dotenv(env_path)
        llm = NearAIClient(
            api_key=os.getenv("NEAR_AI_API_KEY", ""),
            base_url=os.getenv("NEAR_AI_BASE_URL", "https://api.near.ai/v1"),
            model=os.getenv("NEAR_AI_MODEL", "deepseek-ai/DeepSeek-V3.1"),
        )

    rules = await llm.structurize(policy_nl)

    print()
    for i, c in enumerate(rules.criteria):
        pause(0.3)
        info(f"  {i + 1}. \"{c}\"")

    pause(0.5)

    # ── Step 4: Judge ──
    step(4, "Evaluating investor against criteria")
    pause(0.8)

    self_intro = "Long-term DeFi participant with DAO governance experience across multiple chains."
    result = await llm.judge(rules, signals, self_intro)

    print()
    for c in result.criteria:
        pause(0.4)
        if c.passed:
            ok(c.description)
        else:
            fail(c.description)

    passed = sum(1 for c in result.criteria if c.passed)
    total = len(result.criteria)

    pause(0.5)

    # ── Step 5: Result ──
    print()
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    if result.verdict == "Eligible":
        print(f"  \033[1;32mVerdict: Eligible ({passed}/{total} criteria passed)\033[0m")
    else:
        print(f"  \033[1;31mVerdict: Ineligible ({passed}/{total} criteria passed)\033[0m")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    pause(0.5)

    # ── Step 6: What exits the TEE ──
    step(5, "Generating outputs")
    pause(0.3)
    info(f"CriteriaResults: [{', '.join('1' if c.passed else '0' for c in result.criteria)}]")
    info("TEE signature: secp256k1 ECDSA over payload_hash")
    info("ZK circuit input: payload_hash_limbs + criteria array")
    pause(0.3)

    print()
    bold("🔐 → ZK proof generated: only \"eligible/ineligible\" bit exits TEE")
    print()
    print("  \033[33m⚠️  Everything above stays inside the TEE — never exposed\033[0m")
    print(f"     Foundation sees: \"1 {result.verdict.lower()} subscriber\"")
    print(f"     Investor sees:  \"{result.verdict}\"")
    print("     On-chain:       ZK proof only")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="TEE internal evaluation viewer (demo only)")
    parser.add_argument("--policy-id", type=int, default=2, help="Policy ID to evaluate against")
    parser.add_argument("--investor", default="alice.testnet", help="Investor account")
    parser.add_argument("--mock", action="store_true", help="Use mock LLM (no network)")
    parser.add_argument("--policy-text", default=None, help="Override policy natural language")
    args = parser.parse_args()

    policy_nl = args.policy_text or (
        "Prefer investors holding tokens for at least 90 days with active DAO governance "
        "participation. Multi-chain activity and GitHub contributions are weighted positively. "
        "Wallet age should exceed 180 days to demonstrate long-term commitment."
    )

    # Add scripts/demo to path for mock_llm import
    sys.path.insert(0, os.path.dirname(__file__))

    asyncio.run(run_demo(policy_nl, args.investor, args.mock))


if __name__ == "__main__":
    main()
