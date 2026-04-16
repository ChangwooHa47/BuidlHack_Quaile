#!/usr/bin/env python3
"""TEE internal evaluation viewer — demo/presentation only.

Visualizes what happens inside the TEE during investor evaluation.
In production, this process is completely opaque.

Usage:
    # Real LLM + real on-chain data
    python scripts/demo/tee_viewer.py \
        --evm-address 0x4606435057A755B9b696c29b0f6bBA9E72bF9B0E

    # Mock (no network)
    python scripts/demo/tee_viewer.py --mock
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "tee", "inference", "src"))

from schemas import (
    AggregatedSignalModel,
    EvmWalletProofModel,
    EvmWalletSignalModel,
    GithubSignalModel,
    NearWalletSignalModel,
)

# ── Display ──

def header(t: str) -> None: print(f"\n\033[1;36m{t}\033[0m")
def step(n: int, t: str) -> None: print(f"\n\033[1;33m  Step {n}.\033[0m {t}")
def info(t: str) -> None: print(f"  \033[90m{t}\033[0m")
def ok(t: str) -> None: print(f"  \033[32m✓\033[0m {t}")
def fail(t: str) -> None: print(f"  \033[31m✗\033[0m {t}")
def bold(t: str) -> None: print(f"\033[1m{t}\033[0m")
def pause(s: float = 0.8) -> None: time.sleep(s)


# ── Mock signals ──

def build_mock_signals() -> AggregatedSignalModel:
    return AggregatedSignalModel(
        near=[NearWalletSignalModel(
            account_id="demo.testnet", first_seen_block=100, holding_days=245,
            total_txs=89, native_balance=10**24, fts=[],
            dao_votes=[
                {"dao": "dao1.sputnik-dao.near", "proposal_id": i, "vote": "Approve", "timestamp": 0}
                for i in range(7)
            ],
        )],
        evm=[EvmWalletSignalModel(
            chain_id=1, address="0x1234567890abcdef1234567890abcdef12345678",
            first_seen_block=15000000, holding_days=310, tx_count=94,
            native_balance_wei=b"\x00" * 32, erc20s=[],
        )],
        github=GithubSignalModel.from_login("demo-dev", 8, 42, 730, ["Rust", "TypeScript"]),
        partial=False, collection_errors=[],
    )


# ── Real data collection ──

async def collect_real_signals(evm_address: str) -> AggregatedSignalModel:
    """Collect real on-chain data via EVM ingestor."""
    from ingest.chains import SUPPORTED_CHAINS
    from ingest.evm import EvmIngestor

    from ingest.chains import ChainConfig
    chains_with_rpc = {
        1: ChainConfig(1, "ethereum", "https://eth.drpc.org", "https://api.etherscan.io/v2/api", "ETHERSCAN_API_KEY"),
        42161: ChainConfig(42161, "arbitrum", "https://arb1.arbitrum.io/rpc", "https://api.etherscan.io/v2/api", "ETHERSCAN_API_KEY"),
    }

    ingestor = EvmIngestor(chains_with_rpc)

    # Create a minimal proof entry (no real signature — just for data collection)
    proofs = [EvmWalletProofModel(
        chain_id=cid, address=evm_address,
        signature="0x" + "00" * 65, message="", timestamp=time.time_ns(),
    ) for cid in chains_with_rpc]

    evm_signals, evm_errors = await ingestor.collect(proofs)

    for err in evm_errors:
        info(f"⚠ {err}")

    return AggregatedSignalModel(
        near=[], evm=evm_signals, github=None,
        partial=bool(evm_errors), collection_errors=evm_errors,
    )


async def run_demo(
    policy_nl: str,
    investor: str,
    evm_address: str | None,
    self_intro: str,
    use_mock: bool,
) -> None:
    # Load env early — needed for ETHERSCAN_API_KEY and LLM keys
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "tee", "inference", ".env"))
    except ImportError:
        pass

    print()
    bold("🔒 TEE Secure Environment")
    print("══════════════════════════════════════════════════")
    pause(0.3)

    # ── Step 1: Policy ──
    step(1, "Loading policy criteria")
    pause(0.3)
    # Show full criteria, line by line
    for line in policy_nl.split("\n"):
        line = line.strip()
        if line:
            info(line)
    pause(0.3)

    # ── Step 2: Signals ──
    step(2, "Collecting on-chain signals")

    if use_mock or not evm_address:
        info("(using mock signals)")
        signals = build_mock_signals()
    else:
        info(f"EVM address: {evm_address}")
        try:
            signals = await collect_real_signals(evm_address)
        except Exception as e:
            info(f"⚠ Data collection failed: {e}")
            info("Falling back to mock signals")
            signals = build_mock_signals()

    pause(0.3)
    summary = signals.anon_summary()
    info(f"NEAR wallets: {summary['near_wallet_count']}  |  "
         f"EVM wallets: {summary['evm_wallet_count']}  |  "
         f"GitHub: {'yes' if summary['github_contribs'] > 0 else 'no'}")
    info(f"Avg holding days: {summary['avg_holding_days']}  |  "
         f"DAO votes: {summary['dao_votes']}  |  "
         f"Total TXs: {summary['total_tx_count']}")

    if signals.evm:
        for w in signals.evm:
            info(f"  Chain {w.chain_id}: {w.address[:10]}...{w.address[-4:]}  "
                 f"holding={w.holding_days}d  txs={w.tx_count}")
    pause(0.3)

    # ── Step 3: Structurize ──
    step(3, "LLM generating evaluation criteria")
    pause(0.3)

    if use_mock:
        sys.path.insert(0, os.path.dirname(__file__))
        from mock_llm import MockLlmClient
        llm = MockLlmClient()
    else:
        from nearai_client import NearAIClient
        api_key = os.getenv("NEAR_AI_API_KEY", "")
        if not api_key:
            print("\033[31mError: NEAR_AI_API_KEY not set. Use --mock or set in tee/inference/.env\033[0m")
            return
        llm = NearAIClient(
            api_key=api_key,
            base_url=os.getenv("NEAR_AI_BASE_URL", "https://api.near.ai/v1"),
            model=os.getenv("NEAR_AI_MODEL", "deepseek-ai/DeepSeek-V3.1"),
        )

    try:
        rules = await llm.structurize(policy_nl)
    except Exception as exc:
        print(f"\n\033[31mLLM structurize failed: {exc}\033[0m")
        print("\033[31mTry --mock for offline demo.\033[0m")
        return

    print()
    for i, c in enumerate(rules.criteria):
        pause(0.2)
        info(f"  {i + 1}. \"{c}\"")
    pause(0.3)

    # ── Step 4: Judge ──
    step(4, "Evaluating investor against criteria")
    pause(0.3)
    info(f"Self intro: \"{self_intro[:60]}...\"")
    pause(0.3)

    try:
        result = await llm.judge(rules, signals, self_intro)
    except Exception as exc:
        print(f"\n\033[31mLLM judge failed: {exc}\033[0m")
        return

    print()
    for c in result.criteria:
        pause(0.3)
        if c.passed:
            ok(c.description)
        else:
            fail(c.description)

    passed = sum(1 for c in result.criteria if c.passed)
    total = len(result.criteria)
    pause(0.3)

    # ── Result ──
    print()
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    if result.verdict == "Eligible":
        print(f"  \033[1;32mVerdict: Eligible ({passed}/{total} criteria passed)\033[0m")
    else:
        print(f"  \033[1;31mVerdict: Ineligible ({passed}/{total} criteria passed)\033[0m")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    pause(0.3)

    if result.rationale:
        info(f"Rationale: {result.rationale}")

    # ── Outputs ──
    step(5, "Generating outputs")
    pause(0.2)
    info(f"CriteriaResults: [{', '.join('1' if c.passed else '0' for c in result.criteria)}]")
    info("TEE signature: secp256k1 ECDSA over payload_hash")
    info("ZK circuit input: payload_hash_limbs + criteria array")

    print()
    bold("🔐 → ZK proof generated: only \"eligible/ineligible\" bit exits TEE")
    print()
    print("  \033[33m⚠️  Everything above stays inside the TEE — never exposed\033[0m")
    print(f"     Foundation sees: \"1 {result.verdict.lower()} subscriber\"")
    print(f"     Investor sees:  \"{result.verdict}\"")
    print("     On-chain:       ZK proof only")
    print()


DEFAULT_SELF_INTRO = (
    "I have been actively participating in the NEAR and Ethereum ecosystems "
    "for over 2 years. I provide liquidity on Ref Finance and have voted in "
    "multiple DAO proposals on Sputnik. I also hold positions across Ethereum, "
    "Base, and Arbitrum with a focus on long-term DeFi protocols."
)

DEFAULT_POLICY = (
    "Evaluation criteria for this IDO:\n"
    "1. Wallet must have at least 1 on-chain transaction on Ethereum mainnet\n"
    "2. Wallet age must exceed 90 days (first transaction older than 90 days)\n"
    "3. Total transaction count across all chains must exceed 10\n"
    "4. Must have participated in DAO governance voting at least 3 times\n"
    "5. Must have deployed a smart contract on any EVM chain"
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="TEE internal evaluation viewer (demo only)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Real LLM + real on-chain data
  %(prog)s --evm-address 0x4606435057A755B9b696c29b0f6bBA9E72bF9B0E

  # Mock mode (no network)
  %(prog)s --mock

  # Custom policy criteria
  %(prog)s --evm-address 0x... --policy-text "Must hold tokens > 1 year"

  # Custom self-introduction
  %(prog)s --evm-address 0x... --self-intro "I am a DeFi researcher..."
""",
    )
    parser.add_argument("--evm-address", default=None,
                        help="EVM address for real on-chain data collection")
    parser.add_argument("--self-intro", default=DEFAULT_SELF_INTRO,
                        help="Investor self-introduction text")
    parser.add_argument("--policy-text", default=DEFAULT_POLICY,
                        help="Policy natural language criteria")
    parser.add_argument("--mock", action="store_true",
                        help="Use mock LLM + mock signals (no network)")
    args = parser.parse_args()

    sys.path.insert(0, os.path.dirname(__file__))
    asyncio.run(run_demo(args.policy_text, "investor", args.evm_address, args.self_intro, args.mock))


if __name__ == "__main__":
    main()
