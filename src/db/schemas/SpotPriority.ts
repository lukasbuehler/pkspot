import { normalizeRecentActivityMin30d } from "./CheckInActivitySchema";

export interface SpotPriorityInput {
  rating?: number | null;
  recent_activity_min_30d?: number | null;
  access?: string | null;
  isIconic?: boolean;
  isReported?: boolean;
  hasMedia?: boolean;
}

export const DEFAULT_UNRATED_SPOT_SCORE = 150;
export const ICONIC_SPOT_BOOST = 75;
export const ICONIC_SPOT_MIN_SCORE = 275;
export const MEDIA_SPOT_BOOST = 50;
export const REPORTED_SPOT_PENALTY = -200;

// Additive ranking points, not a change to the displayed star rating.
// Even the smallest activity band outweighs the photo bonus at equal ratings.
const ACTIVITY_BOOST = { 2: 60, 5: 110, 10: 185, 25: 260 } as const;

const ACCESS_PENALTIES: Record<string, number> = {
  residential: -25,
  private: -60,
  "off-limits": -140,
};

const clampSpotPriority = (score: number): number =>
  Math.max(0, Math.min(999, Math.round(score)));

export function getSpotPriority(spot: SpotPriorityInput): number {
  const rating = Number(spot.rating);
  const base =
    Number.isFinite(rating) && rating > 0
      ? Math.min(rating, 5) * 100
      : DEFAULT_UNRATED_SPOT_SCORE;
  const access = spot.access?.trim().toLowerCase() ?? "";
  const accessPenalty = ACCESS_PENALTIES[access] ?? 0;
  const iconicBoost = spot.isIconic === true ? ICONIC_SPOT_BOOST : 0;
  const mediaBoost = spot.hasMedia === true ? MEDIA_SPOT_BOOST : 0;
  const reportPenalty =
    spot.isReported === true ? REPORTED_SPOT_PENALTY : 0;
  const band = normalizeRecentActivityMin30d(spot.recent_activity_min_30d);
  const activityBoost = band === null ? 0 : ACTIVITY_BOOST[band];
  const score =
    base + activityBoost + iconicBoost + mediaBoost + accessPenalty + reportPenalty;
  const minimumScore =
    spot.isIconic === true ? Math.max(score, ICONIC_SPOT_MIN_SCORE) : score;

  return clampSpotPriority(minimumScore);
}
