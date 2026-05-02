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
 * (distance from centroid to farthest spot, +25% buffer, min 1 km).
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

  const sum = points.reduce(
    (acc, point) => ({
      lat: acc.lat + point.lat,
      lng: acc.lng + point.lng,
    }),
    { lat: 0, lng: 0 }
  );
  const center = {
    lat: sum.lat / points.length,
    lng: sum.lng / points.length,
  };

  const maxDistanceM = Math.max(
    ...points.map((point) => getDistanceMeters(center, point))
  );

  return {
    bounds_center: [center.lat, center.lng],
    bounds_radius_m: Math.max(1000, Math.round(maxDistanceM * 1.25)),
  };
}
