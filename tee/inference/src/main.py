from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from attestation_verifier import verify_near_ai_report
from config import Config
from crypto import TeeSigner
from ingest.chains import SUPPORTED_CHAINS as EVM_CHAINS
from ingest.evm import EvmIngestor
from nearai_client import NearAIClient
from ownership import OwnershipError
from pipeline import (
    LlmJudgeFailed,
    LlmStructurizeFailed,
    PiiLeakError,
    PipelineDeps,
    PolicyValidationError,
    RemoteAttestationFailed,
    process_persona,
)
from schemas import (
    AttestationInfoModel,
    AttestationResponseModel,
    PersonaSubmission,
    PolicyModel,
)

logger = logging.getLogger(__name__)
DEV_SIGNER_PRIVKEY = "0x" + "22" * 32


class NearRpcPolicyFetcher:
    def __init__(self, rpc_url: str, contract_id: str):
        self.rpc_url = rpc_url
        self.contract_id = contract_id

    async def get_policy(self, policy_id: int) -> PolicyModel:
        args = json.dumps({"id": policy_id}).encode("utf-8")
        payload = {
            "jsonrpc": "2.0",
            "id": "tee-policy-fetch",
            "method": "query",
            "params": {
                "request_type": "call_function",
                "finality": "final",
                "account_id": self.contract_id,
                "method_name": "get_policy",
                "args_base64": base64.b64encode(args).decode("ascii"),
            },
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(self.rpc_url, json=payload)
            resp.raise_for_status()
            data = resp.json()
        if "result" not in data:
            raise PolicyValidationError("policy fetch failed")
        raw = bytes(data["result"]["result"]).decode("utf-8")
        return PolicyModel.model_validate_json(raw)


class NoopNearIngestor:
    async def collect(self, proofs: list) -> list:
        return []


class NoopEvmIngestor:
    async def collect(self, proofs: list) -> tuple[list, list[str]]:
        return [], []


class NoopGithubIngestor:
    async def collect(self, oauth_token: str):
        return None


def _attestation_report_base_url(openai_base_url: str) -> str:
    base = openai_base_url.rstrip("/")
    if base.endswith("/v1"):
        base = base[: -len("/v1")]
    return base


class NearAiReportClient:
    def __init__(self, base_url: str, model: str):
        self.base_url = _attestation_report_base_url(base_url)
        self.model = model

    async def fetch_report(self, signing_address: str, nonce_hex: str) -> bytes:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{self.base_url}/v1/attestation/report",
                params={
                    "model": self.model,
                    "signing_address": signing_address,
                    "nonce": nonce_hex,
                    "signing_algo": "ecdsa",
                },
            )
            resp.raise_for_status()
            content = resp.content
        await verify_near_ai_report(content, signing_address, nonce_hex)
        return content


@dataclass(slots=True)
class AppServices:
    deps: PipelineDeps


def create_app(services: AppServices | None = None) -> FastAPI:
    app = FastAPI(title="Buidl-NEAR AI TEE Inference Service")
    if services is None:
        config = Config.from_env()
        signer_key = config.tee_signer_privkey
        if not signer_key:
            if not config.allow_dev_signer:
                raise RuntimeError(
                    "TEE_SIGNER_PRIVKEY is required unless "
                    "ALLOW_DEV_TEE_SIGNER=true"
                )
            logger.warning(
                "TEE_SIGNER_PRIVKEY is unset; using deterministic development "
                "TEE signer key. Do not use this configuration outside local demos."
            )
            signer_key = DEV_SIGNER_PRIVKEY
        signer = TeeSigner(signer_key, config.tee_signer_key_id)
        services = AppServices(
            deps=PipelineDeps(
                policy_fetcher=NearRpcPolicyFetcher(
                    config.near_rpc_url, config.policy_registry_account
                ),
                near_ingestor=NoopNearIngestor(),
                evm_ingestor=EvmIngestor(EVM_CHAINS),
                github_ingestor=NoopGithubIngestor(),
                llm_client=NearAIClient(
                    api_key=config.near_ai_api_key,
                    base_url=config.near_ai_base_url,
                    model=config.near_ai_model,
                ),
                signer=signer,
                report_client=NearAiReportClient(
                    base_url=config.near_ai_base_url,
                    model=config.near_ai_model,
                ),
                near_rpc_url=config.near_rpc_url,
            )
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # staging: restrict to Vercel domain
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.services = services

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/v1/attestation/info")
    async def attestation_info() -> AttestationInfoModel:
        signer = app.state.services.deps.signer
        return AttestationInfoModel(
            signing_address=signer.address, key_id=signer.key_id, tee_report=None
        )

    @app.post("/v1/structurize")
    async def structurize(body: dict) -> dict:
        """Convert natural language criteria into structured evaluation items."""
        nl = body.get("natural_language", "")
        if not nl or len(nl) < 10:
            raise HTTPException(status_code=400, detail="natural_language too short")
        if len(nl) > 2000:
            raise HTTPException(status_code=400, detail="natural_language too long (max 2000)")
        try:
            rules = await app.state.services.deps.llm_client.structurize(nl)
            return {"criteria": rules.criteria, "qualitative_prompt": rules.qualitative_prompt}
        except Exception:
            raise HTTPException(status_code=500, detail="LLM structurize failed")

    @app.post("/v1/attest", response_model=AttestationResponseModel)
    async def attest(persona: PersonaSubmission) -> AttestationResponseModel:
        try:
            return await process_persona(persona, app.state.services.deps)
        except OwnershipError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except (PolicyValidationError, PiiLeakError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RemoteAttestationFailed as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except (LlmStructurizeFailed, LlmJudgeFailed) as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    return app
