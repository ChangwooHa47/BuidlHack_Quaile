from __future__ import annotations

import base64
import hashlib
from statistics import mean
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator


def _hex_to_bytes(value: str) -> bytes:
    v = value[2:] if value.startswith("0x") else value
    if len(v) % 2 != 0:
        raise ValueError("hex string must have even length")
    return bytes.fromhex(v)


def _bytes_to_0x(value: bytes) -> str:
    return "0x" + value.hex()


class NearWalletProofModel(BaseModel):
    account_id: str
    public_key: str
    signature: str
    message: str
    timestamp: int


class EvmWalletProofModel(BaseModel):
    chain_id: int
    address: str
    signature: str
    message: str
    timestamp: int


class WalletsModel(BaseModel):
    near: list[NearWalletProofModel] = Field(default_factory=list)
    evm: list[EvmWalletProofModel] = Field(default_factory=list)


class PersonaSubmission(BaseModel):
    near_account: str
    policy_id: int
    wallets: WalletsModel
    self_intro: str
    github_oauth_token: str | None = None
    nonce: bytes
    client_timestamp: int

    model_config = ConfigDict(arbitrary_types_allowed=True)

    @field_validator("nonce", mode="before")
    @classmethod
    def parse_nonce(cls, value: object) -> bytes:
        if isinstance(value, bytes):
            nonce = value
        elif isinstance(value, str):
            nonce = _hex_to_bytes(value)
        else:
            raise TypeError("nonce must be bytes or 0x-prefixed hex string")
        if len(nonce) != 32:
            raise ValueError(f"nonce must be 32 bytes, got {len(nonce)}")
        return nonce

    @field_serializer("nonce")
    def serialize_nonce(self, value: bytes) -> str:
        return _bytes_to_0x(value)


class CriterionResult(BaseModel):
    description: str
    passed: bool


class CriteriaRulesModel(BaseModel):
    criteria: list[str]
    qualitative_prompt: str


class JudgeOutputModel(BaseModel):
    verdict: Literal["Eligible", "Ineligible"]
    criteria: list[CriterionResult]
    rationale: str


class CriteriaResultsModel(BaseModel):
    results: list[bool]  # length = MAX_CRITERIA (10), padded with True
    count: int


class PolicySaleConfigModel(BaseModel):
    token_contract: str
    total_allocation: int
    price_per_token: int
    payment_token: str | dict
    subscription_start: int
    subscription_end: int
    live_end: int

    @field_validator("total_allocation", "price_per_token", mode="before")
    @classmethod
    def parse_u128_json(cls, value: object) -> int:
        if isinstance(value, dict) and "0" in value:
            return int(value["0"])
        return int(value)


class PolicyModel(BaseModel):
    id: int
    foundation: str
    natural_language: str
    ipfs_cid: str
    sale_config: PolicySaleConfigModel
    status: Literal["Upcoming", "Subscribing", "Live", "Closed"]
    created_at: int


class FtHoldingModel(BaseModel):
    token: str
    balance: int
    first_acquired: int


class DaoVoteModel(BaseModel):
    dao: str
    proposal_id: int
    vote: str
    timestamp: int


class NearWalletSignalModel(BaseModel):
    account_id: str
    first_seen_block: int
    holding_days: int
    total_txs: int
    native_balance: int
    fts: list[FtHoldingModel] = Field(default_factory=list)
    dao_votes: list[DaoVoteModel] = Field(default_factory=list)


class Erc20HoldingModel(BaseModel):
    token: str
    balance_wei: bytes
    first_acquired_block: int

    @field_validator("balance_wei", mode="before")
    @classmethod
    def parse_balance_wei(cls, value: object) -> bytes:
        if isinstance(value, bytes):
            data = value
        elif isinstance(value, str):
            data = _hex_to_bytes(value)
        else:
            raise TypeError("balance_wei must be bytes or hex string")
        if len(data) != 32:
            raise ValueError("balance_wei must be 32 bytes")
        return data

    @field_serializer("balance_wei")
    def serialize_balance_wei(self, value: bytes) -> str:
        return _bytes_to_0x(value)


class EvmWalletSignalModel(BaseModel):
    chain_id: int
    address: str
    first_seen_block: int
    holding_days: int
    tx_count: int
    native_balance_wei: bytes
    erc20s: list[Erc20HoldingModel] = Field(default_factory=list)

    @field_validator("native_balance_wei", mode="before")
    @classmethod
    def parse_native_balance(cls, value: object) -> bytes:
        if isinstance(value, bytes):
            data = value
        elif isinstance(value, str):
            data = _hex_to_bytes(value)
        else:
            raise TypeError("native_balance_wei must be bytes or hex string")
        if len(data) != 32:
            raise ValueError("native_balance_wei must be 32 bytes")
        return data

    @field_serializer("native_balance_wei")
    def serialize_native_balance(self, value: bytes) -> str:
        return _bytes_to_0x(value)


