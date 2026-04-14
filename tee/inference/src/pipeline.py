from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass
from typing import Protocol

from canonical import payload_hash as compute_payload_hash
from crypto import TeeSigner
from ownership import FreshnessError, verify_all_wallets
from schemas import (
    AggregatedSignalModel,
    AttestationBundleWithReportModel,
    AttestationPayloadModel,
    EvidenceSummaryModel,
    EvmWalletProofModel,
    JudgeOutputModel,
    NearWalletProofModel,
    PersonaSubmission,
    PolicyModel,
    StructuredRulesModel,
)

FRESHNESS_NS = 15 * 60 * 1_000_000_000
RATIONALE_MAX_CHARS = 280
PAYLOAD_VERSION = 1
MAX_U8 = 2**8 - 1
MAX_U32 = 2**32 - 1

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
    async def structurize(self, natural_language: str) -> StructuredRulesModel: ...
    async def judge(
        self,
        rules: StructuredRulesModel,
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
    if not (0 <= out.score <= 10_000):
        raise LlmJudgeFailed("score must be in 0..=10000")
    if not (0 <= out.quantitative_score <= 10_000):
        raise LlmJudgeFailed("quantitative_score must be in 0..=10000")
    if not (0 <= out.qualitative_score <= 10_000):
        raise LlmJudgeFailed("qualitative_score must be in 0..=10000")
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
    # Catch meaningful copied spans without rejecting common words.
    for start in range(0, max(0, len(compact_intro) - 15)):
        if compact_intro[start : start + 16] in compact_rationale:
            raise PiiLeakError("self_intro substring leaked into rationale")


def build_evidence_summary(
    signals: AggregatedSignalModel, out: JudgeOutputModel
) -> EvidenceSummaryModel:
    wallet_count_near = len(signals.near)
    wallet_count_evm = len(signals.evm)
    if wallet_count_near > MAX_U8 or wallet_count_evm > MAX_U8:
        raise PolicyValidationError("wallet counts exceed u8 attestation schema limit")

    all_holding_days = [w.holding_days for w in signals.near] + [
        w.holding_days for w in signals.evm
    ]
    avg_holding_days = (
        int(sum(all_holding_days) / len(all_holding_days)) if all_holding_days else 0
    )
    total_dao_votes = sum(len(w.dao_votes) for w in signals.near)
    if avg_holding_days > MAX_U32:
        raise PolicyValidationError(
            "avg_holding_days exceeds u32 attestation schema limit"
        )
    if total_dao_votes > MAX_U32:
        raise PolicyValidationError(
            "total_dao_votes exceeds u32 attestation schema limit"
        )

    return EvidenceSummaryModel(
        wallet_count_near=wallet_count_near,
        wallet_count_evm=wallet_count_evm,
        avg_holding_days=avg_holding_days,
        total_dao_votes=total_dao_votes,
        github_included=signals.github is not None,
        rationale=out.rationale,
    )


async def process_persona(
    persona: PersonaSubmission,
    deps: PipelineDeps,
    now_ns: int | None = None,
) -> AttestationBundleWithReportModel:
    now = _now_ns() if now_ns is None else now_ns
    try:
        _check_client_freshness(persona.client_timestamp, now)

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
        evidence_summary = build_evidence_summary(aggregated, judge_out)

        payload = AttestationPayloadModel(
            subject=persona.near_account,
            policy_id=persona.policy_id,
            verdict=judge_out.verdict,
            score=judge_out.score,
            issued_at=now,
            expires_at=policy.sale_config.subscription_end,
            nonce=persona.nonce,
            evidence_summary=evidence_summary,
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
        return AttestationBundleWithReportModel(bundle=bundle, tee_report=tee_report)
    finally:
        persona.self_intro = ""
        persona.github_oauth_token = None
