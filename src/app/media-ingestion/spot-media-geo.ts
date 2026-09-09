/** Local photo metadata used only to suggest Spots; never public presence. */
export interface SpotMediaCoordinate {
  lat: number;
  lng: number;
}

export interface SpotMediaSpotCandidate {
  id: string;
  name?: string;
  location?: SpotMediaCoordinate;
  bounds?: SpotMediaCoordinate[];
}

export interface RankedSpotMediaCandidate extends SpotMediaSpotCandidate {
  distanceMeters: number;
  matchKind: "point" | "bounds";
}

export const POINT_MATCH_RADIUS_METERS = 50;
export const BOUNDS_MATCH_RADIUS_METERS = 20;
export const PROPOSED_GROUP_RADIUS_METERS = 20;

const EARTH_RADIUS_METERS = 6_371_000;

const isCoordinate = (point: SpotMediaCoordinate): boolean =>
  Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
  Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;

export function distanceMeters(
  first: SpotMediaCoordinate,
  second: SpotMediaCoordinate,
): number {
  const firstLat = (first.lat * Math.PI) / 180;
  const secondLat = (second.lat * Math.PI) / 180;
  const deltaLat = ((second.lat - first.lat) * Math.PI) / 180;
  const deltaLng = ((second.lng - first.lng) * Math.PI) / 180;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(firstLat) *
      Math.cos(secondLat) *
      Math.sin(deltaLng / 2) ** 2;
  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)))
  );
}

function pointInPolygon(
  point: SpotMediaCoordinate,
  polygon: SpotMediaCoordinate[],
): boolean {
  // Unwrap longitudes around the asset so polygons crossing +/-180 degrees
  // are treated as one local planar shape instead of spanning the globe.
  const longitude = (value: number): number => {
    let normalized = value;
    while (normalized - point.lng > 180) normalized -= 360;
    while (normalized - point.lng < -180) normalized += 360;
    return normalized;
  };
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = {
      ...polygon[index],
      lng: longitude(polygon[index].lng),
    };
    const previousPoint = {
      ...polygon[previous],
      lng: longitude(polygon[previous].lng),
    };
    const intersects =
      currentPoint.lat > point.lat !== previousPoint.lat > point.lat &&
      point.lng <
        ((previousPoint.lng - currentPoint.lng) *
          (point.lat - currentPoint.lat)) /
          (previousPoint.lat - currentPoint.lat) +
          currentPoint.lng;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToSegmentMeters(
  point: SpotMediaCoordinate,
  start: SpotMediaCoordinate,
  end: SpotMediaCoordinate,
): number {
  const latitudeScale = 111_000;
  const longitudeScale = latitudeScale * Math.cos((point.lat * Math.PI) / 180);
  const unwrap = (value: number): number => {
    let normalized = value;
    while (normalized - point.lng > 180) normalized -= 360;
    while (normalized - point.lng < -180) normalized += 360;
    return normalized;
  };
  const px = point.lng * longitudeScale;
  const py = point.lat * latitudeScale;
  const sx = unwrap(start.lng) * longitudeScale;
  const sy = start.lat * latitudeScale;
  const ex = unwrap(end.lng) * longitudeScale;
  const ey = end.lat * latitudeScale;
  const dx = ex - sx;
  const dy = ey - sy;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSquared));
  return Math.hypot(px - (sx + t * dx), py - (sy + t * dy));
}

function effectiveDistanceMeters(
  point: SpotMediaCoordinate,
  candidate: SpotMediaSpotCandidate,
): { distanceMeters: number; matchKind: "point" | "bounds" } | null {
  const centerDistance = candidate.location
    ? distanceMeters(point, candidate.location)
    : Number.POSITIVE_INFINITY;
  if (!candidate.bounds || candidate.bounds.length < 3) {
    return centerDistance <= POINT_MATCH_RADIUS_METERS
      ? { distanceMeters: centerDistance, matchKind: "point" }
      : null;
  }

  if (pointInPolygon(point, candidate.bounds)) {
    return { distanceMeters: 0, matchKind: "bounds" };
  }
  let edgeDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < candidate.bounds.length; index++) {
    edgeDistance = Math.min(
      edgeDistance,
      distanceToSegmentMeters(
        point,
        candidate.bounds[index],
        candidate.bounds[(index + 1) % candidate.bounds.length],
      ),
    );
  }
  return edgeDistance <= BOUNDS_MATCH_RADIUS_METERS
    ? { distanceMeters: Math.min(centerDistance, edgeDistance), matchKind: "bounds" }
    : null;
}

export function rankSpotMediaCandidates(
  point: SpotMediaCoordinate,
  candidates: readonly SpotMediaSpotCandidate[],
): RankedSpotMediaCandidate[] {
  if (!isCoordinate(point)) return [];
  return candidates
    .filter((candidate) =>
      (!candidate.location || isCoordinate(candidate.location)) &&
      (!candidate.bounds || candidate.bounds.every(isCoordinate)),
    )
    .flatMap((candidate) => {
      const match = effectiveDistanceMeters(point, candidate);
      return match ? [{ ...candidate, ...match }] : [];
    })
    .sort(
      (first, second) =>
        first.distanceMeters - second.distanceMeters ||
        first.id.localeCompare(second.id),
    );
}

export interface SpotMediaCoordinateAsset {
  id: string;
  coordinate: SpotMediaCoordinate;
}

export interface SpotMediaCoordinateGroup {
  id: string;
  coordinate: SpotMediaCoordinate;
  assetIds: string[];
}

/** Average nearby photo coordinates locally; handle groups crossing the date line. */
export function averageSpotPhotoCoordinates(points: readonly SpotMediaCoordinate[]): SpotMediaCoordinate {
  if (!points.length || points.some((point) => !isCoordinate(point))) {
    throw new Error("Photo coordinates are missing or invalid");
  }
  const origin = points[0].lng;
  const lat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const longitude = points.reduce((sum, point) => {
    const delta = ((point.lng - origin + 540) % 360) - 180;
    return sum + origin + delta;
  }, 0) / points.length;
  return { lat, lng: ((longitude + 540) % 360) - 180 };
}

/** Deterministic, conservative grouping for assets without an existing Spot. */
export function groupSpotMediaCoordinates(
  assets: readonly SpotMediaCoordinateAsset[],
): SpotMediaCoordinateGroup[] {
  const groups: SpotMediaCoordinateAsset[][] = [];
  for (const asset of assets.filter((item) => isCoordinate(item.coordinate)).sort((a, b) => a.id.localeCompare(b.id))) {
    const group = groups.find((candidate) => {
      const proposed = [...candidate, asset];
      const center = averageSpotPhotoCoordinates(proposed.map((item) => item.coordinate));
      return proposed.every(
        (item) =>
          distanceMeters(center, item.coordinate) <= PROPOSED_GROUP_RADIUS_METERS,
      );
    });
    if (group) group.push(asset);
    else groups.push([asset]);
  }
  return groups.map((group, index) => {
    const coordinate = averageSpotPhotoCoordinates(group.map((item) => item.coordinate));
    return {
      id: `proposal-${index + 1}`,
      coordinate,
      assetIds: group.map((item) => item.id),
    };
  });
}
