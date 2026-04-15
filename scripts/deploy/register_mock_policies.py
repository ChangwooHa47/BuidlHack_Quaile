#!/usr/bin/env python3
"""Register 8 fictional projects with staggered time windows.

Over 3 days the policies will naturally transition:
- 0,1: Upcoming (starts in 2-3 days)
- 2,3,4: Subscribing (starts in 1 min, ends 1-3 days)
- 5,6: Live after ~1h
- 7: Live after ~1h, closeable after ~3h
"""
import json
import subprocess
import time

NOW_NS = int(time.time() * 1e9)
MIN = 60 * 10**9
HOUR = 3600 * 10**9
DAY = 24 * HOUR

MOCK_FT = "mockft.rockettheraccon.testnet"
POLICY_REGISTRY = "policy.rockettheraccon.testnet"
OWNER = "rockettheraccon.testnet"
PLACEHOLDER_LOGO = "https://placehold.co/128/1a1a2e/c8ff00?text="
VALID_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3ocirgf5de2yjvei"

POLICIES = [
    {
        "name": "Nexora",
        "ticker": "NXR",
        "description": "AI-powered cross-chain liquidity aggregation protocol enabling optimal swap routing across 15+ blockchains with MEV protection.",
        "chain": "SOL",
        "natural_language": "Active DeFi traders with at least 100 cross-chain swaps in the past 6 months. Must hold governance tokens from at least 2 major DEX protocols. Priority for MEV researchers and liquidity providers.",
        "start_offset": 2 * DAY,
        "sub_duration": 5 * DAY,
        "live_duration": 7 * DAY,
        "allocation": "8000000000000000000000000000",
        "price": "500000000000000000000000",
    },
    {
        "name": "Vaultis",
        "ticker": "VLT",
        "description": "Non-custodial institutional-grade vault infrastructure for DAOs and treasuries with programmable multi-sig and streaming payments.",
        "chain": "ETH",
        "natural_language": "DAO treasury managers and multi-sig operators with verifiable on-chain governance participation. Must have managed a treasury exceeding 50k USD equivalent. Active proposal creation preferred.",
        "start_offset": 3 * DAY,
        "sub_duration": 4 * DAY,
        "live_duration": 5 * DAY,
        "allocation": "5000000000000000000000000000",
        "price": "800000000000000000000000",
    },
    {
        "name": "Drift Layer",
        "ticker": "DRFT",
        "description": "Modular data availability layer optimized for gaming rollups, enabling sub-100ms state commitments with zk-proof verification.",
        "chain": "NEAR",
        "natural_language": "Blockchain game developers and rollup operators with deployed smart contracts on any L2. Must demonstrate active development through GitHub contributions in the past 3 months. Hackathon winners get bonus evaluation.",
        "start_offset": 1 * MIN,
        "sub_duration": 2 * DAY,
        "live_duration": 1 * DAY,
        "allocation": "12000000000000000000000000000",
        "price": "200000000000000000000000",
    },
    {
        "name": "Pulsara",
        "ticker": "PLS",
        "description": "Decentralized social trading platform where users can mirror verified on-chain strategies with transparent performance tracking.",
        "chain": "BASE",
        "natural_language": "Social traders and strategy curators with at least 90 days of on-chain trading history. Must have positive PnL over rolling 60-day window. No wash trading detected. Community engagement weighted.",
        "start_offset": 1 * MIN,
        "sub_duration": 3 * DAY,
        "live_duration": 2 * DAY,
        "allocation": "6000000000000000000000000000",
        "price": "400000000000000000000000",
    },
    {
        "name": "Kairos Finance",
        "ticker": "KRS",
        "description": "Time-weighted lending protocol with dynamic interest rates that adapt to market volatility using on-chain oracle feeds.",
        "chain": "ARB",
        "natural_language": "Lending protocol users with clean borrowing history across at least 2 money markets. No liquidation events in past 12 months. Must have supplied liquidity for minimum 120 consecutive days.",
        "start_offset": 1 * MIN,
        "sub_duration": 1 * DAY,
        "live_duration": 2 * DAY,
        "allocation": "4000000000000000000000000000",
        "price": "600000000000000000000000",
    },
    {
        "name": "Synthwave",
        "ticker": "SYNTH",
        "description": "Fully on-chain synthetic asset protocol enabling exposure to real-world commodities and indices through decentralized price oracles.",
        "chain": "SOL",
        "natural_language": "DeFi power users with experience in synthetic asset protocols or perpetual futures. Must have interacted with at least 3 DeFi protocols in the past 6 months with total volume exceeding 10k USD.",
        "start_offset": 1 * MIN,
        "sub_duration": 1 * HOUR + 4 * MIN,
        "live_duration": 3 * DAY,
        "allocation": "7000000000000000000000000000",
        "price": "350000000000000000000000",
    },
    {
        "name": "Ecliptic",
        "ticker": "ECLP",
        "description": "Privacy-preserving identity layer using zero-knowledge proofs for compliant DeFi participation without revealing personal data.",
        "chain": "ETH",
        "natural_language": "Privacy tech researchers and ZK protocol contributors with verifiable open-source contributions. Must have deployed or audited at least one ZK circuit. Academic publications in cryptography are a plus.",
        "start_offset": 1 * MIN,
        "sub_duration": 1 * HOUR + 9 * MIN,
        "live_duration": 2 * DAY,
        "allocation": "3000000000000000000000000000",
        "price": "900000000000000000000000",
    },
    {
        "name": "Arcline",
        "ticker": "ARC",
        "description": "Developer toolchain for building composable smart contracts with built-in formal verification and automated security auditing.",
        "chain": "NEAR",
        "natural_language": "Smart contract developers with at least 5 verified deployments across any EVM or non-EVM chain. Must demonstrate consistent GitHub activity over 6 months. Bug bounty participation and audit experience preferred.",
        "start_offset": 1 * MIN,
        "sub_duration": 1 * HOUR + 14 * MIN,
        "live_duration": 2 * HOUR,
        "allocation": "2500000000000000000000000000",
        "price": "700000000000000000000000",
    },
]


