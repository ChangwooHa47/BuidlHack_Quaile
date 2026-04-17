"""
Parse `Policy.natural_language` into the same `CriteriaRulesModel` that the
LLM `structurize` call produces.

The admin UI stores criterion groups in natural_language using a lightweight
line-based convention (see frontend/src/lib/criteria.ts for the JS twin):

    main line            : no leading whitespace, plain text
    sub-bullet           : starts with `SUB_PREFIX` ("  - ")
    private-main marker  : main line starts with `HIDDEN_PREFIX` ("[HIDDEN] ")

When the natural_language already contains sub-bullets (because the admin
ran Generate Sub-Criteria and/or manually edited), we extract them directly
as the criteria list. The main lines are joined into a qualitative_prompt
that the judge uses for holistic reasoning.

When the text is legacy free-form (no sub-bullets at all), we fall back to
LLM-based structurize so existing policies without structured sub-criteria
continue to work.
"""

from __future__ import annotations

from schemas import CriteriaRulesModel

HIDDEN_PREFIX = "[HIDDEN] "
SUB_PREFIX = "  - "


def _is_sub_line(line: str) -> bool:
    return line.startswith(SUB_PREFIX)


def _is_indented(line: str) -> bool:
    return len(line) > 0 and line[0] in (" ", "\t")


def parse_criteria_from_natural_language(
    natural_language: str,
) -> CriteriaRulesModel | None:
    """
    Try to extract structured criteria from `natural_language`.

    Returns a `CriteriaRulesModel` when at least one sub-bullet exists,
    or `None` when the text is legacy free-form (the caller should fall back
    to LLM structurize).
    """
    lines = [
        l.rstrip()
        for l in natural_language.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        if l.strip()
    ]
    if not lines:
        return None

    mains: list[str] = []
    subs: list[str] = []

    for line in lines:
        if _is_sub_line(line):
            subs.append(line[len(SUB_PREFIX):].strip())
        elif _is_indented(line):
            # Non-canonical indent — treat as sub.
            stripped = line.lstrip()
            if stripped.startswith("- "):
                stripped = stripped[2:]
            subs.append(stripped.strip())
        else:
            # Main line. Strip [HIDDEN] prefix if present (visibility is
            # an FE concern; the TEE should evaluate against all criteria
            # regardless of investor-facing visibility).
            text = line
            if text.startswith(HIDDEN_PREFIX):
                text = text[len(HIDDEN_PREFIX):]
            mains.append(text.strip())

    if not subs:
        # No sub-bullets → legacy free-form. Let the caller fall back to
        # LLM structurize.
        return None

    # Build qualitative_prompt from the main statements.
    qualitative_prompt = (
        "Evaluation context from the foundation's criteria descriptions: "
        + " ".join(mains)
        if mains
        else ""
    )

    return CriteriaRulesModel(
        criteria=subs[:10],  # MAX_CRITERIA cap
        qualitative_prompt=qualitative_prompt,
    )
