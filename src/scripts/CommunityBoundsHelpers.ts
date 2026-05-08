type CommunityBoundsSpot = {
  location_raw?: { lat: number; lng: number };
  location?:
    | {
        latitude?: number;
        longitude?: number;
        _latitude?: number;
        _longitude?: number;
      }
    | null;
};

export interface CommunityBounds {
  bounds_center: [number, number];
  bounds_radius_m: number;
}

function getSpotPoint(
  spot: CommunityBoundsSpot
): { lat: number; lng: number } | null {
  if (
    spot.location_raw &&
    typeof spot.location_raw.lat === "number" &&
    typeof spot.location_raw.lng === "number"
  ) {
    return {
      lat: spot.location_raw.lat,
      lng: spot.location_raw.lng,
    };
  }

  const loc = spot.location;
  if (!loc) {
    return null;
  }

  const lat = loc.latitude ?? loc._latitude;
  const lng = loc.longitude ?? loc._longitude;
  return typeof lat === "number" && typeof lng === "number"
    ? { lat, lng }
    : null;
}

/**
 * Median of a numeric array. Returns 0 for an empty array (callers
 * already guard against that). Mutates a copy via sort, not the input.
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function getDistanceMeters(
  left: { lat: number; lng: number },
  right: { lat: number; lng: number }
): number {
  const earthRadiusM = 6371e3;
  const leftLat = (left.lat * Math.PI) / 180;
  const rightLat = (right.lat * Math.PI) / 180;
  const deltaLat = ((right.lat - left.lat) * Math.PI) / 180;
  const deltaLng = ((right.lng - left.lng) * Math.PI) / 180;
  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(leftLat) *
      Math.cos(rightLat) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  return (
    2 *
    earthRadiusM *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

/**
 * Compute a `bounds_center` (lat/lng centroid) and `bounds_radius_m`
 * for a community.
 *
 * Algorithm:
 *  - Centroid = arithmetic mean of all spot coordinates.
 *  - Radius = **80th percentile** distance from centroid to a spot, with
 *    a 5 % cushion. Using a percentile (not the max) keeps a single
 *    outlier spot from blowing up the circle — e.g. an overseas territory
 *    spot that would otherwise stretch France's circle across half of
 *    Europe. 80 % covers the vast majority of the community without
 *    chasing extremes.
 *  - Floor of 1 km so single-spot or tightly-clustered communities still
 *    have a visible footprint.
 */
export function computeCommunityBounds(
  spots: CommunityBoundsSpot[]
): CommunityBounds | null {
  const points = spots
    .map((spot) => getSpotPoint(spot))
    .filter((point): point is { lat: number; lng: number } => point !== null);

  if (points.length === 0) {
    return null;
  }

  // Marginal median (median lat, median lng). More robust to outlier
  // spots than an arithmetic mean — a single far-flung spot doesn't drag
  // the center of the community away from where most of its spots are.
  // Not the true geometric median (which is harder to compute), but it's
  // sufficient for the "where does this community live" use case.
  const center = {
    lat: median(points.map((p) => p.lat)),
    lng: median(points.map((p) => p.lng)),
  };

  const distances = points
    .map((point) => getDistanceMeters(center, point))
    .sort((left, right) => left - right);

  // 80th-percentile distance (linear interpolation between the two nearest
  // ranks). For n=1 this collapses to that one distance (which is 0).
  const percentile = 0.8;
  const rank = (distances.length - 1) * percentile;
  const lowIndex = Math.floor(rank);
  const highIndex = Math.ceil(rank);
  const fraction = rank - lowIndex;
  const percentileDistance =
    distances[lowIndex] +
    (distances[highIndex] - distances[lowIndex]) * fraction;

  return {
    bounds_center: [center.lat, center.lng],
    bounds_radius_m: Math.max(1000, Math.round(percentileDistance * 1.05)),
  };
}
