# TEE Signer Key Management

## Quick Start (Development Mode)

```bash
./scripts/tee/bootstrap_signer.sh
```

This generates a secp256k1 signing key at `.secrets/tee_signer.json` and prints
the address bytes for contract initialization.

## Files

| File | Purpose |
|------|---------|
| `gen_signer_key.py` | Generate a new secp256k1 key pair |
| `bootstrap_signer.sh` | Orchestrate key generation (idempotent) |

## Security

- `.secrets/` is in `.gitignore` — never commit key material.
- Directory permissions are set to `700`, file to `600`.
- **Development mode only**: the private key exists outside the CVM.
  Production deployments should generate keys inside the CVM (Mode B in PRD NFR-SEC-2).

## Key Rotation

```bash
# 1. Generate new key
python3 scripts/tee/gen_signer_key.py > .secrets/tee_signer_v2.json

# 2. Register on-chain with grace period
near call $VERIFIER_ACCOUNT rotate_key \
  '{"new_address": [...], "grace_seconds": 3600}' \
  --accountId $OWNER_ACCOUNT

# 3. Deploy new TEE instance with new key
# 4. Old key remains valid during grace period
```
