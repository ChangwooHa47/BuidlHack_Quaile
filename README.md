# Qualie

> **AI Evaluation That Nobody Gets to Keep.**
> A private, AI-judged IDO launchpad on NEAR — designed around a four-party conflict of interests that no existing launchpad has solved at once.

Submitted to **BuidlHack 2026 — Korea Buidl Week · NEAR AI / General Track**.

- **Deployed contracts (NEAR testnet):** `policy.rockettheraccon.testnet`, `verifier.rockettheraccon.testnet`, `zkverifier.rockettheraccon.testnet`, `escrow.rockettheraccon.testnet`, `mockft.rockettheraccon.testnet`
- **Demo video:** _linked from the BuidlHack submission page_

---

## Table of Contents
- [The Problem — a four-way conflict of interests](#the-problem--a-four-way-conflict-of-interests)
- [The Solution](#the-solution)
- [Why an IDO launchpad is the right first application](#why-an-ido-launchpad-is-the-right-first-application)
- [Lifecycle](#lifecycle)
- [Privacy Model](#privacy-model--the-property-that-matters-most)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [What Makes This NEAR-Native](#what-makes-this-near-native)
- [Current Status](#current-status-as-of-submission)
- [Roadmap](#roadmap)
- [Repo Layout](#repo-layout)
- [Run It Locally](#run-it-locally)

---

## The Problem — a four-way conflict of interests

Allocating an IDO the right way requires judging investors. That judgment pulls four parties in incompatible directions:

- **The foundation** wants **more information**. The more they know about an investor, the better they can pick the right allocation.
- **The investor** wants **less information to accumulate**. Every bit of wallet history, self-introduction, and GitHub activity aggregated somewhere is leverage against them later.
- **The launchpad** must **not see the investor's data at all**. Any custodial access turns it into the next honeypot and the next data-broker lawsuit.
- **The AI performing the evaluation** must **not retain anything**. Raw persona, intermediate reasoning, draft verdicts — none of it can persist, or we've just moved the problem one hop.

Every existing launchpad picks one side. KYC-style platforms side with the foundation (data aggregated, investors exposed). Anonymous staking-tier platforms side with investors (no real evaluation possible). AI-assisted platforms side with themselves (the AI provider holds all the logs). **Nobody has solved all four at once.**

That is what Qualie solves.

## The Solution

Four mechanisms, one per party:

1. **The foundation gets broad information.** They write selection criteria in plain English. The AI reads those criteria and pulls the investor's full on-chain history — NEAR plus six EVM chains — and evaluates every criterion. The foundation's reach is *maximum*.

2. **No identifying data ever accumulates for the investor.** The persona enters a Trusted Execution Environment over a single attested request and exits as a signed verdict. The raw fields are zeroed in a `finally` block of the pipeline. There is no disk write, no log, no cache.

3. **The launchpad never sees the investor.** Qualie runs no off-enclave database of personas. The launchpad operator cannot impersonate the TEE — the signing key is either generated inside the CVM or injected under attestation. The foundation's dashboard shows aggregate counts only: *N eligible subscribers*, no addresses.

4. **The AI evaluation itself leaves no trace.** The LLM runs inside NEAR AI Cloud's TEE; Qualie cross-attests with it before sending the self-introduction. The model's output is a signed 10-bit pass/fail vector that immediately gets compressed into a Groth16 proof. On-chain, only **one bit** survives — `eligible` — behind a ZK proof. The criteria that passed, the criteria that failed, the reasoning, the confidence — all of it dies with the request.

The result is a system where the foundation evaluates an investor deeply, the investor exposes nothing durable, the launchpad sees nothing it could be compelled to disclose, and the AI's verdict cannot be reconstructed by anyone — including the team that built Qualie.

## Why an IDO launchpad is the right first application

IDOs are where all four pressures collide with real money attached. A DeFi protocol launching a token genuinely wants "long-term holders who've voted in three DAOs"; investors genuinely don't want their wallet tree on a launchpad's server; launchpads genuinely get breached; and AI-assisted vetting is already being used badly. Qualie is the minimum viable shape of a primitive that generalizes beyond IDOs — to any gated action where *the evaluation has to happen but nobody gets to keep the evidence*.

---

## Lifecycle

A Qualie policy moves through six on-chain phases. The UI mirrors the contract exactly — investors cannot accidentally trigger a phase-invalid action:

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
| **Investor** | Their own persona locally. Verdict (`Eligible` / `Ineligible`). Criteria main-statements (the public lines on the project page). |
| **Foundation** | Aggregate counts (`N eligible subscribers`). Criteria they themselves wrote. `evidence_summary` (wallet count, avg holding days, DAO vote total, `github_included` bool, 280-char PII-scrubbed rationale). |
| **Launchpad operator / TEE runner** | Nothing the TEE doesn't log. All logs are PII-masked at emission. |
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

**Phase 3 — Portable Attestations beyond IDOs.** The signed `AttestationBundle` becomes a reusable credential for any gated action where the same four-party tension exists — RWA issuance, gated governance, private airdrops, exclusive communities. The evaluation has to happen; nobody gets to keep the evidence. The primitive is not specific to IDOs.

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

Built for **BuidlHack 2026 · Korea Buidl Week**, NEAR AI / General Track.

---

_The evaluation has to happen. Nobody gets to keep the evidence._
