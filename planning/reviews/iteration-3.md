# Iteration 3 Review

## Drifts from iteration-2 — verification

1. **contract-03a old `ContributionStatus` enum inside state.rs spec** — **CLOSED.** The old enum is gone; `contract-03a-escrow-state.md:72-93` declares `Contribution { outcome, matched_amount, token_amount, token_contract, claim_done, refund_done, … }` + `enum ContributionOutcome { NotSettled, FullMatch, PartialMatch, NoMatch }`. The PHASE A/B/C pseudocode (lines 154-196) writes those same fields. Internally consistent.

2. **tee-01 on-chain `AttestationBundle.tee_report`** — **CLOSED.** `tee-01-persona-schema.md:93-101` has the 5-field on-chain struct, and `tee-01-persona-schema.md:103-110` adds `AttestationBundleWithReport` behind `#[cfg(not(feature = "contract"))]`. Matches ERD §3.6 and `contract-02-attestation-verifier.md:69`.

3. **tee-05 writes `bundle.tee_report` directly** — **CLOSED.** `tee-05-signer-and-report.md:100-117` now returns a pure `AttestationBundle` from `sign_payload()`; wrapper construction moved to `sign_and_attach` in pipeline (`tee-05:119-133`) which builds `AttestationBundleWithReport(bundle=…, tee_report=…)`.

4. **contract-03c full rewrite against ERD §5.2b** — **CLOSED.** `contract-03c-escrow-claim-refund.md:29-39` embeds the §5.2b permission table; claim (lines 60-90) and refund (lines 130-154) logic both route on `outcome` + `claim_done`/`refund_done`, with Promise + rollback callbacks (92-108, 156-170). 13 test cases at lines 214-227 cover every row plus rollback. The "ERD update needed" note is gone.

5. **contract-03a contribute() promise chain + auto-refund trap** — **CLOSED.** `contract-03a:149-196` splits validation into PHASE A (sync, panic auto-refunds), PHASE B (optimistic state write — still atomic-safe since still same tx, panic rolls back), PHASE C (promise launched). Note at 198-201 explicitly explains the NEAR runtime refund/atomicity rules.

6. **contract-03a `on_is_eligible` signature mismatch (nonce missing)** — **CLOSED.** impl block (137-145), trait (337-346), and rollback call sites (239-241, 251, 260) all carry `nonce: [u8; 32]`. Plus an explicit warning at line 349 telling developers the two must match.

7. **contract-03a `policy_investors: LookupMap<PolicyId, Vector<…>>` footgun** — **CLOSED.** `contract-03a:48-51` now uses `LookupMap<PolicyInvestorKey, AccountId>` + `policy_investor_count: LookupMap<PolicyId, u32>`. The `PolicyInvestorKey` struct (65-69) is explicit. Matches ERD §8 line 608.

8. **contract-03a `settle_cursor` missing field** — **CLOSED.** `contract-03a:53-54`.

9. **contract-03b fire-and-forget `advance_status`** — **CLOSED.** `contract-03b-escrow-settlement.md:64-65` now panics with `WrongPolicyStatus` if `policy.status != Live`; keeper must call `advance_status` first. Error added at line 132; relationship documented at 145-149.

10. **tee-02 `verify_evm_ownership` stale body (10 min / old message format)** — **CLOSED.** `tee-02-inference-service.md:187-190` replaces the inlined function with a pointer to tee-03 and explicitly restates the v2 format + 15-min freshness.

11. **tee-02 pipeline v2 (drop TEE nonce uniqueness check)** — **CLOSED.** `tee-02:86-89` documents the removal.

12. **tee-03 NEP-413 Python library named** — **CLOSED.** `tee-03-ownership-verification.md:43-48` names `nacl.signing.VerifyKey` (preferred) with `cryptography.Ed25519PublicKey` as alternative, plus `base58` for pubkey parsing; sample body at 50-95 includes a concrete `VerifyKey(pub_bytes).verify(msg_hash, sig_bytes)` call.

13. **tee-04 `build_anon_summary` `...` placeholder** — **CLOSED.** `tee-04-llm-judge.md:155-169` is a real implementation (no literal `...`).

