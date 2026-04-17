"""Tests for criteria_parser — the bridge between the admin-curated
natural_language format and the CriteriaRulesModel that the judge reads."""

from criteria_parser import parse_criteria_from_natural_language


def test_structured_with_subs():
    nl = (
        "Active DeFi traders with cross-chain experience.\n"
        "  - Has the wallet done at least 100 cross-chain swaps?\n"
        "  - Does the wallet hold governance tokens from 2+ DEX protocols?\n"
        "Investors who stayed through the bear market.\n"
        "  - Was the wallet active during the 2022 drawdown?\n"
    )
    rules = parse_criteria_from_natural_language(nl)
    assert rules is not None
    assert len(rules.criteria) == 3
    assert rules.criteria[0] == "Has the wallet done at least 100 cross-chain swaps?"
    assert rules.criteria[2] == "Was the wallet active during the 2022 drawdown?"
    assert "Active DeFi" in rules.qualitative_prompt
    assert "Investors who stayed" in rules.qualitative_prompt


def test_hidden_prefix_stripped():
    nl = (
        "[HIDDEN] Secret internal criterion.\n"
        "  - Does the wallet have a hidden flag?\n"
        "Public criterion.\n"
        "  - Is the wallet active?\n"
    )
    rules = parse_criteria_from_natural_language(nl)
    assert rules is not None
    assert len(rules.criteria) == 2
    # [HIDDEN] should be stripped from the qualitative prompt
    assert "[HIDDEN]" not in rules.qualitative_prompt
    assert "Secret internal criterion" in rules.qualitative_prompt


def test_legacy_flat_returns_none():
    nl = "Active DeFi traders with at least 100 cross-chain swaps in the past 6 months."
    rules = parse_criteria_from_natural_language(nl)
    assert rules is None, "legacy flat text should return None for LLM fallback"


def test_empty_returns_none():
    assert parse_criteria_from_natural_language("") is None
    assert parse_criteria_from_natural_language("   \n\n  ") is None


def test_max_criteria_capped():
    lines = ["Main criterion.\n"]
    for i in range(15):
        lines.append(f"  - Sub criterion {i}\n")
    nl = "".join(lines)
    rules = parse_criteria_from_natural_language(nl)
    assert rules is not None
    assert len(rules.criteria) == 10  # MAX_CRITERIA cap


def test_loose_indent_treated_as_sub():
    nl = (
        "Main statement.\n"
        " - loosely indented sub\n"
        "   - extra indent sub\n"
    )
    rules = parse_criteria_from_natural_language(nl)
    assert rules is not None
    assert len(rules.criteria) == 2
    assert rules.criteria[0] == "loosely indented sub"
    assert rules.criteria[1] == "extra indent sub"


def test_crlf_normalized():
    nl = "Main.\r\n  - Sub one.\r\n  - Sub two.\r\n"
    rules = parse_criteria_from_natural_language(nl)
    assert rules is not None
    assert len(rules.criteria) == 2


def test_orphan_sub_becomes_main():
    nl = "  - Orphan sub without a main above it.\n"
    rules = parse_criteria_from_natural_language(nl)
    # Even though it looks like a sub, with no main it should still be
    # picked up as a criterion so the policy doesn't silently have zero criteria.
    assert rules is not None
    assert len(rules.criteria) == 1
