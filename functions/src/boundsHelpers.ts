import { GeoPoint } from "firebase-admin/firestore";

// Maximum bounds radius allowed (2km) - prevents abuse from massive polygons
export const MAX_BOUNDS_RADIUS_M = 2000;

export interface RawLatLng {
  lat: number;
  lng: number;
}

export interface BoundsCalculationResult {
  isValid: boolean;
  boundsRaw: RawLatLng[] | null;
  boundsCenter: [number, number] | null;
  boundsRadiusM: number | null;
  error?: string;
}

/**
 * Extract lat/lng from various GeoPoint-like formats
 */
export function extractLatLng(
  point: GeoPoint | { latitude: number; longitude: number } | any
): RawLatLng | null {
  // Handle Firebase Admin GeoPoint
  const lat = point?.latitude ?? point?._latitude;
  const lng = point?.longitude ?? point?._longitude;

  if (typeof lat === "number" && typeof lng === "number") {
    return { lat, lng };
  }

  // Handle raw {lat, lng} format
  if (typeof point?.lat === "number" && typeof point?.lng === "number") {
    return { lat: point.lat, lng: point.lng };
  }

  return null;
}

/**
 * Haversine distance calculation (returns meters)
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate bounds center (centroid) and radius from an array of GeoPoints.
 * Returns null values if bounds are invalid or too large.
 *
 * @param bounds Array of GeoPoints or raw lat/lng objects
 * @param maxRadiusM Maximum allowed radius (default: 2km)
 */
export function calculateBoundsData(
  bounds:
    | (GeoPoint | { latitude: number; longitude: number } | any)[]
    | undefined,
  maxRadiusM: number = MAX_BOUNDS_RADIUS_M
): BoundsCalculationResult {
  // Invalid bounds
  if (!bounds || !Array.isArray(bounds) || bounds.length < 3) {
    return {
      isValid: false,
      boundsRaw: null,
      boundsCenter: null,
      boundsRadiusM: null,
      error: "Bounds must have at least 3 points",
    };
  }

  // Convert GeoPoints to raw lat/lng
  const boundsRaw: RawLatLng[] = [];
  let sumLat = 0;
  let sumLng = 0;

  for (const point of bounds) {
    const coords = extractLatLng(point);
    if (coords) {
      boundsRaw.push(coords);
      sumLat += coords.lat;
      sumLng += coords.lng;
    }
  }

  if (boundsRaw.length < 3) {
    return {
      isValid: false,
      boundsRaw: null,
      boundsCenter: null,
      boundsRadiusM: null,
      error: "Not enough valid coordinates in bounds",
    };
  }

  // Calculate centroid
  const centerLat = sumLat / boundsRaw.length;
  const centerLng = sumLng / boundsRaw.length;

  // Calculate max radius from center to any vertex
  let maxRadius = 0;
  for (const point of boundsRaw) {
    const distance = haversineDistance(
      centerLat,
      centerLng,
      point.lat,
      point.lng
    );
    if (distance > maxRadius) {
      maxRadius = distance;
    }
  }

  // Check if bounds are too large
  if (maxRadius > maxRadiusM) {
    return {
      isValid: false,
      boundsRaw: boundsRaw, // Still return raw for display purposes
      boundsCenter: null,
      boundsRadiusM: null,
      error: `Bounds radius (${Math.round(
        maxRadius
      )}m) exceeds maximum allowed (${maxRadiusM}m)`,
    };
  }

  return {
    isValid: true,
    boundsRaw,
    boundsCenter: [centerLat, centerLng],
    boundsRadiusM: Math.ceil(maxRadius) + 20, // Add 20m buffer
  };
}

/**
 * Validate bounds size before saving.
 * Returns an error message if bounds are too large, null if valid.
 */
export function validateBoundsSize(
  bounds: (GeoPoint | any)[] | undefined,
  maxRadiusM: number = MAX_BOUNDS_RADIUS_M
): string | null {
  const result = calculateBoundsData(bounds, maxRadiusM);
  return result.error || null;
}
