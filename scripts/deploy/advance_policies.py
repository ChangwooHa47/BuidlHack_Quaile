#!/usr/bin/env python3
"""Advance policies 2-7 from Upcoming to Subscribing.

Run this 1 minute after register_mock_policies.py.
Policies 0,1 stay Upcoming (their subscription_start is in 2-3 days).
Policies 2-7 had subscription_start = NOW + 1min, so after 1 min they can advance.
"""
import subprocess
import sys

POLICY_REGISTRY = "policy.rockettheraccon.testnet"
OWNER = "rockettheraccon.testnet"

# Policies 2-7 should be advanceable to Subscribing
ADVANCE_IDS = [2, 3, 4, 5, 6, 7]


def advance(policy_id: int) -> str:
    result = subprocess.run(
        [
            "near", "contract", "call-function", "as-transaction",
            POLICY_REGISTRY, "advance_status",
            "json-args", f'{{"id": {policy_id}}}',
            "prepaid-gas", "10 Tgas",
            "attached-deposit", "0 NEAR",
            "sign-as", OWNER,
            "network-config", "testnet",
            "sign-with-keychain", "send",
        ],
        capture_output=True, text=True, timeout=30,
    )
    output = result.stdout + result.stderr
    if "Subscribing" in output:
        return "Subscribing"
    elif "Live" in output:
        return "Live"
    elif "Error" in output:
        return f"FAILED (may need more time)"
    return "OK"


def main() -> None:
    print("Advancing policies to Subscribing...")
    for pid in ADVANCE_IDS:
        status = advance(pid)
        print(f"  Policy {pid}: {status}")
    print("\nDone! Policies 5,6,7 will auto-transition to Live after ~1h.")


if __name__ == "__main__":
    main()
