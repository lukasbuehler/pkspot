import type { CommunitySearchPreview } from "../../services/search.service";

interface TrainingLocation {
  lat: number;
  lng: number;
}

export function resolveTrainingCenter(
  area: CommunitySearchPreview | null,
  location: TrainingLocation | null | undefined,
): [number, number] | undefined {
  if (area?.boundsCenter) return area.boundsCenter;
  return location ? [location.lat, location.lng] : undefined;
}

export function resolveTrainingSpotRadiusKm(
  area: CommunitySearchPreview | null,
  fallbackRadiusKm = 25,
): number {
  const areaRadiusM = area?.boundsRadiusM;
  return areaRadiusM && areaRadiusM > 0
    ? Math.max(1, areaRadiusM / 1000)
    : fallbackRadiusKm;
}
