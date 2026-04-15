from __future__ import annotations

import asyncio
import os
import re
import time
from dataclasses import dataclass
from typing import Protocol

from canonical import payload_hash as compute_payload_hash
from crypto import TeeSigner
from ownership import FreshnessError, verify_all_wallets
from schemas import (
    AggregatedSignalModel,
    AttestationPayloadModel,
    AttestationResponseModel,
    CriteriaResultsModel,
    CriteriaRulesModel,
    EvmWalletProofModel,
    JudgeOutputModel,
    NearWalletProofModel,
    PersonaSubmission,
    PolicyModel,
    ZkCircuitInputModel,
)

FRESHNESS_NS = 15 * 60 * 1_000_000_000
RATIONALE_MAX_CHARS = 280
PAYLOAD_VERSION = 2
MAX_CRITERIA = 10

RE_ETH_ADDR = re.compile(r"\b0x[a-fA-F0-9]{40}\b")
RE_NEAR_ACC = re.compile(r"\b[a-z0-9_\-]+(?:\.[a-z0-9_\-]+)+\b")
RE_EMAIL = re.compile(r"\b[^@\s]+@[^@\s]+\.[^@\s]+\b")
RE_URL = re.compile(r"https?://\S+")


class PolicyFetcher(Protocol):
    async def get_policy(self, policy_id: int) -> PolicyModel: ...


class NearIngestor(Protocol):
    async def collect(self, proofs: list[NearWalletProofModel]) -> list: ...


class EvmIngestor(Protocol):
    async def collect(
        self, proofs: list[EvmWalletProofModel]
    ) -> tuple[list, list[str]]: ...


class GithubIngestor(Protocol):
    async def collect(self, oauth_token: str) -> object | None: ...


class LlmClient(Protocol):
    async def structurize(self, natural_language: str) -> CriteriaRulesModel: ...
    async def judge(
        self,
        rules: CriteriaRulesModel,
        signals: AggregatedSignalModel,
        self_intro: str,
    ) -> JudgeOutputModel: ...


class ReportClient(Protocol):
    async def fetch_report(self, signing_address: str, nonce_hex: str) -> bytes: ...


class PolicyValidationError(Exception): ...


class LlmStructurizeFailed(Exception): ...


class LlmJudgeFailed(Exception): ...


class PiiLeakError(Exception): ...


class RemoteAttestationFailed(Exception): ...


@dataclass(slots=True)
class PipelineDeps:
    policy_fetcher: PolicyFetcher
    near_ingestor: NearIngestor
    evm_ingestor: EvmIngestor
    github_ingestor: GithubIngestor
    llm_client: LlmClient
    signer: TeeSigner
    report_client: ReportClient
    near_rpc_url: str


def _now_ns() -> int:
    return time.time_ns()


def _check_client_freshness(client_timestamp: int, now_ns: int | None = None) -> None:
    now = _now_ns() if now_ns is None else now_ns
    if abs(now - client_timestamp) > FRESHNESS_NS:
        raise FreshnessError(
            "client_timestamp is outside the ±15 minute freshness window"
        )


def validate_judge_output(out: JudgeOutputModel, self_intro: str) -> None:
    if not out.criteria:
        raise LlmJudgeFailed("criteria list must not be empty")
    if len(out.criteria) > MAX_CRITERIA:
        raise LlmJudgeFailed(f"too many criteria: {len(out.criteria)} > {MAX_CRITERIA}")
    all_pass = all(c.passed for c in out.criteria)
    if out.verdict == "Eligible" and not all_pass:
        raise LlmJudgeFailed("verdict is Eligible but not all criteria passed")
    if out.verdict == "Ineligible" and all_pass:
        raise LlmJudgeFailed("verdict is Ineligible but all criteria passed")
    if len(out.rationale) > RATIONALE_MAX_CHARS:
        raise PiiLeakError("rationale exceeds 280 chars")
    if RE_ETH_ADDR.search(out.rationale):
        raise PiiLeakError("ETH address in rationale")
    if RE_NEAR_ACC.search(out.rationale):
        raise PiiLeakError("NEAR account in rationale")
    if RE_EMAIL.search(out.rationale):
        raise PiiLeakError("email in rationale")
    if RE_URL.search(out.rationale):
        raise PiiLeakError("URL in rationale")
    compact_intro = re.sub(r"\s+", " ", self_intro.lower()).strip()
    compact_rationale = re.sub(r"\s+", " ", out.rationale.lower()).strip()
    for start in range(0, max(0, len(compact_intro) - 15)):
        if compact_intro[start : start + 16] in compact_rationale:
            raise PiiLeakError("self_intro substring leaked into rationale")


