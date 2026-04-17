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
    parsed = parse_criteria_from_natural_language(nl)
    assert parsed is not None
    assert len(parsed.rules.criteria) == 3
    assert parsed.rules.criteria[0] == "Has the wallet done at least 100 cross-chain swaps?"
    assert parsed.rules.criteria[2] == "Was the wallet active during the 2022 drawdown?"
    assert "Active DeFi" in parsed.rules.qualitative_prompt
    assert "Investors who stayed" in parsed.rules.qualitative_prompt
    assert parsed.threshold is None


def test_hidden_prefix_stripped():
    nl = (
        "[HIDDEN] Secret internal criterion.\n"
        "  - Does the wallet have a hidden flag?\n"
        "Public criterion.\n"
        "  - Is the wallet active?\n"
    )
    parsed = parse_criteria_from_natural_language(nl)
    assert parsed is not None
    assert len(parsed.rules.criteria) == 2
    assert "[HIDDEN]" not in parsed.rules.qualitative_prompt
    assert "Secret internal criterion" in parsed.rules.qualitative_prompt


def test_legacy_flat_returns_none():
    nl = "Active DeFi traders with at least 100 cross-chain swaps in the past 6 months."
    parsed = parse_criteria_from_natural_language(nl)
    assert parsed is None, "legacy flat text should return None for LLM fallback"


def test_empty_returns_none():
    assert parse_criteria_from_natural_language("") is None
    assert parse_criteria_from_natural_language("   \n\n  ") is None


def test_max_criteria_capped():
    lines = ["Main criterion.\n"]
    for i in range(15):
        lines.append(f"  - Sub criterion {i}\n")
    nl = "".join(lines)
    parsed = parse_criteria_from_natural_language(nl)
    assert parsed is not None
    assert len(parsed.rules.criteria) == 10


def test_loose_indent_treated_as_sub():
    nl = (
        "Main statement.\n"
        " - loosely indented sub\n"
        "   - extra indent sub\n"
    )
    parsed = parse_criteria_from_natural_language(nl)
    assert parsed is not None
    assert len(parsed.rules.criteria) == 2
    assert parsed.rules.criteria[0] == "loosely indented sub"
    assert parsed.rules.criteria[1] == "extra indent sub"


def test_crlf_normalized():
    nl = "Main.\r\n  - Sub one.\r\n  - Sub two.\r\n"
    parsed = parse_criteria_from_natural_language(nl)
    assert parsed is not None
    assert len(parsed.rules.criteria) == 2


def test_orphan_sub_becomes_main():
    nl = "  - Orphan sub without a main above it.\n"
    parsed = parse_criteria_from_natural_language(nl)
    assert parsed is not None
    assert len(parsed.rules.criteria) == 1


def test_threshold_parsed():
    nl = (
        "Main criterion.\n"
        "  - Sub 1\n"
        "  - Sub 2\n"
        "  - Sub 3\n"
        "[THRESHOLD:2]\n"
    )
    parsed = parse_criteria_from_natural_language(nl)
    assert parsed is not None
    assert len(parsed.rules.criteria) == 3
    assert parsed.threshold == 2


def test_threshold_clamped_to_count():
    nl = (
        "Main.\n"
        "  - Sub 1\n"
        "  - Sub 2\n"
        "[THRESHOLD:99]\n"
    )
    parsed = parse_criteria_from_natural_language(nl)
    assert parsed is not None
    assert parsed.threshold == 2  # clamped to sub count


def test_threshold_min_one():
    nl = (
        "Main.\n"
        "  - Sub 1\n"
        "[THRESHOLD:0]\n"
    )
    parsed = parse_criteria_from_natural_language(nl)
    assert parsed is not None
    assert parsed.threshold == 1


def test_no_threshold_means_none():
    nl = (
        "Main.\n"
        "  - Sub 1\n"
        "  - Sub 2\n"
    )
    parsed = parse_criteria_from_natural_language(nl)
    assert parsed is not None
    assert parsed.threshold is None
