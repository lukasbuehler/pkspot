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
  bounds_raw?: { lat: number; lng: number }[];
  bounds?: Array<{
    latitude?: number;
    longitude?: number;
    _latitude?: number;
    _longitude?: number;
  }>;
};

export interface CommunityBounds {
  bounds_center: [number, number];
  bounds_radius_m: number;
}

export interface CommunityBoundsOptions {
  /**
   * Percentile distance to use for the radius. Localities can safely use the
   * full extent; broader scopes should usually stay conservative so a single
   * outlier does not blow up an entire country-sized circle.
   */
  radiusPercentile?: number;
}

type CommunityPoint = { lat: number; lng: number };

function isFiniteLatLng(point: CommunityPoint): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng);
}

function getGeoPointValue(
  value:
    | {
        latitude?: number;
        longitude?: number;
        _latitude?: number;
        _longitude?: number;
      }
    | null
    | undefined,
): CommunityPoint | null {
  if (!value) {
    return null;
  }

  const lat = value.latitude ?? value._latitude;
  const lng = value.longitude ?? value._longitude;
  const point =
    typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;

  return point && isFiniteLatLng(point) ? point : null;
}

function getSpotPoint(spot: CommunityBoundsSpot): CommunityPoint | null {
  if (
    spot.location_raw &&
    typeof spot.location_raw.lat === "number" &&
    typeof spot.location_raw.lng === "number" &&
    isFiniteLatLng(spot.location_raw)
  ) {
    return {
      lat: spot.location_raw.lat,
      lng: spot.location_raw.lng,
    };
  }

  return getGeoPointValue(spot.location);
}

function getSpotFootprintPoints(spot: CommunityBoundsSpot): CommunityPoint[] {
  const points: CommunityPoint[] = [];
  const anchor = getSpotPoint(spot);
  if (anchor) {
    points.push(anchor);
  }

  for (const point of spot.bounds_raw ?? []) {
    if (
      typeof point.lat === "number" &&
      typeof point.lng === "number" &&
      isFiniteLatLng(point)
    ) {
      points.push({ lat: point.lat, lng: point.lng });
    }
  }

  for (const point of spot.bounds ?? []) {
    const geoPoint = getGeoPointValue(point);
    if (geoPoint) {
      points.push(geoPoint);
    }
  }

  return points;
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

export function getDistanceMeters(
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
 *  - Center = marginal median of spot anchor coordinates.
 *  - Radius = configurable percentile distance from center to a spot footprint
 *    point, with a 5 % cushion. Footprints include bounds vertices, so a
 *    rendered spot polygon does not sit outside its community circle. Using a
 *    percentile below 1 (not the max) keeps a single
 *    outlier spot from blowing up the circle — e.g. an overseas territory
 *    spot that would otherwise stretch France's circle across half of
 *    Europe. 80 % covers the vast majority of the community without
 *    chasing extremes.
 *  - Floor of 1 km so single-spot or tightly-clustered communities still
 *    have a visible footprint.
 */
export function computeCommunityBounds(
  spots: CommunityBoundsSpot[],
  options: CommunityBoundsOptions = {},
): CommunityBounds | null {
  const spotPoints = spots
    .map((spot) => getSpotPoint(spot))
    .filter((point): point is { lat: number; lng: number } => point !== null);
  const footprintPoints = spots.flatMap((spot) => getSpotFootprintPoints(spot));

  if (footprintPoints.length === 0) {
    return null;
  }

  // Marginal median (median lat, median lng). More robust to outlier
  // spots than an arithmetic mean — a single far-flung spot doesn't drag
  // the center of the community away from where most of its spots are.
  // Not the true geometric median (which is harder to compute), but it's
  // sufficient for the "where does this community live" use case.
  const centerSourcePoints =
    spotPoints.length > 0 ? spotPoints : footprintPoints;
  const center = {
    lat: median(centerSourcePoints.map((p) => p.lat)),
    lng: median(centerSourcePoints.map((p) => p.lng)),
  };

  const distances = footprintPoints
    .map((point) => getDistanceMeters(center, point))
    .sort((left, right) => left - right);

  // Percentile distance (linear interpolation between the two nearest ranks).
  // For n=1 this collapses to that one distance (which is 0).
  const percentile = Math.max(0, Math.min(1, options.radiusPercentile ?? 0.8));
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
