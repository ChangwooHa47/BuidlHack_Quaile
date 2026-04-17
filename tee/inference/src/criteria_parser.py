"""
Parse `Policy.natural_language` into structured criteria for the TEE judge.

Convention (shared with frontend/src/lib/criteria.ts):

    main line            : no leading whitespace, plain text
    sub-bullet           : starts with `SUB_PREFIX` ("  - ")
    private-main marker  : main line starts with `HIDDEN_PREFIX` ("[HIDDEN] ")
    threshold marker     : a standalone line `[THRESHOLD:N]` where N is the
                           minimum number of sub-criteria that must pass.
                           If absent, defaults to total sub count (= all must pass).

When sub-bullets exist, we extract them as criteria. Otherwise return None
so the caller falls back to LLM structurize.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from schemas import CriteriaRulesModel

HIDDEN_PREFIX = "[HIDDEN] "
SUB_PREFIX = "  - "
THRESHOLD_RE = re.compile(r"^\[THRESHOLD:(\d+)\]$", re.IGNORECASE)


@dataclass
class ParsedCriteria:
    rules: CriteriaRulesModel
    threshold: int | None


def _is_sub_line(line: str) -> bool:
    return line.startswith(SUB_PREFIX)


def _is_indented(line: str) -> bool:
    return len(line) > 0 and line[0] in (" ", "\t")


def parse_criteria_from_natural_language(
    natural_language: str,
) -> ParsedCriteria | None:
    """
    Try to extract structured criteria + threshold from `natural_language`.

    Returns a `ParsedCriteria` when at least one sub-bullet exists,
    or `None` for legacy free-form text (caller should fall back to LLM).
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
    threshold: int | None = None

    for line in lines:
        # Check for threshold marker
        m = THRESHOLD_RE.match(line.strip())
        if m:
            threshold = int(m.group(1))
            continue

        if _is_sub_line(line):
            subs.append(line[len(SUB_PREFIX):].strip())
        elif _is_indented(line):
            stripped = line.lstrip()
            if stripped.startswith("- "):
                stripped = stripped[2:]
            subs.append(stripped.strip())
        else:
            text = line
            if text.startswith(HIDDEN_PREFIX):
                text = text[len(HIDDEN_PREFIX):]
            mains.append(text.strip())

    if not subs:
        return None

    capped_subs = subs[:10]

    # Clamp threshold to valid range
    if threshold is not None:
        threshold = max(1, min(threshold, len(capped_subs)))

    qualitative_prompt = (
        "Evaluation context from the foundation's criteria descriptions: "
        + " ".join(mains)
        if mains
        else ""
    )

    return ParsedCriteria(
        rules=CriteriaRulesModel(
            criteria=capped_subs,
            qualitative_prompt=qualitative_prompt,
        ),
        threshold=threshold,
    )
