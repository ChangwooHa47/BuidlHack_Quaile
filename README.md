# Buidl-NEAR AI

> TEE-based IDO launchpad with AI-powered investor vetting.

Investors submit a **Persona** (wallets + bio + GitHub) to a TEE (Trusted Execution Environment).
The TEE evaluates the persona against the foundation's natural-language Policy using an LLM,
issues a signed Attestation, and the on-chain verifier gates IDO contributions.

## Layout

```
contracts/          Rust NEAR smart contracts
  policy-registry/    Foundation registers Policy + SaleConfig
  attestation-verifier/ Verifies TEE-signed AttestationBundle (secp256k1)
  ido-escrow/         Contribution / Settlement / Claim / Refund state machine

tee/
  shared/             Rust SSOT crate — types shared by contracts & Python service
  inference/          Python FastAPI — persona ingestion, LLM judge, signing

scripts/            Deployment & e2e demo scripts

planning/           PRD, ERD, tasks, reviews (planning artifacts)
```

## Quick Start

```bash
# Rust workspace
cargo check --workspace

# Install wasm target (first time)
rustup target add wasm32-unknown-unknown

# Python TEE service
cd tee/inference
uv sync
uv run pytest -q

# Build everything
./scripts/build_all.sh
```

## Docs

- [`planning/ONE_PAGER.md`](planning/ONE_PAGER.md) — Product overview & demo flow
- [`planning/PRD.md`](planning/PRD.md) — Functional & non-functional requirements
- [`planning/ERD.md`](planning/ERD.md) — Data model (on-chain / off-chain)
