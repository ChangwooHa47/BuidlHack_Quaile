from __future__ import annotations

import asyncio
import json

from openai import AsyncOpenAI

from schemas import AggregatedSignalModel, JudgeOutputModel, StructuredRulesModel

STRUCTURE_PROMPT = """You are a policy structurizer for an IDO launchpad.
Given a foundation's natural language criterion for selecting investors, extract:
- Quantitative rules (numeric thresholds)
- A qualitative prompt that captures the INTENT for later LLM judgment
- Weights between quantitative and qualitative evaluation

Output STRICT JSON matching this schema:
{
  "min_wallet_holding_days": int | null,
  "min_wallet_age_days": int | null,
  "min_total_tx_count": int | null,
  "min_dao_votes": int | null,
  "min_github_contributions": int | null,
  "required_token_holdings": [string],
  "qualitative_prompt": string,
  "weights": {"quantitative": float, "qualitative": float}
}

Rules:
- Leave numeric thresholds as null if not implied by the text.
- weights must sum to 1.0.
- qualitative_prompt should guide a later LLM judge; include specific behavioral traits.
- No preamble, no explanation. JSON ONLY.
"""


JUDGE_PROMPT = """You are an IDO investor evaluator running inside a TEE.
You are given:
- A foundation's criterion (already structurized)
- Aggregated on-chain signals (anonymized)
- Optional GitHub activity summary
- Optional self-introduction text

Output STRICT JSON:
{
  "verdict": "Eligible" | "Ineligible",
  "score": int (0..=10000),
  "rationale": string (≤ 280 chars, NO PII, NO wallet addresses,
    NO GitHub username, NO real-name references),
  "quantitative_score": int (0..=10000),
  "qualitative_score": int (0..=10000)
}
"""


class NearAIClient:
    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        *,
        max_attempts: int = 3,
        retry_delay_s: float = 0.25,
    ):
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self.model = model
        self.max_attempts = max_attempts
        self.retry_delay_s = retry_delay_s

    async def chat(
        self,
        *,
        system: str,
        user: str,
        temperature: float = 0,
        response_format: dict | None = None,
    ) -> str:
        last_exc: Exception | None = None
        for attempt in range(self.max_attempts):
            try:
                response = await self.client.chat.completions.create(
                    model=self.model,
                    temperature=temperature,
                    top_p=1,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    response_format=response_format,
                )
                return response.choices[0].message.content or ""
            except Exception as exc:
                last_exc = exc
                if attempt == self.max_attempts - 1:
                    break
                await asyncio.sleep(self.retry_delay_s * (2**attempt))
        raise last_exc or RuntimeError("NEAR AI chat completion failed")

    async def structurize(self, natural_language: str) -> StructuredRulesModel:
        content = await self.chat(
            system=STRUCTURE_PROMPT,
            user=natural_language,
            temperature=0,
            response_format={"type": "json_object"},
        )
        return StructuredRulesModel.model_validate_json(content)

    async def judge(
        self,
        rules: StructuredRulesModel,
        signals: AggregatedSignalModel,
        self_intro: str,
    ) -> JudgeOutputModel:
        content = await self.chat(
            system=JUDGE_PROMPT,
            user=json.dumps(
                {
                    "rules": rules.model_dump(),
                    "signals": signals.anon_summary(),
                    "self_intro": self_intro[:2000],
                }
            ),
            temperature=0,
            response_format={"type": "json_object"},
        )
        return JudgeOutputModel.model_validate_json(content)
