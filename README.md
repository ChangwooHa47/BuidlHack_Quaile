# Qualie

> **Private, AI-Judged IDO Launchpad on NEAR.**
> Foundations describe the investors they want in plain language. An AI running inside a Trusted Execution Environment screens each applicant against their on-chain history across NEAR and major EVM chains. A zero-knowledge proof then compresses the verdict into a single bit on-chain — no wallet address, no bio, no trace of the evaluation itself ever leaves the enclave.

Submitted to **BuidlHack 2026 — Korea Buidl Week · NEAR AI / General Track**.

- **Deployed contracts (NEAR testnet):** `policy.rockettheraccon.testnet`, `attestation-verifier.rockettheraccon.testnet`, `zkverifier.rockettheraccon.testnet`, `escrow.rockettheraccon.testnet`, `mockft.rockettheraccon.testnet`
- **Demo video:** _linked from the BuidlHack submission page_

---

## Table of Contents
- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [How It Works — the Full Lifecycle](#how-it-works--the-full-lifecycle)
- [Privacy Model](#privacy-model--the-property-that-matters-most)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [What Makes This NEAR-Native](#what-makes-this-near-native)
- [Current Status](#current-status-as-of-submission)
- [Roadmap](#roadmap)
- [Repo Layout](#repo-layout)
- [Run It Locally](#run-it-locally)

---

## The Problem

Today's IDO launchpads (Legion, Echo, Buidlpad) decide who gets an allocation by **staking tier**. If your wallet holds enough of the launchpad's token, you get in. If not, you don't.

This is a bad system for three reasons.

- **Foundations lose sovereignty.** A DeFi protocol that wants "long-term holders who have voted in at least three DAOs" has no way to express that. The launchpad owns the selection criteria, not the issuer.
- **Whales dominate.** Staking-weighted allocations concentrate supply in the wallets that least need it and most immediately dump.
- **Privacy is broken.** The only way today to run a real quality check is to hand over wallet lists, KYC documents, and behavioral data to a third party. Once it's out of the user's hands, it's out forever.

These three problems share one root: **running a thoughtful quality check on an investor requires reading their on-chain history, and reading their history requires someone to see it.** Until now.

## The Solution

Qualie separates three jobs that were previously fused:

1. **The foundation** writes criteria in plain English — _"long-term DeFi holders with DAO participation history, builders preferred"_ — and publishes them on-chain.
2. **A Trusted Execution Environment** reads the criteria, fetches the investor's multi-chain history directly from RPCs, asks an LLM (running inside a second TEE, NEAR AI Cloud) to evaluate each criterion, and signs the verdict. **The raw data is wiped from memory the moment the response is sent.**
3. **A zero-knowledge proof** generated in the investor's browser wraps the 10-bit pass/fail vector. Only one bit — `eligible: true/false` — ever reaches the chain, behind a Groth16 proof verified on-chain.

The foundation learns that _N people passed_. The investor learns they _passed_. The chain stores _one bit_. Nobody, including the team that built Qualie, can reconstruct who submitted what.

Three properties that weren't possible before:

- **Foundation sovereignty without breaking privacy.** Foundations define criteria; they never see investors.
- **Merit-based allocation.** Criteria can encode long-term behavior, governance participation, builder contributions — anything the LLM can judge against on-chain signals.
- **Portable eligibility.** Today the attestation gates one Qualie IDO. The signed bundle is a standalone artifact; future launchpads can accept it as proof of prior vetting without re-running the screen.

---

## How It Works — the Full Lifecycle

Qualie's policy goes through six on-chain phases. Each phase has a specific contract gate, and the UI mirrors the contract exactly — investors cannot accidentally trigger a phase-invalid action.

```
Upcoming ─→ Subscribing ─→ Contributing ─→ Refunding ─→ Distributing ─→ Closed
              │                │               │             │
              ↓                ↓               ↓             ↓
          Identity +         Deposit        Settlement    Token claim
          ZK proof           NEAR           (pro-rata)   (NEP-141)
          on-chain                                       + native refund
```

### Stage 1 — Subscribing (Identity + On-chain Proof)

The investor opens the project page and clicks **Build Identity**. They connect a NEAR wallet and up to six EVM wallets (Ethereum, Arbitrum, Base, Optimism, Polygon, BSC), each proven with a fresh EIP-191 / NEP-413 signature over a canonical message containing the policy ID and a one-time nonce. They optionally link GitHub and write a short self-introduction.

The persona is sent to the TEE over an attested channel. Inside the enclave:

1. The foundation's criteria are parsed from `policy.natural_language` using the shared format (main statements + `  - ` sub-bullets + `[THRESHOLD:N]` marker).
2. An LLM running in NEAR AI Cloud's TEE converts the criteria into machine-checkable checks.
3. Every submitted wallet is ingested in parallel — NEAR RPC plus six EVM chains — with failures degraded gracefully.
4. A second LLM pass evaluates each criterion against the collected signals.
5. The result is a 10-bit pass/fail vector; if at least `THRESHOLD` bits are set, the verdict is **Eligible**.
6. The enclave signs an `AttestationBundle` with a `secp256k1` key and returns it alongside a `zk_input` blob for the browser.
7. **Everything else is wiped.**

The investor then clicks **Subscribe**. The browser runs `snarkjs.groth16.fullProve` locally against the `zk_input`, producing a proof that _the eligibility bit commits to this exact `payload_hash` and the underlying criteria vector satisfies the threshold_ — without revealing which criteria passed. The NEAR wallet signs a single transaction:

```
ido_escrow.subscribe(policy_id, bundle, proof, public_inputs)
```

The escrow contract runs a three-step async chain:
- `policy_registry.get_policy` — confirms the policy is in `Subscribing` phase.
- `attestation_verifier.verify` — recovers the signer via `env::ecrecover` and matches the registered TEE address.
- `zk_verifier.verify_proof` — validates the Groth16 proof against the deployed verification key.

All three must pass. If any one fails, the entry is rolled back. On success, a `Contribution { amount: 0, ... }` entry is written — the investor is _subscribed but not yet funded_.

### Stage 2 — Contributing (Deposit)

When the Contributing window opens, the subscribed investor clicks **Contribute** and enters an amount. The same contract, a different method:

```
ido_escrow.contribute(policy_id) { attached_deposit: X NEAR }
```

The contract verifies the phase and writes `amount` into the pre-existing subscription entry. No bundle re-verification, no ZK proof re-generation — the eligibility was already sealed at Subscribe time. This separation is deliberate: **Subscribe is a one-shot expensive proof; Contribute is a cheap deposit that can happen hours or days later when capital is ready.**

### Stage 3 — Refunding (Settlement)

Once the Contributing window closes, anyone can call `settle(policy_id)`. The contract walks every subscribed investor, applies pro-rata matching against `total_allocation × price_per_token`, and stamps each contribution with one of three outcomes: **FullMatch**, **PartialMatch**, **NoMatch**. Settlement is permissionless and batchable — a cursor pattern lets a keeper drive it in multiple transactions if the investor list is large.

### Stage 4 — Distributing (Claim)

Investors who were matched (fully or partially) see a **Claim** button. A single call dispatches an NEP-141 `ft_transfer` of the exact allocated token amount. Investors with partial matches can also claim their unmatched refund as native NEAR. The two paths are independently gated so neither can run twice.

### Stage 5 — Closed

Time-based transition. The policy is finalized; the UI switches to a post-IDO view.

---

## Privacy Model — the Property That Matters Most

This is the part that took the most design work, and it's the part that makes Qualie meaningful rather than a KYC wrapper with extra steps.

| Actor | Can see |
|---|---|
| **Investor** | Their own persona locally. Verdict (`Eligible` / `Ineligible`). Criteria main-statements (the five public lines on the project page). |
| **Foundation** | Aggregate counts (`N eligible subscribers`). Criteria they themselves wrote. `evidence_summary` (wallet count, avg holding days, DAO vote total, `github_included` bool, 280-char PII-scrubbed rationale). |
| **Operator / TEE runner** | Nothing the TEE doesn't log. All logs are PII-masked at emission. |
| **Chain** | ZK proof + `eligible` bit. `payload_hash` commitment. TEE signature. That's it. |
| **Anyone else** | Public policy metadata. Total pending contributions. Settlement outcomes. No investor addresses. |

The invariants that enforce this:

- **Persona is never written to disk.** It enters the TEE over a single HTTPS request and exits as a signed `AttestationBundle`. The raw fields are explicitly zeroed in a `finally` block of the pipeline.
- **The `AttestationPayload` schema has no PII fields.** It contains `subject` (the investor's NEAR account, which they'll reveal anyway when they call `contribute`), `verdict`, `score`, `nonce`, `evidence_summary`. There is no place for a wallet address or a bio fragment to hide.
- **The `rationale` field is filtered.** Before the payload is hashed and signed, a regex gate blocks ETH addresses, NEAR accounts, emails, URLs, and substrings of the self-introduction. The TEE will refuse to sign if any are present.
- **The ZK circuit's private inputs include `criteria[10]`, `criteria_count`, and `threshold`.** The public inputs are only `payload_hash_limbs[4]` and `eligible`. Which specific criteria passed cannot be recovered from the proof.
- **Wallet proofs are checked once, inside the TEE, then discarded.** The per-wallet signatures are verified against the canonical message format to prove ownership, then the signatures themselves are dropped. Only aggregate signals continue into the LLM context.

---

## Architecture

```
┌─ Browser ────────────────────────────────────────────────────────┐
│                                                                   │
│  Foundation admin page  ·  Investor project pages                 │
│  Identity builder (NEAR + EVM signatures, self-intro, GitHub)     │
│  snarkjs.groth16.fullProve (eligibility.wasm + .zkey)             │
│  NEAR Wallet Selector (MyNearWallet)                              │
│                                                                   │
└─────────┬──────────────────────────────────────────┬──────────────┘
          │ POST /v1/attest                          │ sign & send
          ▼                                          ▼
┌─ Qualie TEE (Intel TDX CVM) ────────────┐  ┌─ NEAR testnet ──────────────────────┐
│                                          │  │                                      │
│  FastAPI  /v1/attest                     │  │  policy-registry                     │
│    1. Parse criteria from natural_lang   │  │    - Foundation whitelist            │
│    2. Collect signals (parallel)         │  │    - 6-phase state machine           │
│       ├─ NEAR RPC                        │  │    - force_status (owner)            │
│       └─ EVM RPC × 6 chains              │  │    - init_status_vec (owner)         │
│    3. LLM structurize (criteria → rules) │  │                                      │
│       ─ via NEAR AI Cloud TEE ───────────┼──┼→ attestation-verifier                │
│    4. LLM judge (rules + signals)        │  │    - secp256k1 ecrecover             │
│       ─ via NEAR AI Cloud TEE ───────────┼──┼→ - Rotating TEE signing addresses    │
│    5. PII filter on rationale            │  │                                      │
│    6. Sign AttestationPayload            │  │  zk-verifier                         │
│       (secp256k1 ECDSA, keccak256)       │  │    - Groth16 verification key        │
│    7. Build zk_input                     │  │    - update_vk (owner)               │
│       (limbs, criteria, threshold)       │  │                                      │
│    8. Wipe persona in-memory             │  │  ido-escrow                          │
│                                          │  │    - subscribe / contribute split    │
└──────────────────────────────────────────┘  │    - settle (batched)                │
                                              │    - claim (NEP-141)                 │
                                              │    - refund (native)                 │
                                              │    - used_nonces replay guard        │
                                              │                                      │
                                              │  mock-ft                             │
                                              │    - NEP-141 IDO token               │
                                              │                                      │
                                              └──────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Stack |
|---|---|
| Smart contracts | Rust, `near-sdk` 5.x, 5 contracts (`policy-registry`, `attestation-verifier`, `zk-verifier`, `ido-escrow`, `mock-ft`) |
| Shared types | Rust crate `tee/shared` — single source of truth consumed by contracts and the Python TEE |
| TEE service | Python 3.11, FastAPI, `uv`, deployed as Intel TDX CVM |
| LLM inference | NEAR AI Cloud TEE (`cloud-api.near.ai`), OpenAI-compatible API, `deepseek-ai/DeepSeek-V3.1` default |
| Data ingestion | NEAR JSON-RPC + FastNEAR archival; EVM RPC across Ethereum, Arbitrum, Base, Optimism, Polygon, BSC (Etherscan V2 multi-chain); GitHub REST API |
| Signing | secp256k1 ECDSA over Borsh-serialized payload, `env::ecrecover` on-chain |
| ZK circuit | circom 2.1, Groth16 via snarkjs, `MAX_CRITERIA = 10`, threshold-based eligibility |
| Frontend | Next.js 16, Tailwind v4, TypeScript, `@near-wallet-selector`, `snarkjs` in-browser |
| Wallets | MyNearWallet (NEAR), MetaMask (EVM ownership proofs) |

---

## What Makes This NEAR-Native

- **Chain Signatures-ready.** The architecture anticipates cross-chain IDOs where the investor claims on any chain via NEAR's MPC (`Chain Signatures`). The contract surface is already compatible; the mainnet launch will add a `claim_cross_chain` entry point.
- **NEAR AI Cloud is the LLM host.** The LLM itself runs inside NEAR's attested CVM. Qualie cross-attests between its own CVM and NEAR AI Cloud's before releasing the self-introduction over the wire — this is a federated-TEE boundary, not a trust-one-vendor boundary.
- **Full async contract chains.** Every sensitive action is a Promise chain with typed callback handlers — no optimistic blind writes. The 3-step verify in `subscribe()` is a clean example.
- **Permissionless phase advancement.** `advance_status` is callable by anyone; `mark_closed` is callable only by the escrow contract after settlement is complete. Ownership is scoped minimally.

---

## Current Status (as of submission)

| Area | State |
|---|---|
| Smart contracts (5) | Built, deployed to NEAR testnet, wired end-to-end |
| TEE service | Containerized, running locally and on CVM — `/v1/attest` live |
| ZK circuit | Threshold-based Groth16, trusted setup done, verification key deployed |
| Frontend | Admin flow + investor flow + 6-phase-aware sidebar, in-browser proving |
| Multi-chain ingestion | NEAR + 6 EVM chains working, GitHub optional |
| Demo data | Six projects seeded, one per phase, for immediate visual walkthrough |
| End-to-end tested | Identity → Eligible attestation → Subscribe on-chain → Contribute → Settle → Claim |

---

## Roadmap

**Beta → Mainnet.** Replace the dev signer with a CVM-generated key; full TDX attestation wired to the verifier contract; encrypted criteria on IPFS (today the natural language is plaintext on-chain).

**Phase 2 — Frictionless EVM.** Investors participate using only MetaMask. Qualie auto-creates a meta-account via Chain Signatures; contributions are paid in EVM stablecoins; claims settle to any chain. The user never sees they are touching NEAR.

**Phase 3 — Portable Attestations.** The signed `AttestationBundle` becomes a reusable credential. Other launchpads (and potentially any access-gated protocol) can accept it as proof of prior screening without re-running the evaluation. The attestation lives in the investor's wallet, not on the launchpad's database.

---

## Repo Layout

```
contracts/
  policy-registry/       Foundation whitelist, 6-phase Policy state machine
  attestation-verifier/  secp256k1 TEE signature verification
  zk-verifier/           Groth16 Eligibility circuit verifier
  ido-escrow/            subscribe / contribute / settle / claim / refund
  mock-ft/               NEP-141 test token

tee/
  shared/                Rust crate — type SSOT for contracts + Python service
  inference/             Python FastAPI — persona ingestion, LLM judge, signing

circuits/
  eligibility.circom     Threshold Groth16 circuit (MAX_CRITERIA = 10)
  build/                 Compiled wasm, zkey, verification key

frontend/
  src/app/               Next.js 16 routes (admin, projects, API)
  src/components/        SubscribeButton, ContributeButton, SubscribingSidebar, ...
  src/lib/near/          Contract helpers, transaction builders
  src/lib/zk/            snarkjs browser proof generation
  public/zk/             eligibility.wasm + eligibility_final.zkey

scripts/
  build_all.sh           Builds every wasm + optimizes with wasm-opt
  deploy/                Subaccount creation, deployment, VK wiring, seed data
  demo/                  tee_viewer.py — visualizes the hidden TEE steps for demo
  e2e/                   End-to-end test harness
```

---

## Run It Locally

### Prerequisites
- Rust 1.78+ with the `wasm32-unknown-unknown` target installed (`rustup target add wasm32-unknown-unknown`)
- Node 22+ and npm
- `circom` and `snarkjs` (for regenerating the circuit)
- `wasm-opt` (for shrinking wasm before deploy)
- Python 3.11 with `uv`
- `near-cli-rs` with a funded testnet account

### The fastest path — just browse the deployed demo

```bash
cd frontend
npm install
npm run dev
# open http://localhost:3000
```

The frontend is preconfigured to point at our deployed testnet contracts, so you can see Projects with one policy per phase without touching TEE or contracts.

### Full local stack

```bash
# 1. TEE service (persona ingestion + LLM judge + signing)
cd tee/inference
uv sync
uv run uvicorn --app-dir src main:create_app --factory \
  --host 0.0.0.0 --port 8080 --env-file .env
# .env needs: NEAR_AI_API_KEY=..., ALLOW_DEV_TEE_SIGNER=true

# 2. Frontend (in another terminal)
cd frontend
npm install
npm run dev
```

### Deploying contracts to your own testnet account

```bash
# Generate a TEE signer address (local dev)
./scripts/tee/bootstrap_signer.sh

# Run the Groth16 trusted setup
cd circuits && ./scripts/setup.sh

# Fill scripts/deploy/config.env from config.env.example,
# then deploy all 5 contracts + wire them together
./scripts/deploy/deploy_all.sh

# Seed one project per phase (optional, for demo)
python3 scripts/deploy/register_mock_policies.py
```

---

## Acknowledgements

Built for **BuidlHack 2026 · Korea Buidl Week**, NEAR AI / General Track. The privacy model owes its shape to the constraint that the foundation _must not_ be able to cheat its own rules — every other decision flowed from that.

---

_Privacy is not a feature. It's an invariant._
