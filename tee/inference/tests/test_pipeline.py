from __future__ import annotations

import json
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from httpx import ASGITransport, AsyncClient

from canonical import payload_hash as compute_payload_hash
from canonical import serialize_attestation_payload
from crypto import TeeSigner, recover_address_from_rs_v
from main import AppServices, _attestation_report_base_url, create_app
from nearai_client import NearAIClient
from pipeline import PipelineDeps
from schemas import (
    EvmWalletSignalModel,
    GithubSignalModel,
    JudgeOutputModel,
    NearWalletSignalModel,
    PolicyModel,
    PolicySaleConfigModel,
    RuleWeightsModel,
    StructuredRulesModel,
)

FIXTURES = Path(__file__).parent / "fixtures"
NOW_NS = time.time_ns()


def _persona_dict(
    *,
    timestamp_ns: int = NOW_NS,
    nonce_hex: str = "11" * 32,
    include_github: bool = False,
) -> dict:
    acct = Account.from_key("0x" + "11" * 32)
    address = acct.address.lower()
    message = f"buidl-near-ai|v1|42|{nonce_hex}|{timestamp_ns}|eip155:1|{address}"
    sig = Account.sign_message(encode_defunct(text=message), acct.key).signature.hex()
    return {
        "near_account": "alice.testnet",
        "policy_id": 42,
        "wallets": {
            "near": [],
            "evm": [
                {
                    "chain_id": 1,
                    "address": address,
                    "signature": sig,
                    "message": message,
                    "timestamp": timestamp_ns,
                }
            ],
        },
        "self_intro": "Long-term OSS contributor with DAO governance activity.",
        "github_oauth_token": "gho_test" if include_github else None,
        "nonce": "0x" + nonce_hex,
        "client_timestamp": timestamp_ns,
    }


class StubPolicyFetcher:
    async def get_policy(self, policy_id: int) -> PolicyModel:
        return PolicyModel(
            id=policy_id,
            foundation="foundation.testnet",
            natural_language="Prefer long-term NEAR holders with open source activity.",
            ipfs_cid="bafytest",
            sale_config=PolicySaleConfigModel(
                token_contract="token.testnet",
                total_allocation=1_000_000,
                price_per_token=1_000,
                payment_token="Near",
                subscription_start=NOW_NS - 1_000_000_000,
                subscription_end=NOW_NS + 3_600_000_000_000,
                live_end=NOW_NS + 7_200_000_000_000,
            ),
            status="Subscribing",
            created_at=NOW_NS - 10_000_000_000,
        )


class StubNearIngestor:
    def __init__(self, *, count: int = 1):
        self.count = count

    async def collect(self, proofs: list) -> list:
        return [
            NearWalletSignalModel(
                account_id=f"alice-{i}.testnet",
                first_seen_block=100,
                holding_days=500,
                total_txs=12,
                native_balance=10**24,
                fts=[],
                dao_votes=[],
            )
            for i in range(self.count)
        ]


class StubEvmIngestor:
    def __init__(self, *, fail: bool = False):
        self.fail = fail

    async def collect(self, proofs: list) -> tuple[list, list[str]]:
        if self.fail:
            return [], ["1:wallet: RpcFailure"]
        return (
            [
                EvmWalletSignalModel(
                    chain_id=1,
                    address=proofs[0].address,
                    first_seen_block=1,
                    holding_days=365,
                    tx_count=42,
                    native_balance_wei=(123).to_bytes(32, "big"),
                    erc20s=[],
                )
            ],
            [],
        )


class StubGithubIngestor:
    async def collect(self, oauth_token: str):
        return GithubSignalModel.from_login(
            login="octocat",
            public_repo_count=12,
            contributions_last_year=34,
            account_age_days=500,
            primary_languages=["Python", "Rust"],
        )


class StubLlmClient:
    def __init__(self, *, fail_structurize: bool = False):
        self.fail_structurize = fail_structurize

    async def structurize(self, natural_language: str) -> StructuredRulesModel:
        if self.fail_structurize:
            raise RuntimeError("llm unavailable")
        return StructuredRulesModel(
            min_wallet_holding_days=180,
            qualitative_prompt="Prefer consistent long-term builders.",
            weights=RuleWeightsModel(quantitative=0.6, qualitative=0.4),
        )

    async def judge(self, rules, signals, self_intro: str) -> JudgeOutputModel:
        return JudgeOutputModel(
            verdict="Eligible",
            score=7800,
            rationale=(
                "Long-term holding and sustained ecosystem activity "
                "support eligibility."
            ),
            quantitative_score=8000,
            qualitative_score=7500,
        )


class StubReportClient:
    async def fetch_report(self, signing_address: str, nonce_hex: str) -> bytes:
        return json.dumps(
            {"signing_address": signing_address, "nonce": nonce_hex}
        ).encode()


