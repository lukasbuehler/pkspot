/**
 * Relevance helpers for the search dropdown.
 *
 * Typesense already orders hits inside one collection by `_text_match`. These
 * helpers add what Typesense cannot do for us: comparing the strength of the
 * best hit across collections (to order the dropdown sections) and applying
 * secondary criteria (rating, Event timing) only between hits whose text match
 * is equally strong.
 */

/** The parts of Typesense's `text_match_info` that the ranking relies on. */
export interface SearchTextMatch {
  tokensMatched: number;
  bestFieldWeight: number;
  typoPrefixScore: number;
}

export type SearchSectionKind = "communities" | "events" | "places" | "spots";

export interface SearchSectionCandidate {
  kind: SearchSectionKind;
  /** Strength of the section's best result; `null` while it is still loading. */
  strength: number | null;
}

/** Tie-break order when two sections are equally relevant. */
const DEFAULT_SECTION_ORDER: readonly SearchSectionKind[] = [
  "communities",
  "events",
  "places",
  "spots",
];

/** Strength of a Google Place that matches the query as a location. */
export const GOOD_PLACE_MATCH_STRENGTH = 105;

/** Strength that sorts a section after every Typesense result. */
export const LAST_SECTION_STRENGTH = -1;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Read `text_match_info` from a raw Typesense hit. */
export function readTextMatch(hit: unknown): SearchTextMatch | undefined {
  const info = (hit as { text_match_info?: Record<string, unknown> } | null)
    ?.text_match_info;
  if (!info || !isFiniteNumber(info["tokens_matched"])) return undefined;

  return {
    tokensMatched: info["tokens_matched"],
    bestFieldWeight: isFiniteNumber(info["best_field_weight"])
      ? info["best_field_weight"]
      : 0,
    typoPrefixScore: isFiniteNumber(info["typo_prefix_score"])
      ? info["typo_prefix_score"]
      : 0,
  };
}

export function countQueryTokens(query: string): number {
  return Math.max(
    1,
    query
      .trim()
      .split(/\s+/)
      .filter((token) => /[\p{L}\p{N}]/u.test(token)).length,
  );
}

function normalizeSearchText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * How closely a result's own name matches the query, 0–10. Typesense reports
 * which field matched only as a per-collection rank, so the name itself is
 * compared here to tell a Spot called "Menlo Skatepark" from one that merely
 * lies in Menlo Park.
 */
export function nameMatchBonus(
  query: string,
  name: string | undefined,
): number {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedName = normalizeSearchText(name ?? "");
  if (!normalizedQuery || !normalizedName) return 0;
  if (normalizedName === normalizedQuery) return 10;
  if (normalizedName.startsWith(normalizedQuery)) return 8;

  const nameWords = normalizedName.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const queryWords = normalizedQuery.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const everyWordStartsAName =
    queryWords.length > 0 &&
    queryWords.every((word) => nameWords.some((n) => n.startsWith(word)));
  return everyWordStartsAName ? 6 : 0;
}

/**
 * Comparable relevance of one result, roughly 0–110: the share of query words
 * it matched dominates, and a match on the result's own name separates
 * results that matched the same words elsewhere (address, description).
 */
export function textMatchStrength(
  match: SearchTextMatch | undefined,
  queryTokenCount: number,
  query: string,
  name: string | undefined,
): number {
  if (!match) return 0;
  const coverage = Math.min(1, match.tokensMatched / queryTokenCount);
  return coverage * 100 + nameMatchBonus(query, name);
}

/**
 * Order the dropdown sections by their strongest result. Sections that are
 * still loading follow the loaded ones, and equally strong sections keep the
 * default communities → Events → places → Spots order.
 */
export function orderSearchSections(
  candidates: readonly SearchSectionCandidate[],
): SearchSectionKind[] {
  const rank = (kind: SearchSectionKind) => DEFAULT_SECTION_ORDER.indexOf(kind);
  const strengthOf = (candidate: SearchSectionCandidate) =>
    candidate.strength ?? 0;

  return [...candidates]
    .sort(
      (a, b) => strengthOf(b) - strengthOf(a) || rank(a.kind) - rank(b.kind),
    )
    .map((candidate) => candidate.kind);
}

/**
 * Apply a secondary ordering only between neighbouring hits of the same text
 * match tier. Typesense returns hits best match first, so tiers are contiguous
 * runs and the tier order itself is never changed.
 */
export function reorderWithinTiers<T>(
  hits: readonly T[],
  tierOf: (hit: T) => string,
  compare: (a: T, b: T) => number,
): T[] {
  const result: T[] = [];
  let run: T[] = [];
  let runTier: string | null = null;

  const flush = () => {
    result.push(...[...run].sort(compare));
    run = [];
  };

  for (const hit of hits) {
    const tier = tierOf(hit);
    if (runTier !== null && tier !== runTier) flush();
    runTier = tier;
    run.push(hit);
  }
  flush();
  return result;
}

/** Hits with the same tier key matched the same words in equally weighted fields. */
export function textMatchTier(match: SearchTextMatch | undefined): string {
  return match
    ? `${match.tokensMatched}:${match.bestFieldWeight}:${match.typoPrefixScore}`
    : "none";
}

/**
 * Events inside an equally relevant tier: running and upcoming ones first,
 * soonest first, then past editions, most recent first.
 */
export function compareEventsByTiming(
  a: { startSeconds?: number; endSeconds?: number },
  b: { startSeconds?: number; endSeconds?: number },
  nowSeconds: number,
): number {
  const isPast = (e: { startSeconds?: number; endSeconds?: number }) =>
    (e.endSeconds ?? e.startSeconds ?? 0) < nowSeconds;
  const aPast = isPast(a);
  const bPast = isPast(b);
  if (aPast !== bPast) return aPast ? 1 : -1;

  const aStart = a.startSeconds ?? 0;
  const bStart = b.startSeconds ?? 0;
  return aPast ? bStart - aStart : aStart - bStart;
}
