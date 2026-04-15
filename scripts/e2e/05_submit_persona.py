#!/usr/bin/env python3
"""Submit persona to TEE and extract ZK circuit input.

Usage:
    python3 05_submit_persona.py \
        --tee-url http://localhost:8080 \
        --investor alice.testnet \
        --policy-id 1 \
        --evm-address 0x4606435057A755B9b696c29b0f6bBA9E72bF9B0E \
        --out-dir ./out
"""
import argparse
import json
import os
import time
from pathlib import Path

import httpx

DEFAULT_EVM_ADDRESS = "0x4606435057A755B9b696c29b0f6bBA9E72bF9B0E"
DEFAULT_SELF_INTRO = (
    "I have been actively participating in the NEAR and Ethereum ecosystems "
    "for over 2 years. I provide liquidity on Ref Finance and have voted in "
    "multiple DAO proposals on Sputnik. I also hold positions across Ethereum, "
    "Base, and Arbitrum with a focus on long-term DeFi protocols."
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Submit persona to TEE")
    parser.add_argument("--tee-url", required=True)
    parser.add_argument("--investor", required=True)
    parser.add_argument("--policy-id", type=int, required=True)
    parser.add_argument("--evm-address", default=DEFAULT_EVM_ADDRESS,
                        help=f"EVM address for data collection (default: {DEFAULT_EVM_ADDRESS})")
    parser.add_argument("--self-intro", default=DEFAULT_SELF_INTRO,
                        help="Self introduction text")
    parser.add_argument("--out-dir", default="./out")
    args = parser.parse_args()

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    now_ns = time.time_ns()
    nonce_hex = os.urandom(32).hex()

    # Build EVM wallet entry — no signature (ownership verification skipped via env)
    evm_wallets = []
    if args.evm_address:
        evm_wallets.append({
            "chain_id": 1,
            "address": args.evm_address.lower(),
            "signature": "0x" + "00" * 65,  # dummy sig — verification skipped
            "message": "",
            "timestamp": now_ns,
        })

    persona = {
        "near_account": args.investor,
        "policy_id": args.policy_id,
        "wallets": {"near": [], "evm": evm_wallets},
        "self_intro": args.self_intro,
        "github_oauth_token": None,
        "nonce": "0x" + nonce_hex,
        "client_timestamp": now_ns,
    }

    print(f"  Calling TEE {args.tee_url}/v1/attest ...")
    print(f"  EVM address: {args.evm_address}")
    print(f"  Self intro: {args.self_intro[:60]}...")
    resp = httpx.post(
        f"{args.tee_url}/v1/attest",
        json=persona,
        timeout=60.0,
    )

    if resp.status_code != 200:
        print(f"  TEE error {resp.status_code}: {resp.text}")
        raise SystemExit(1)

    data = resp.json()

    # Check verdict
    bundle = data["bundle"]
    verdict = bundle["payload"]["verdict"]
    print(f"  Verdict: {verdict}")
    if verdict != "Eligible":
        print(f"  TEE returned verdict={verdict} — investor is not eligible.")
        # Still save for inspection

    # Save bundle
    (out / "bundle.json").write_text(json.dumps(bundle, indent=2))
    print(f"  Saved bundle to {out / 'bundle.json'}")

    # Save ZK input
    zk_input = data["zk_input"]
    count = int(zk_input["criteria_count"])
    active = zk_input["criteria"][:count]
    print(f"  criteria_count: {zk_input['criteria_count']}")
    print(f"  criteria: {zk_input['criteria']}")

    if verdict == "Eligible" and not all(c == 1 for c in active):
        print(f"  WARNING: verdict=Eligible but not all criteria pass: {active}")

    (out / "zk_input.json").write_text(json.dumps(zk_input))
    print(f"  Saved zk_input to {out / 'zk_input.json'}")

    # Save tee_report
    (out / "tee_report.txt").write_text(data.get("tee_report", ""))
    print(f"  Saved tee_report to {out / 'tee_report.txt'}")


if __name__ == "__main__":
    main()
