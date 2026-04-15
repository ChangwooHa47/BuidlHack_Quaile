"""Mock LLM client for demo without network."""

from __future__ import annotations

from schemas import (
    AggregatedSignalModel,
    CriteriaRulesModel,
    CriterionResult,
    JudgeOutputModel,
)


class MockLlmClient:
    """Returns hardcoded responses for demo stability."""

    async def structurize(self, natural_language: str) -> CriteriaRulesModel:
        return CriteriaRulesModel(
            criteria=[
                "Has held tokens for more than 90 days",
                "Has participated in DAO governance at least 3 times",
                "Has multi-chain activity across 2+ networks",
                "Wallet age exceeds 180 days",
                "Has meaningful GitHub contributions",
            ],
            qualitative_prompt="Evaluate long-term conviction and ecosystem participation.",
        )

    async def judge(
        self,
        rules: CriteriaRulesModel,
        signals: AggregatedSignalModel,
        self_intro: str,
    ) -> JudgeOutputModel:
        # Use signal data to make the mock slightly dynamic
        summary = signals.anon_summary()
        holding = summary.get("avg_holding_days", 0)
        dao = summary.get("dao_votes", 0)
        evm_count = summary.get("evm_wallet_count", 0)
        near_count = summary.get("near_wallet_count", 0)
        github = summary.get("github_contribs", 0)

        results = [
            CriterionResult(description="Has held tokens for more than 90 days", passed=holding > 90),
            CriterionResult(description="Has participated in DAO governance at least 3 times", passed=dao >= 3),
            CriterionResult(description="Has multi-chain activity across 2+ networks", passed=(evm_count + near_count) >= 2),
            CriterionResult(description="Wallet age exceeds 180 days", passed=holding > 180),
            CriterionResult(description="Has meaningful GitHub contributions", passed=github > 10),
        ]

        all_pass = all(r.passed for r in results)
        passed = sum(1 for r in results if r.passed)

        return JudgeOutputModel(
            verdict="Eligible" if all_pass else "Ineligible",
            criteria=results,
            rationale=f"Evaluation complete: {passed}/{len(results)} criteria met.",
        )
