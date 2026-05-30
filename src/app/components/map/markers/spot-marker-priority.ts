import {
  parseSpotAccess,
  SpotAccess,
} from "../../../../db/schemas/SpotTypeAndAccess";

export interface SpotMarkerPriorityInput {
  rating?: number | null;
  access?: string | null;
  isIconic?: boolean;
}

const DEFAULT_UNRATED_SPOT_SCORE = 150;
const ICONIC_SPOT_BOOST = 75;
const ICONIC_SPOT_MIN_SCORE = 275;
const ACCESS_PENALTIES: Partial<Record<SpotAccess, number>> = {
  [SpotAccess.Residential]: -25,
  [SpotAccess.Private]: -60,
  [SpotAccess.OffLimits]: -140,
};

const clampMarkerScore = (score: number): number =>
  Math.max(0, Math.min(999, Math.round(score)));

export function getSpotMarkerPriority(spot: SpotMarkerPriorityInput): number {
  const rating = Number(spot.rating);
  const base =
    Number.isFinite(rating) && rating > 0
      ? Math.min(rating, 5) * 100
      : DEFAULT_UNRATED_SPOT_SCORE;
  const accessPenalty = ACCESS_PENALTIES[parseSpotAccess(spot.access)] ?? 0;
  const iconicBoost = spot.isIconic === true ? ICONIC_SPOT_BOOST : 0;
  const score = base + iconicBoost + accessPenalty;

  return clampMarkerScore(
    spot.isIconic === true ? Math.max(score, ICONIC_SPOT_MIN_SCORE) : score,
  );
}
