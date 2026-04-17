/**
 * `Policy.natural_language` is a single human-readable string on chain, but
 * the admin UI treats it as an ordered list of criterion groups. Each group
 * has a main statement, zero or more sub-bullets, and a public/private flag
 * controlling whether investors see it. To preserve that structure across
 * the contract round-trip without changing the schema, we encode it with
 * three conventions:
 *
 *   main line     : no leading whitespace, plain text
 *   sub bullet    : line begins with `SUB_PREFIX` ("  - "). Belongs to the
 *                   most recent main above it.
 *   private main  : the main line begins with `HIDDEN_PREFIX` ("[HIDDEN] ").
 *                   The prefix is stripped before display and restored on
 *                   save.
 *
 * This file is the single source of truth for the format. Anything that
 * reads or writes `natural_language` should go through `parseCriteria` /
 * `serializeCriteria`, and any surface that renders to investors should go
 * through `publicMainLines` so private groups and sub-bullets stay hidden.
 *
 * Design trade-offs, documented so the next person doesn't rediscover them:
 * - JSON encoding would be more robust but turns the string into something
 *   the TEE's LLM-based `/v1/structurize` step can't read cleanly. Human
 *   text with conventions keeps the TEE prompt quality intact.
 *   (see tee/inference/src/nearai_client.py)
 * - A `Vec<(main, sub, visible)>` field on `Policy` would be ideal, but it
 *   is a contract change and a redeploy. Issue #24 roadmap.
 * - The `[HIDDEN] ` sentinel could collide with genuine operator text. The
 *   parser only treats it as a visibility marker when it is the literal
 *   prefix of a main line, and the serializer only emits it for
 *   `externalVisible === false`, so round-tripping is stable. An operator
 *   who pastes literal `[HIDDEN] foo` as a main statement will see it
 *   flip to private — acceptable corner case.
 */

export interface CriteriaGroup {
  main: string;
  sub: string[];
  externalVisible: boolean;
}

const HIDDEN_PREFIX = "[HIDDEN] ";
const SUB_PREFIX = "  - ";
const LOOSE_SUB_PREFIX = /^\s*-\s+/;
const THRESHOLD_RE = /^\[THRESHOLD:(\d+)\]$/i;

export interface ParsedCriteriaResult {
  groups: CriteriaGroup[];
  threshold: number | null;
}

function normalizeNewlines(input: string): string {
  // Accept CRLF / CR as newline separators.
  return input.replace(/\r\n?/g, "\n");
}

function stripHiddenPrefix(line: string): { visible: boolean; text: string } {
  if (line.startsWith(HIDDEN_PREFIX)) {
    return { visible: false, text: line.slice(HIDDEN_PREFIX.length) };
  }
  return { visible: true, text: line };
}

function isCanonicalSub(line: string): boolean {
  return line.startsWith(SUB_PREFIX);
}

function isIndented(line: string): boolean {
  return /^\s/.test(line);
}

/**
 * Split `natural_language` into criterion groups. The parser is tolerant:
 * lines that don't match the canonical shapes still end up somewhere (as
 * fallback sub or their own main-only group) so operator-typed legacy text
 * round-trips without silently vanishing.
 */
export function parseCriteriaWithThreshold(naturalLanguage: string): ParsedCriteriaResult {
  if (!naturalLanguage) return { groups: [], threshold: null };

  const lines = normalizeNewlines(naturalLanguage)
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "");

  if (lines.length === 0) return { groups: [], threshold: null };

  const groups: CriteriaGroup[] = [];
  let current: CriteriaGroup | null = null;
  let threshold: number | null = null;

  for (const line of lines) {
    const tm = line.trim().match(THRESHOLD_RE);
    if (tm) {
      threshold = parseInt(tm[1], 10);
      continue;
    }

    if (isCanonicalSub(line)) {
      const text = line.slice(SUB_PREFIX.length).trim();
      if (current) {
        current.sub.push(text);
      } else {
        current = { main: text, sub: [], externalVisible: true };
        groups.push(current);
      }
      continue;
    }

    if (isIndented(line)) {
      const looseMatch = line.match(LOOSE_SUB_PREFIX);
      const text = looseMatch ? line.replace(LOOSE_SUB_PREFIX, "") : line.trim();
      if (current) {
        current.sub.push(text);
      } else {
        current = { main: text, sub: [], externalVisible: true };
        groups.push(current);
      }
      continue;
    }

    const { visible, text } = stripHiddenPrefix(line);
    current = { main: text, sub: [], externalVisible: visible };
    groups.push(current);
  }

  // Clamp threshold to valid range
  const totalSubs = groups.reduce((n, g) => n + g.sub.length, 0);
  if (threshold !== null && totalSubs > 0) {
    threshold = Math.max(1, Math.min(threshold, totalSubs));
  } else if (totalSubs === 0) {
    threshold = null;
  }

  return { groups, threshold };
}

/**
 * Convenience wrapper that returns only the groups (backward compat).
 */
export function parseCriteria(naturalLanguage: string): CriteriaGroup[] {
  return parseCriteriaWithThreshold(naturalLanguage).groups;
}

/**
 * Inverse of `parseCriteria`. `parseCriteria(serializeCriteria(groups))` is
 * the identity for groups whose main/sub fields don't embed newlines.
 */
export function serializeCriteria(
  groups: CriteriaGroup[],
  threshold?: number | null,
): string {
  const lines: string[] = [];
  for (const g of groups) {
    const main = g.main.replace(/\r\n?/g, " ").trim();
    if (!main) continue;
    const prefix = g.externalVisible ? "" : HIDDEN_PREFIX;
    lines.push(prefix + main);
    for (const sub of g.sub) {
      const s = sub.replace(/\r\n?/g, " ").trim();
      if (!s) continue;
      lines.push(SUB_PREFIX + s);
    }
  }
  // Append threshold marker if set and less than total sub count.
  const totalSubs = groups.reduce((n, g) => n + g.sub.length, 0);
  if (threshold != null && threshold > 0 && threshold < totalSubs) {
    lines.push(`[THRESHOLD:${threshold}]`);
  }
  return lines.join("\n");
}

/**
 * Lines intended for the public project page — only the `main` of groups
 * that are marked as publicly visible. Sub-bullets and private groups are
 * dropped, which is deliberate: sub-bullets describe how criteria are
 * measured and publishing them would let applicants game the evaluation.
 */
export function publicMainLines(naturalLanguage: string): string[] {
  return parseCriteria(naturalLanguage)
    .filter((g) => g.externalVisible)
    .map((g) => g.main)
    .filter((m) => m.length > 0);
}