14. **infra-01 `schemars` unused + eth_account contradiction** — **CLOSED.** No `schemars` entry in workspace deps (`infra-01-monorepo-init.md:49-58`). Decision note at line 180 now says `eth_keys.PrivateKey.sign_msg_hash` and forbids `Account.signHash`. `primitive-types` added at line 57.

15. **infra-02 `INITIAL_TEE_SIGNING_ADDRESS` placeholder + init args wiring** — **CLOSED.** `infra-02-testnet-deploy.md:38-41` shows a concrete JSON example; init call at line 74 consumes `$INITIAL_TEE_SIGNING_ADDRESS_JSON`.

16. **test-01 assertion language still uses old status** — **CLOSED.** `test-01-e2e-demo.md:109-113` uses `outcome ∈ {FullMatch, PartialMatch}` + `claim_done`/`refund_done`. Scenarios at 125-127 renamed FullMatch/PartialMatch.

17. **test-02 `from sha3 import keccak_256`** — **CLOSED.** `test-02-cross-lang-borsh.md:79,89` uses `from eth_hash.auto import keccak` consistently with tee-05.

18. **PRD FR-IE-4/5/6 + NFR-SEC-1 + Glossary** — **CLOSED.** `PRD.md:126-128` is rewritten with outcome + flag semantics. `PRD.md:165-167` carves out "federated TEE (우리 CVM + NEAR AI Cloud CVM)" for NFR-SEC-1. `PRD.md:291` adds `ContributionOutcome` to the glossary.

19. **ERD §6 settlement algorithm using old enum names** — **PARTIALLY CLOSED.** Line 569 outputs `FullMatch/PartialMatch/NoMatch` correctly, but line 563 still reads `total_demand = sum(Contribution.amount where status == Pending)` — stale `status`/`Pending` reference (should be `outcome == NotSettled`). One-line doc drift.

20. **ERD Mermaid CONTRIBUTION entity** — **CLOSED for Contribution** (`ERD.md:101-107` lists `outcome`, flags, `token_contract`). **NEW drift spotted** — see §"New issues" below for SALE_CONFIG and ATTESTATION_BUNDLE rows.

## New issues in iteration 3

- **contract-03b-escrow-settlement.md:155-169 still contains the DUPLICATE dead `### 에러` + `### 이벤트` blocks** that iter-2 flagged. The first block (127-143) is correct v2 (`WrongPolicyStatus`, `ContributionSettled { outcome, … }`). The second block (155-169) is the stale iter-1 leftover using the old `status` field in `ContributionSettled`. This was explicitly called out in iter-2 §"New issues" and not fixed. A dev who searches the file for `ContributionSettled` will hit both. **Hard drift; must delete.**

- **contract-03b-escrow-settlement.md:32** doc comment on `settle()` still says `각 Contribution의 status를 Matched/Partial/Refunded로 확정` — stale enum names inside the API contract comment. Lines 175-177 and 183-184 also use `Matched`/`Partial` in acceptance criteria / test case prose. Comment-only (no code), but wrong vocabulary in the same file that correctly uses `outcome` elsewhere.

- **ERD.md:55** Mermaid SALE_CONFIG entity still declares `u64 live_start` even though the v2 CHANGELOG (line 10) and the Rust struct (line 169-178) both confirm `live_start` is NOT a field. Mermaid contradicts its own §3.2. Minor docs drift.

- **ERD.md:94** Mermaid ATTESTATION_BUNDLE entity still declares `bytes tee_report` as a field, while the Rust struct (line 383-391) and the CHANGELOG line 8 say it was removed. Same kind of Mermaid-vs-Rust drift as above. Two diagram edits missed in the §1 pass.

- **ERD.md:563** — "total_demand = sum(Contribution.amount where status == Pending)" still names the deprecated `status == Pending`. Should be `outcome == NotSettled` per §3.7.

- **contract-01-policy-registry.md:139** acceptance criterion still mentions `InvalidTransition` as an alternative name ("no-op 유지 + false 반환 또는 InvalidTransition"), even though line 122 explicitly says the variant was removed. Cosmetic, but misleading.

