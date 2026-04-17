from __future__ import annotations

import json
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from httpx import ASGITransport, AsyncClient

from attestation_verifier import verify_report_data
from canonical import payload_hash as compute_payload_hash
from canonical import serialize_attestation_payload
from crypto import TeeSigner, recover_address_from_rs_v
from main import AppServices, _attestation_report_base_url, create_app
from nearai_client import NearAIClient
from pipeline import PipelineDeps
from schemas import (
    CriteriaRulesModel,
    CriterionResult,
    EvmWalletSignalModel,
    GithubSignalModel,
    JudgeOutputModel,
    NearWalletSignalModel,
    PolicyModel,
    PolicySaleConfigModel,
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
        self.calls: list[str] = []

    async def structurize(self, natural_language: str) -> CriteriaRulesModel:
        self.calls.append("structurize")
        if self.fail_structurize:
            raise RuntimeError("llm unavailable")
        return CriteriaRulesModel(
            criteria=[
                "Token holding >= 180 days",
                "Active on-chain participation",
                "Open source contributor",
            ],
            qualitative_prompt="Prefer consistent long-term builders.",
        )

    async def judge(self, rules, signals, self_intro: str, threshold: int | None = None) -> JudgeOutputModel:
        self.calls.append("judge")
        return JudgeOutputModel(
            verdict="Eligible",
            criteria=[
                CriterionResult(description="Token holding >= 180 days", passed=True),
                CriterionResult(description="Active on-chain participation", passed=True),
                CriterionResult(description="Open source contributor", passed=True),
            ],
            rationale=(
                "Long-term holding and sustained ecosystem activity "
                "support eligibility."
            ),
        )


class StubReportClient:
    def __init__(self, *, fail: bool = False):
        self.fail = fail
        self.calls: list[tuple[str, str]] = []

    async def fetch_report(self, signing_address: str, nonce_hex: str) -> bytes:
        self.calls.append((signing_address, nonce_hex))
        if self.fail:
            raise RuntimeError("attestation unavailable")
        return json.dumps(
            {"signing_address": signing_address, "nonce": nonce_hex}
        ).encode()


def make_app(
    *,
    evm_fail: bool = False,
    llm_fail: bool = False,
    near_signal_count: int = 1,
    report_fail: bool = False,
):
    signer = TeeSigner("0x" + "22" * 32, key_id=7)
    llm_client = StubLlmClient(fail_structurize=llm_fail)
    report_client = StubReportClient(fail=report_fail)
    deps = PipelineDeps(
        policy_fetcher=StubPolicyFetcher(),
        near_ingestor=StubNearIngestor(count=near_signal_count),
        evm_ingestor=StubEvmIngestor(fail=evm_fail),
        github_ingestor=StubGithubIngestor(),
        llm_client=llm_client,
        signer=signer,
        report_client=report_client,
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


def test_create_app_requires_signer_unless_dev_flag(monkeypatch):
    monkeypatch.delenv("TEE_SIGNER_PRIVKEY", raising=False)
    monkeypatch.delenv("ALLOW_DEV_TEE_SIGNER", raising=False)
    with pytest.raises(RuntimeError, match="TEE_SIGNER_PRIVKEY is required"):
        create_app()


def test_verify_report_data_binds_signing_address_and_nonce():
    signing_address = "0x" + "12" * 20
    nonce = "34" * 32
    report_data = bytes.fromhex("12" * 20).ljust(32, b"\x00") + bytes.fromhex(nonce)
    binds_address, embeds_nonce = verify_report_data(
        {"signing_address": signing_address, "signing_algo": "ecdsa"},
        nonce,
        {"report": {"TD10": {"report_data": report_data.hex()}}},
    )
    assert binds_address is True
    assert embeds_nonce is True


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
    # Verify criteria_results present
    cr = body["bundle"]["payload"]["criteria_results"]
    assert cr["count"] == 3
    assert all(cr["results"][:3])
    # Verify zk_input present
    zk_input = body["zk_input"]
    assert len(zk_input["payload_hash_limbs"]) == 4
    assert all(isinstance(l, str) for l in zk_input["payload_hash_limbs"])
    assert len(zk_input["criteria"]) == 10
    assert zk_input["criteria_count"] == "3"
    report_calls = app.state.services.deps.report_client.calls
    assert report_calls[0][1] == persona["nonce"].removeprefix("0x")
    assert report_calls[1][1] == payload_hash.removeprefix("0x")
    assert app.state.services.deps.llm_client.calls == ["structurize", "judge"]


@pytest.mark.asyncio
async def test_attest_rejects_before_llm_when_remote_attestation_fails():
    app = make_app(report_fail=True)
    persona = _persona_dict()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/v1/attest", json=persona)
    assert resp.status_code == 502
    assert app.state.services.deps.llm_client.calls == []


@pytest.mark.asyncio
async def test_python_payload_hash_is_deterministic():
    """Verify Python Borsh serialization produces a deterministic payload hash."""
    from schemas import AttestationPayloadModel, CriteriaResultsModel

    payload = AttestationPayloadModel(
        subject="alice.testnet",
        policy_id=1,
        verdict="Eligible",
        issued_at=1700000000000000000,
        expires_at=1700003600000000000,
        nonce=bytes.fromhex("42" * 32),
        criteria_results=CriteriaResultsModel(
            results=[True, True, True, True, True, True, True, True, True, True],
            count=6,
        ),
        payload_version=2,
    )
    h1 = compute_payload_hash(payload)
    h2 = compute_payload_hash(payload)
    assert h1 == h2
    assert len(h1) == 32
    assert h1 != b"\x00" * 32
    # Verify serialization is non-empty
    assert len(serialize_attestation_payload(payload)) > 0


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
async def test_attest_without_github_shows_criteria():
    app = make_app()
    persona = _persona_dict(include_github=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/v1/attest", json=persona)
    assert resp.status_code == 200
    cr = resp.json()["bundle"]["payload"]["criteria_results"]
    assert cr["count"] == 3


@pytest.mark.asyncio
async def test_attest_partial_true_when_one_chain_fails():
    app = make_app(evm_fail=True)
    persona = _persona_dict()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/v1/attest", json=persona)
    assert resp.status_code == 200
    cr = resp.json()["bundle"]["payload"]["criteria_results"]
    assert cr["count"] == 3


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
