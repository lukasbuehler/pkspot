import { getTileCoordinatesForLocationAndZoom } from '../../../scripts/TileCoordinateHelpers';
import { isFiniteBoundsLiteral } from '../../shared/map-coordinate-utils';

// A viewport normally contains tens of tiles. Reject transient camera states
// before allocating, rather than letting a corrupt frame lock up the WebView.
export const MAX_VIEWPORT_TILES = 4096;

export function calculateViewportTiles(bounds: google.maps.LatLngBoundsLiteral, zoom: number) {
  if (!isFiniteBoundsLiteral(bounds) || !Number.isFinite(zoom) || zoom < 0 || zoom > 30) return null;
  const z = Math.floor(zoom);
  const count = 2 ** z;
  const ne = getTileCoordinatesForLocationAndZoom(bounds.north, bounds.east, z);
  const sw = getTileCoordinatesForLocationAndZoom(bounds.south, bounds.west, z);
  const normalize = (x: number) => ((x % count) + count) % count;
  const firstX = normalize(sw.x);
  const difference = bounds.east - bounds.west;
  const span = difference < 0 ? difference + 360 : difference;
  const width = span > 359 ? count : ((normalize(ne.x) - firstX + count) % count) + 1;
  const clampY = (y: number) => Math.max(0, Math.min(count - 1, y));
  const minY = clampY(Math.min(ne.y, sw.y));
  const maxY = clampY(Math.max(ne.y, sw.y));
  if (width * (maxY - minY + 1) > MAX_VIEWPORT_TILES) return null;
  const tiles: { x: number; y: number }[] = [];
  for (let offset = 0; offset < width; offset++) {
    const x = (firstX + offset) % count;
    for (let y = minY; y <= maxY; y++) tiles.push({ x, y });
  }
  return { zoom: z, tiles, ne, sw };
}