- **infra-01 pyproject missing transitive-but-directly-used deps.** `tee-03-ownership-verification.md:44-48` explicitly uses `nacl.signing` (PyNaCl) and `base58` libraries. Neither is declared in `tee/inference/pyproject.toml` (`infra-01:155-166`). `eth_keys` (used by tee-02/tee-05) is also not listed, though it comes transitively via `eth-account`. A `uv sync` will work for `eth_keys` but break on `base58`/`nacl` imports. Add `pynacl>=1.5` and `base58>=2.1` to pyproject, and consider pinning `eth-keys>=0.5` for explicitness.

- **contract-03c cached policy fetch** — `claim()` pseudocode line 78 says `policy = self.cached_policy_or_fetch(policy_id)` but no such helper is declared anywhere in 03a/03b/03c. Since `token_contract` is now stored on `Contribution` (line 81 of 03a), this helper is dead and claim() can just read `contribution.token_contract`. Line 81 of 03c correctly passes `policy.sale_config.token_contract.clone()` from the stale helper path — should be `contribution.token_contract.clone()` to match the iter-3 decision. Net effect: claim() as pseudo-coded still references a helper that does not exist and implies a cross-contract call that is no longer needed. Not blocking (dev will notice), but inconsistent with the explicit "Contribution에 필드 저장" decision two paragraphs above.

- **contract-03a on_get_policy `if None` zombie branch.** Line 222-226 optimistically updates `contribution.token_contract` inside on_get_policy. But if on_get_policy's rollback paths (2, 4) fire BEFORE the update, the Contribution is already removed — the later `if let Some(mut c) = self.contributions.get(&key)` guard is correct, so safe. Worth a one-line comment explaining the ordering; not a correctness bug.

## Remaining work (if any)

1. **Delete contract-03b lines 155-169** (duplicate stale error/event blocks). Update line 32 doc comment + lines 175-184 acceptance/test prose to `FullMatch`/`PartialMatch`/`NoMatch`. *This is the only hard drift left — same drift iter-2 flagged, unfixed.*
2. **Fix ERD Mermaid §1**: drop `u64 live_start` at line 55 and `bytes tee_report` at line 94 so the diagram matches §3.2 / §3.6 Rust structs.
3. **Fix ERD §6 line 563**: `status == Pending` → `outcome == NotSettled`.
4. **contract-03c line 78+81**: drop `cached_policy_or_fetch` and read `contribution.token_contract` directly.
5. **infra-01 pyproject**: add `pynacl>=1.5`, `base58>=2.1`, and preferably `eth-keys>=0.5` to pyproject deps.
6. **contract-01 line 139**: delete the dangling `InvalidTransition` mention.

Deferred per scope (acknowledged, not counted as remaining):
- TDX `report_data` encoding (iter-1 #10)
- `signing_key_id` simplification (iter-1 #9)
- Full security audit

## Verdict

**CLOSE — but not quite "개발만 하면 될 퀄리티" yet.** Iteration 3 closed 18 of the ~20 iter-2 drifts and got every hard architectural decision (Promise chain phases, outcome+flags model, AttestationBundle split, policy_investors flat keying, settle/mark_closed split, NEP-413 Python path, test-02 hashing) consistent across the Rust/Python/scripts stack. A Dev Agent starting from these tasks would no longer hit a compilation wall. The gap is cosmetic and small: (a) **contract-03b still carries the exact duplicate dead error/event block iter-2 flagged** (the single hard item that slipped through again), plus three lines of stale old-enum vocabulary in the same file; (b) **ERD Mermaid diagram §1** still lists `live_start` and `tee_report` that the Rust SSOT no longer has; (c) one stale ERD line 563, one missing `infra-01` pyproject dep group, one dead `cached_policy_or_fetch` helper in 03c. None of these block implementation — a dev will either notice immediately or run into a trivial `pip install` / `cargo build` fix. One more 15-minute text-sweep pass clears it all. Recommend marking blockers = 0 only after contract-03b §에러/§이벤트 dedup and ERD Mermaid edits land; everything else is nitpick-quality.