def register(policy: dict, index: int) -> None:
    start = NOW_NS + policy["start_offset"]
    end = start + policy["sub_duration"]
    live_end = end + policy["live_duration"]

    args = json.dumps({
        "name": policy["name"],
        "ticker": policy["ticker"],
        "description": policy["description"],
        "chain": policy["chain"],
        "logo_url": PLACEHOLDER_LOGO + policy["ticker"],
        "natural_language": policy["natural_language"],
        "ipfs_cid": VALID_CID,
        "sale_config": {
            "token_contract": MOCK_FT,
            "total_allocation": policy["allocation"],
            "price_per_token": policy["price"],
            "payment_token": "Near",
            "subscription_start": start,
            "subscription_end": end,
            "live_end": live_end,
        },
    })

    print(f"\n=== Policy {index}: {policy['name']} ({policy['ticker']}) — {policy['chain']} ===")

    result = subprocess.run(
        [
            "near", "contract", "call-function", "as-transaction",
            POLICY_REGISTRY, "register_policy",
            "json-args", args,
            "prepaid-gas", "30 Tgas",
            "attached-deposit", "0 NEAR",
            "sign-as", OWNER,
            "network-config", "testnet",
            "sign-with-keychain", "send",
        ],
        capture_output=True, text=True, timeout=30,
    )

    if "Error" in result.stderr or "Error" in result.stdout:
        err = result.stderr or result.stdout
        print(f"  FAILED: {err.strip()[-200:]}")
    else:
        print(f"  OK")


def main() -> None:
    print(f"Registering {len(POLICIES)} fictional projects...")
    print(f"NOW: {time.strftime('%Y-%m-%d %H:%M:%S')}")

    for i, p in enumerate(POLICIES):
        register(p, i)

    print("\n=== Done ===")
    print("Wait 1 minute, then run:")
    print("  python3 scripts/deploy/advance_policies.py")


if __name__ == "__main__":
    main()
