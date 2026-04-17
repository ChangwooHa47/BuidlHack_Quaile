from __future__ import annotations

import asyncio
import json

from openai import AsyncOpenAI

from schemas import AggregatedSignalModel, CriteriaRulesModel, JudgeOutputModel

STRUCTURE_PROMPT = """You are a policy structurizer for an IDO launchpad.
Given a foundation's natural language criterion for selecting investors, extract:
- A list of concrete yes/no evaluation criteria (max 10)
- A qualitative prompt that captures the INTENT for later LLM judgment

Each criterion must be answerable with pass/fail given on-chain signals and self-introduction.

Output STRICT JSON matching this schema:
{
  "criteria": ["criterion 1 description", "criterion 2 description", ...],
  "qualitative_prompt": string
}

Rules:
- Each criterion must be a single, clear yes/no question or threshold check.
- Maximum 10 criteria.
- qualitative_prompt should guide a later LLM judge; include specific behavioral traits.
- No preamble, no explanation. JSON ONLY.
"""


JUDGE_PROMPT = """You are an IDO investor evaluator running inside a TEE.
You are given:
- A list of evaluation criteria to judge (exactly N items)
- Aggregated on-chain signals (anonymized)
- Optional GitHub activity summary
- Optional self-introduction text

For each criterion, determine whether the investor passes (true) or fails (false).

CRITICAL RULES:
1. You MUST return EXACTLY the same number of criteria results as the input list.
   Do NOT add, remove, skip, merge, or reorder criteria.
2. Each result must correspond to the input criterion at the same index.
3. The final verdict is Eligible ONLY if the number of passed criteria meets
   or exceeds the threshold specified in the input. If no threshold is given,
   ALL criteria must pass.

Output STRICT JSON:
{
  "verdict": "Eligible" | "Ineligible",
  "criteria": [
    {"description": "criterion text", "passed": true/false},
    ...
  ],
  "rationale": string (≤ 280 chars, NO PII, NO wallet addresses,
    NO GitHub username, NO real-name references)
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

    async def structurize(self, natural_language: str) -> CriteriaRulesModel:
        content = await self.chat(
            system=STRUCTURE_PROMPT,
            user=natural_language,
            temperature=0,
            response_format={"type": "json_object"},
        )
        return CriteriaRulesModel.model_validate_json(content)

    async def judge(
        self,
        rules: CriteriaRulesModel,
        signals: AggregatedSignalModel,
        self_intro: str,
        threshold: int | None = None,
    ) -> JudgeOutputModel:
        n = len(rules.criteria)
        threshold_instruction = (
            f"Threshold: the investor is Eligible if at least {threshold} out of {n} criteria pass."
            if threshold is not None and threshold < n
            else f"Threshold: ALL {n} criteria must pass for the investor to be Eligible."
        )
        content = await self.chat(
            system=JUDGE_PROMPT,
            user=json.dumps(
                {
                    "criteria_count": n,
                    "threshold_instruction": threshold_instruction,
                    "criteria": rules.criteria,
                    "qualitative_prompt": rules.qualitative_prompt,
                    "signals": signals.anon_summary(),
                    "self_intro": self_intro[:2000],
                }
            ),
            temperature=0,
            response_format={"type": "json_object"},
        )
        return JudgeOutputModel.model_validate_json(content)
