#!/usr/bin/env python3
"""Generate a secp256k1 signing key for the TEE inference service.

Outputs JSON to stdout:
  { "address": "0x...", "address_bytes": [u8; 20], "private_key": "hex64", "key_id": 0 }

The private key is NOT prefixed with 0x to match TEE_SIGNER_PRIVKEY env format.
"""
import json
import sys

from eth_account import Account


def main() -> None:
    acct = Account.create()
    address_hex = acct.address  # 0x-prefixed, checksummed
    address_bytes = list(bytes.fromhex(address_hex[2:]))
    private_key = acct.key.hex()  # no 0x prefix from eth_keys
    # strip 0x if present
    if private_key.startswith("0x"):
        private_key = private_key[2:]

    out = {
        "address": address_hex,
        "address_bytes": address_bytes,
        "private_key": private_key,
        "key_id": 0,
    }
    json.dump(out, sys.stdout, indent=2)
    print()  # trailing newline for clean output
    print(
        f"Store the private key securely. Address: {address_hex}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