class GithubSignalModel(BaseModel):
    login_hash: bytes
    public_repo_count: int
    contributions_last_year: int
    account_age_days: int
    primary_languages: list[str] = Field(default_factory=list)

    @field_validator("login_hash", mode="before")
    @classmethod
    def parse_login_hash(cls, value: object) -> bytes:
        if isinstance(value, bytes):
            digest = value
        elif isinstance(value, str):
            digest = _hex_to_bytes(value)
        else:
            raise TypeError("login_hash must be bytes or hex string")
        if len(digest) != 32:
            raise ValueError("login_hash must be 32 bytes")
        return digest

    @field_serializer("login_hash")
    def serialize_login_hash(self, value: bytes) -> str:
        return _bytes_to_0x(value)

    @classmethod
    def from_login(
        cls,
        login: str,
        public_repo_count: int,
        contributions_last_year: int,
        account_age_days: int,
        primary_languages: list[str],
    ) -> "GithubSignalModel":
        return cls(
            login_hash=hashlib.sha256(login.encode("utf-8")).digest(),
            public_repo_count=public_repo_count,
            contributions_last_year=contributions_last_year,
            account_age_days=account_age_days,
            primary_languages=primary_languages,
        )


class AggregatedSignalModel(BaseModel):
    near: list[NearWalletSignalModel] = Field(default_factory=list)
    evm: list[EvmWalletSignalModel] = Field(default_factory=list)
    github: GithubSignalModel | None = None
    partial: bool = False
    collection_errors: list[str] = Field(default_factory=list)

    def anon_summary(self) -> dict:
        all_holding_days = [w.holding_days for w in self.near] + [
            w.holding_days for w in self.evm
        ]
        return {
            "near_wallet_count": len(self.near),
            "evm_wallet_count": len(self.evm),
            "max_holding_days": max(all_holding_days, default=0),
            "avg_holding_days": int(mean(all_holding_days)) if all_holding_days else 0,
            "total_tx_count": sum(w.tx_count for w in self.evm)
            + sum(w.total_txs for w in self.near),
            "dao_votes": sum(len(w.dao_votes) for w in self.near),
            "github_contribs": self.github.contributions_last_year
            if self.github
            else 0,
            "github_account_age_days": self.github.account_age_days
            if self.github
            else 0,
            "partial": self.partial,
        }


class AttestationPayloadModel(BaseModel):
    subject: str
    policy_id: int
    verdict: Literal["Eligible", "Ineligible"]
    issued_at: int
    expires_at: int
    nonce: bytes
    criteria_results: CriteriaResultsModel
    payload_version: int

    @field_validator("nonce", mode="before")
    @classmethod
    def parse_nonce(cls, value: object) -> bytes:
        if isinstance(value, bytes):
            nonce = value
        elif isinstance(value, str):
            nonce = _hex_to_bytes(value)
        else:
            raise TypeError("nonce must be bytes or hex string")
        if len(nonce) != 32:
            raise ValueError("nonce must be 32 bytes")
        return nonce

    @field_serializer("nonce")
    def serialize_nonce(self, value: bytes) -> str:
        return _bytes_to_0x(value)


class AttestationBundleModel(BaseModel):
    payload: AttestationPayloadModel
    payload_hash: bytes
    signature_rs: bytes
    signature_v: int
    signing_key_id: int

    @field_validator("payload_hash", mode="before")
    @classmethod
    def parse_payload_hash(cls, value: object) -> bytes:
        if isinstance(value, bytes):
            data = value
        elif isinstance(value, str):
            data = _hex_to_bytes(value)
        else:
            raise TypeError("payload_hash must be bytes or hex string")
        if len(data) != 32:
            raise ValueError("payload_hash must be 32 bytes")
        return data

    @field_validator("signature_rs", mode="before")
    @classmethod
    def parse_signature_rs(cls, value: object) -> bytes:
        if isinstance(value, bytes):
            data = value
        elif isinstance(value, str):
            data = _hex_to_bytes(value)
        else:
            raise TypeError("signature_rs must be bytes or hex string")
        if len(data) != 64:
            raise ValueError("signature_rs must be 64 bytes")
        return data

    @field_serializer("payload_hash", "signature_rs")
    def serialize_hex_bytes(self, value: bytes) -> str:
        return _bytes_to_0x(value)


class AttestationBundleWithReportModel(BaseModel):
    bundle: AttestationBundleModel
    tee_report: bytes

    @field_validator("tee_report", mode="before")
    @classmethod
    def parse_report(cls, value: object) -> bytes:
        if isinstance(value, bytes):
            return value
        if isinstance(value, str):
            return base64.b64decode(value)
        raise TypeError("tee_report must be bytes or base64 string")

    @field_serializer("tee_report")
    def serialize_report(self, value: bytes) -> str:
        return base64.b64encode(value).decode("ascii")


class ZkCircuitInputModel(BaseModel):
    """Client uses this to generate a snarkjs groth16 proof."""
    payload_hash_limbs: list[str]  # 4 x 64-bit limbs (decimal string)
    criteria: list[int]            # [1,1,1,0,...] MAX_CRITERIA entries, 0 or 1
    criteria_count: str            # decimal string


class AttestationResponseModel(BaseModel):
    """Full response from /v1/attest endpoint."""
    bundle: AttestationBundleModel
    tee_report: bytes
    zk_input: ZkCircuitInputModel

    @field_validator("tee_report", mode="before")
    @classmethod
    def parse_report(cls, value: object) -> bytes:
        if isinstance(value, bytes):
            return value
        if isinstance(value, str):
            return base64.b64decode(value)
        raise TypeError("tee_report must be bytes or base64 string")

    @field_serializer("tee_report")
    def serialize_report(self, value: bytes) -> str:
        return base64.b64encode(value).decode("ascii")


class AttestationInfoModel(BaseModel):
    signing_address: str
    key_id: int
    tee_report: str | None = None
