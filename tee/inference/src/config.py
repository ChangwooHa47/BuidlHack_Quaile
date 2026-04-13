from __future__ import annotations

import json
import os
from dataclasses import dataclass


@dataclass(slots=True)
class Config:
    near_ai_api_key: str = ""
    near_ai_base_url: str = "https://api.near.ai/v1"
    near_ai_model: str = "deepseek-ai/DeepSeek-V3.1"
    tee_signer_privkey: str = ""
    tee_signer_key_id: int = 1
    allow_dev_signer: bool = False
    near_rpc_url: str = "https://rpc.testnet.near.org"
    policy_registry_account: str = ""
    ido_escrow_account: str = ""
    evm_rpcs_json: str = "{}"

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            near_ai_api_key=os.getenv("NEAR_AI_API_KEY", ""),
            near_ai_base_url=os.getenv("NEAR_AI_BASE_URL", "https://api.near.ai/v1"),
            near_ai_model=os.getenv("NEAR_AI_MODEL", "deepseek-ai/DeepSeek-V3.1"),
            tee_signer_privkey=os.getenv("TEE_SIGNER_PRIVKEY", ""),
            tee_signer_key_id=int(os.getenv("TEE_SIGNER_KEY_ID", "1")),
            allow_dev_signer=os.getenv("ALLOW_DEV_TEE_SIGNER", "").lower()
            in {"1", "true", "yes"},
            near_rpc_url=os.getenv("NEAR_RPC_URL", "https://rpc.testnet.near.org"),
            policy_registry_account=os.getenv("POLICY_REGISTRY_ACCOUNT", ""),
            ido_escrow_account=os.getenv("IDO_ESCROW_ACCOUNT", ""),
            evm_rpcs_json=os.getenv("EVM_RPCS_JSON", "{}"),
        )

    @property
    def evm_rpcs(self) -> dict[int, str]:
        try:
            raw = json.loads(self.evm_rpcs_json or "{}")
        except json.JSONDecodeError as exc:
            raise ValueError(f"EVM_RPCS_JSON is not valid JSON: {exc}") from exc
        return {int(k): str(v) for k, v in raw.items()}
