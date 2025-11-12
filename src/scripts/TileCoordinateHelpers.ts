/**
 * Tile coordinate computation utilities
 * Used by both client-side code and cloud functions
 */

export const TILE_SIZE = 256;

/**
 * Web Mercator projection for converting lat/lng to tile coordinates
 */
export function mercatorProjection(
  lat: number,
  lng: number
): { x: number; y: number } {
  var siny = Math.sin((lat * Math.PI) / 180);

  // Truncating to 0.9999 effectively limits latitude to 89.189
  siny = Math.min(Math.max(siny, -0.9999), 0.9999);

  return {
    x: TILE_SIZE * (0.5 + lng / 360),
    y: TILE_SIZE * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)),
  };
}

/**
 * Get unrounded tile coordinates for a location at a specific zoom level
 */
export function getUnroundedTileCoordinatesForLocationAndZoom(
  lat: number,
  lng: number,
  zoom: number
): { x: number; y: number } {
  const scale = 1 << zoom; // 2^zoom
  const worldCoordinate = mercatorProjection(lat, lng);

  return {
    x: (worldCoordinate.x * scale) / TILE_SIZE,
    y: (worldCoordinate.y * scale) / TILE_SIZE,
  };
}

/**
 * Get tile coordinates for a location at a specific zoom level
 */
export function getTileCoordinatesForLocationAndZoom(
  lat: number,
  lng: number,
  zoom: number
): { x: number; y: number } {
  const scale = 1 << zoom; // 2^zoom
  const worldCoordinate = mercatorProjection(lat, lng);

  return {
    x: Math.floor((worldCoordinate.x * scale) / TILE_SIZE),
    y: Math.floor((worldCoordinate.y * scale) / TILE_SIZE),
  };
}

/**
 * Compute all tile coordinates from a location
 * Computes z16 first, then derives all lower zoom levels (z2, z4, z6, z8, z10, z12, z14)
 * using bit-shifting for efficiency
 */
export function computeTileCoordinates(
  lat: number,
  lng: number
): {
  z2: { x: number; y: number };
  z4: { x: number; y: number };
  z6: { x: number; y: number };
  z8: { x: number; y: number };
  z10: { x: number; y: number };
  z12: { x: number; y: number };
  z14: { x: number; y: number };
  z16: { x: number; y: number };
} {
  const tile_coordinates_16 = getTileCoordinatesForLocationAndZoom(
    lat,
    lng,
    16
  );

  const tile_coordinates = {
    z16: tile_coordinates_16,
    z2: { x: 0, y: 0 },
    z4: { x: 0, y: 0 },
    z6: { x: 0, y: 0 },
    z8: { x: 0, y: 0 },
    z10: { x: 0, y: 0 },
    z12: { x: 0, y: 0 },
    z14: { x: 0, y: 0 },
  };

  // Derive all zoom levels from z16 using bit-shifting
  for (let zoom = 16; zoom >= 2; zoom -= 2) {
    (tile_coordinates as any)[`z${zoom}`] = {
      x: tile_coordinates_16.x >> (16 - zoom),
      y: tile_coordinates_16.y >> (16 - zoom),
    };
  }

  return tile_coordinates;
}