def make_app(
    *, evm_fail: bool = False, llm_fail: bool = False, near_signal_count: int = 1
):
    signer = TeeSigner("0x" + "22" * 32, key_id=7)
    deps = PipelineDeps(
        policy_fetcher=StubPolicyFetcher(),
        near_ingestor=StubNearIngestor(count=near_signal_count),
        evm_ingestor=StubEvmIngestor(fail=evm_fail),
        github_ingestor=StubGithubIngestor(),
        llm_client=StubLlmClient(fail_structurize=llm_fail),
        signer=signer,
        report_client=StubReportClient(),
        near_rpc_url="https://rpc.testnet.near.org",
    )
    return create_app(AppServices(deps=deps))


@pytest.mark.asyncio
async def test_healthz():
    app = make_app()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_attestation_info():
    app = make_app()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/v1/attestation/info")
    assert resp.status_code == 200
    body = resp.json()
    assert body["signing_address"].startswith("0x")
    assert body["key_id"] == 7


def test_attestation_report_base_url_strips_openai_v1_suffix():
    assert _attestation_report_base_url("https://api.near.ai/v1") == (
        "https://api.near.ai"
    )
    assert _attestation_report_base_url("https://api.near.ai") == (
        "https://api.near.ai"
    )


@pytest.mark.asyncio
async def test_attest_happy_path_with_mocks():
    app = make_app()
    expected_signer = app.state.services.deps.signer.address
    persona = _persona_dict(include_github=True)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/v1/attest", json=persona)
    assert resp.status_code == 200
    body = resp.json()
    payload_hash = body["bundle"]["payload_hash"]
    recovered = recover_address_from_rs_v(
        bytes.fromhex(payload_hash[2:]),
        bytes.fromhex(body["bundle"]["signature_rs"][2:]),
        body["bundle"]["signature_v"],
    )
    assert recovered.lower() == expected_signer.lower()
    assert body["tee_report"]
    assert body["bundle"]["payload"]["evidence_summary"]["github_included"] is True


@pytest.mark.asyncio
async def test_python_payload_hash_matches_golden_vector():
    payload = {
        "subject": "alice.testnet",
        "policy_id": 1,
        "verdict": "Eligible",
        "score": 8000,
        "issued_at": 1700000000000000000,
        "expires_at": 1700003600000000000,
        "nonce": "0x" + "42" * 32,
        "evidence_summary": {
            "wallet_count_near": 1,
            "wallet_count_evm": 2,
            "avg_holding_days": 365,
            "total_dao_votes": 5,
            "github_included": True,
            "rationale": "Strong long-term holder with solid on-chain history.",
        },
        "payload_version": 1,
    }
    from schemas import AttestationPayloadModel

    model = AttestationPayloadModel.model_validate(payload)
    assert (
        compute_payload_hash(model).hex()
        == "24ed18275fd4f4b4d9c27be3633a3a24027b7f3edf031a3d74e5581e095dbeb4"
    )
    assert serialize_attestation_payload(model).hex()


@pytest.mark.asyncio
async def test_attest_rejects_stale_client_timestamp():
    app = make_app()
    persona = _persona_dict(timestamp_ns=NOW_NS - 30 * 60 * 1_000_000_000)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/v1/attest", json=persona)
    assert resp.status_code == 400
    assert "freshness" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_attest_rejects_tampered_evm_signature():
    app = make_app()
    persona = _persona_dict()
    persona["wallets"]["evm"][0]["signature"] = "0x" + "00" * 65
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/v1/attest", json=persona)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_attest_returns_500_on_llm_failure():
    app = make_app(llm_fail=True)
    persona = _persona_dict()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/v1/attest", json=persona)
    assert resp.status_code == 500


@pytest.mark.asyncio
async def test_attest_without_github_token_sets_github_included_false():
    app = make_app()
    persona = _persona_dict(include_github=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/v1/attest", json=persona)
    assert resp.status_code == 200
    assert (
        resp.json()["bundle"]["payload"]["evidence_summary"]["github_included"] is False
    )


@pytest.mark.asyncio
async def test_attest_partial_true_when_one_chain_fails():
    app = make_app(evm_fail=True)
    persona = _persona_dict()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/v1/attest", json=persona)
    assert resp.status_code == 200
    # partial is internal, but missing EVM data must be reflected.
    assert resp.json()["bundle"]["payload"]["evidence_summary"]["wallet_count_evm"] == 0


@pytest.mark.asyncio
async def test_attest_rejects_schema_overflow_before_borsh_crash():
    app = make_app(near_signal_count=256)
    persona = _persona_dict()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/v1/attest", json=persona)
    assert resp.status_code == 400
    assert "u8 attestation schema limit" in resp.json()["detail"]


class FlakyCompletions:
    def __init__(self):
        self.calls = 0

    async def create(self, **kwargs):
        self.calls += 1
        if self.calls == 1:
            raise RuntimeError("transient")
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='{"ok": true}'))]
        )


@pytest.mark.asyncio
async def test_nearai_client_retries_transient_chat_failure():
    completions = FlakyCompletions()
    client = NearAIClient.__new__(NearAIClient)
    client.client = SimpleNamespace(
        chat=SimpleNamespace(completions=completions),
    )
    client.model = "test-model"
    client.max_attempts = 3
    client.retry_delay_s = 0

    content = await client.chat(system="system", user="user")

    assert content == '{"ok": true}'
    assert completions.calls == 2