def payload_hash_to_limbs(h: bytes) -> list[str]:
    """32-byte hash → 4 x 64-bit limbs (big-endian per limb)."""
    assert len(h) == 32
    limbs = []
    for i in range(4):
        chunk = h[i * 8 : (i + 1) * 8]
        val = int.from_bytes(chunk, "big")
        limbs.append(str(val))
    return limbs


def build_zk_input(
    payload_hash: bytes, criteria_results: CriteriaResultsModel
) -> ZkCircuitInputModel:
    return ZkCircuitInputModel(
        payload_hash_limbs=payload_hash_to_limbs(payload_hash),
        criteria=[1 if r else 0 for r in criteria_results.results],
        criteria_count=str(criteria_results.count),
    )


def build_criteria_results(out: JudgeOutputModel) -> CriteriaResultsModel:
    passes = [c.passed for c in out.criteria]
    count = len(passes)
    # Pad to MAX_CRITERIA with True
    padded = passes + [True] * (MAX_CRITERIA - count)
    return CriteriaResultsModel(results=padded, count=count)


async def process_persona(
    persona: PersonaSubmission,
    deps: PipelineDeps,
    now_ns: int | None = None,
) -> AttestationResponseModel:
    now = _now_ns() if now_ns is None else now_ns
    try:
        _check_client_freshness(persona.client_timestamp, now)

        if os.getenv("SKIP_OWNERSHIP_VERIFICATION", "").lower() in ("1", "true", "yes"):
            pass  # skip wallet ownership verification for testing
        else:
            await verify_all_wallets(
                near_proofs=persona.wallets.near,
                evm_proofs=persona.wallets.evm,
                policy_id=persona.policy_id,
                expected_nonce=persona.nonce,
                now_ns=now,
                near_rpc_url=deps.near_rpc_url,
            )

        policy = await deps.policy_fetcher.get_policy(persona.policy_id)
        if policy.status != "Subscribing":
            raise PolicyValidationError(
                f"policy status must be Subscribing, got {policy.status}"
            )
        if now >= policy.sale_config.subscription_end:
            raise PolicyValidationError("policy subscription window is closed")

        github_errors: list[str] = []

        async def collect_github() -> object | None:
            if not persona.github_oauth_token:
                return None
            try:
                return await deps.github_ingestor.collect(persona.github_oauth_token)
            except Exception as exc:  # best-effort per spec
                github_errors.append(f"github: {type(exc).__name__}")
                return None

        near_signals, evm_result, github_signal = await asyncio.gather(
            deps.near_ingestor.collect(persona.wallets.near),
            deps.evm_ingestor.collect(persona.wallets.evm),
            collect_github(),
        )
        evm_signals, evm_errors = evm_result

        aggregated = AggregatedSignalModel(
            near=near_signals,
            evm=evm_signals,
            github=github_signal,
            partial=bool(evm_errors or github_errors),
            collection_errors=evm_errors + github_errors,
        )

        try:
            remote_report = await deps.report_client.fetch_report(
                signing_address=deps.signer.address,
                nonce_hex=persona.nonce.hex(),
            )
        except Exception as exc:
            raise RemoteAttestationFailed(str(exc)) from exc
        if not remote_report:
            raise RemoteAttestationFailed("empty NEAR AI attestation report")

        try:
            rules = await deps.llm_client.structurize(policy.natural_language)
        except Exception as exc:
            raise LlmStructurizeFailed(str(exc)) from exc

        try:
            judge_out = await deps.llm_client.judge(
                rules, aggregated, persona.self_intro
            )
        except Exception as exc:
            raise LlmJudgeFailed(str(exc)) from exc

        validate_judge_output(judge_out, persona.self_intro)
        criteria_results = build_criteria_results(judge_out)

        payload = AttestationPayloadModel(
            subject=persona.near_account,
            policy_id=persona.policy_id,
            verdict=judge_out.verdict,
            issued_at=now,
            expires_at=policy.sale_config.subscription_end,
            nonce=persona.nonce,
            criteria_results=criteria_results,
            payload_version=PAYLOAD_VERSION,
        )

        bundle = deps.signer.sign_payload(payload)
        digest = compute_payload_hash(payload)
        if digest != bundle.payload_hash:
            raise AssertionError("signer payload_hash mismatch")

        tee_report = await deps.report_client.fetch_report(
            signing_address=deps.signer.address,
            nonce_hex=bundle.payload_hash.hex(),
        )
        zk_input = build_zk_input(digest, criteria_results)
        return AttestationResponseModel(
            bundle=bundle, tee_report=tee_report, zk_input=zk_input
        )
    finally:
        persona.self_intro = ""
        persona.github_oauth_token = None
