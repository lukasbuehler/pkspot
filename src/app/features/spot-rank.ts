import type { TrainingRanksSchema } from "../../db/schemas/TrainingSummarySchema";
import { RANK_MIN_VERIFIED_DAYS } from "../../db/utils/training-summary";

/**
 * Where the person stands at one Spot this month.
 *
 * - `ranked`: the nightly job published a rank.
 * - `too_few_people`: they qualify, but fewer than three people checked in.
 * - `pending`: they reached two verified days since the last nightly update.
 * - `needs_days`: one verified day so far; one visit does not make a regular.
 */
export type SpotRankState =
  | { kind: "ranked"; rank: number; tiedWith: number; legend: boolean; verifiedDays: number }
  | { kind: "too_few_people"; verifiedDays: number }
  | { kind: "pending"; verifiedDays: number }
  | { kind: "needs_days"; verifiedDays: number };

/**
 * Combines the published ranks with the person's live verified days. Ranks
 * update once a night, while their own visits count right away.
 */
export function spotRankState(
  ranks: TrainingRanksSchema | null | undefined,
  spotId: string,
  verifiedDays: number,
): SpotRankState | null {
  const published = ranks?.spots[spotId];
  if (published?.status === "ranked" && published.rank) {
    return {
      kind: "ranked",
      rank: published.rank,
      tiedWith: published.tied_with ?? 0,
      legend: published.legend === true,
      verifiedDays: Math.max(verifiedDays, published.verified_days),
    };
  }
  if (published?.status === "too_few_people") {
    return { kind: "too_few_people", verifiedDays: Math.max(verifiedDays, published.verified_days) };
  }
  // Final months no longer change, so live days cannot make a rank pending.
  if (ranks?.final) return null;
  if (verifiedDays >= RANK_MIN_VERIFIED_DAYS) return { kind: "pending", verifiedDays };
  if (verifiedDays > 0) return { kind: "needs_days", verifiedDays };
  return null;
}

/** A short label for lists. */
export function spotRankLabel(state: SpotRankState): string {
  switch (state.kind) {
    case "ranked":
      return state.legend
        ? $localize`:@@spotRank.legend:Local legend`
        : $localize`:@@spotRank.rank:#${state.rank}:rank:`;
    case "too_few_people":
      return $localize`:@@spotRank.tooFewShort:Rank unavailable`;
    case "pending":
      return $localize`:@@spotRank.pendingShort:Rank after tonight's update`;
    case "needs_days":
      return $localize`:@@spotRank.needsDaysShort:1 more day to get ranked`;
  }
}

/** The headline on the Spot page. */
export function spotRankTitle(state: SpotRankState): string {
  switch (state.kind) {
    case "ranked":
      return state.legend
        ? $localize`:@@spotRank.legend:Local legend`
        : $localize`:@@spotRank.rankAtSpot:#${state.rank}:rank: at this Spot`;
    case "too_few_people":
      return $localize`:@@spotRank.tooFewTitle:Rank unavailable`;
    case "pending":
      return $localize`:@@spotRank.pendingTitle:You'll be ranked after tonight's update`;
    case "needs_days":
      return $localize`:@@spotRank.needsDaysTitle:1 more verified day to get ranked`;
  }
}

/** The explanation under the headline. */
export function spotRankDetail(state: SpotRankState): string {
  switch (state.kind) {
    case "ranked":
      if (state.tiedWith === 1) return $localize`:@@spotRank.tiedOne:Tied with 1 other person.`;
      if (state.tiedWith > 1) {
        return $localize`:@@spotRank.tiedMany:Tied with ${state.tiedWith}:count: other people.`;
      }
      return state.legend
        ? $localize`:@@spotRank.legendBody:You trained here on more days than anyone else this month.`
        : $localize`:@@spotRank.rankBody:Ranked by days with a verified check-in this month.`;
    case "too_few_people":
      return $localize`:@@spotRank.tooFewBody:Local Legend only shows a rank when at least three participating accounts have qualifying check-ins this month.`;
    case "pending":
    case "needs_days":
      return $localize`:@@spotRank.needsDaysBody:Ranks count days with a verified check-in. One visit doesn't make a local legend.`;
  }
}

/** How often the person checked in this month, for every state. */
export function spotRankDays(state: SpotRankState): string {
  return state.verifiedDays === 1
    ? $localize`:@@spotRank.oneDay:You checked in here on 1 day this month.`
    : $localize`:@@spotRank.days:You checked in here on ${state.verifiedDays}:count: days this month.`;
}
