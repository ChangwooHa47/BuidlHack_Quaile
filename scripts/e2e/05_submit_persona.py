#!/usr/bin/env python3
"""Submit persona to TEE and extract ZK circuit input.

Usage:
    python3 05_submit_persona.py \
        --tee-url http://localhost:8080 \
        --investor alice.testnet \
        --policy-id 1 \
        --out-dir ./out
"""
import argparse
import json
import os
import time
from pathlib import Path

import httpx


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tee-url", required=True)
    parser.add_argument("--investor", required=True)
    parser.add_argument("--policy-id", type=int, required=True)
    parser.add_argument("--out-dir", default="./out")
    args = parser.parse_args()

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    now_ns = time.time_ns()
    nonce_hex = os.urandom(32).hex()

    persona = {
        "near_account": args.investor,
        "policy_id": args.policy_id,
        "wallets": {"near": [], "evm": []},
        "self_intro": "Long-term NEAR ecosystem participant with DeFi experience.",
        "github_oauth_token": None,
        "nonce": "0x" + nonce_hex,
        "client_timestamp": now_ns,
    }

    print(f"  Calling TEE {args.tee_url}/v1/attest ...")
    resp = httpx.post(
        f"{args.tee_url}/v1/attest",
        json=persona,
        timeout=30.0,
    )

    if resp.status_code != 200:
        print(f"  TEE error {resp.status_code}: {resp.text}")
        raise SystemExit(1)

    data = resp.json()

    # Save bundle
    bundle = data["bundle"]
    (out / "bundle.json").write_text(json.dumps(bundle, indent=2))
    print(f"  Saved bundle to {out / 'bundle.json'}")

    # Check verdict
    verdict = bundle["payload"]["verdict"]
    if verdict != "Eligible":
        print(f"  TEE returned verdict={verdict} — investor is not eligible.")
        raise SystemExit(1)

    # Save ZK input
    zk_input = data["zk_input"]
    # Verify all active criteria pass (prerequisite for valid ZK proof)
    count = int(zk_input["criteria_count"])
    active = zk_input["criteria"][:count]
    if not all(c == 1 for c in active):
        print(f"  WARNING: not all criteria pass: {active}")
        raise SystemExit(1)

    (out / "zk_input.json").write_text(json.dumps(zk_input))
    print(f"  Saved zk_input to {out / 'zk_input.json'}")
    print(f"  criteria_count: {zk_input['criteria_count']}")
    print(f"  criteria: {zk_input['criteria']}")

    # Save tee_report
    (out / "tee_report.txt").write_text(data.get("tee_report", ""))
    print(f"  Saved tee_report to {out / 'tee_report.txt'}")


if __name__ == "__main__":
    main()
