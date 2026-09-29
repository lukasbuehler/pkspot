import { describe, expect, it } from 'vitest';
import { calculateViewportTiles, MAX_VIEWPORT_TILES } from './viewport-tiles';

const world = { north: 85, south: -85, west: -180, east: 180 };
describe('bounded viewport tiles', () => {
  it('rejects stale world bounds paired with a street-level zoom before allocating', () => {
    expect(calculateViewportTiles(world, 22)).toBeNull();
  });
  it('does not interpret a zero-width viewport as the entire world', () => {
    const result = calculateViewportTiles({ north: 47, south: 47, east: 8, west: 8 }, 22);
    expect(result?.tiles).toHaveLength(1);
  });
  it('covers the whole world at low zoom without duplicate tiles', () => {
    expect(calculateViewportTiles(world, 2)?.tiles).toHaveLength(16);
  });
  it('wraps a viewport across the date line', () => {
    const result = calculateViewportTiles({ north: 1, south: -1, west: 179, east: -179 }, 4.8);
    expect(result?.zoom).toBe(4);
    expect([...new Set(result?.tiles.map(tile => tile.x))]).toEqual([15, 0]);
  });
  it('rejects invalid camera values and caps allocation', () => {
    for (const zoom of [NaN, Infinity, -1, 31]) expect(calculateViewportTiles(world, zoom)).toBeNull();
    expect(calculateViewportTiles({ ...world, north: NaN }, 4)).toBeNull();
    expect(calculateViewportTiles(world, 6)?.tiles.length).toBeLessThanOrEqual(MAX_VIEWPORT_TILES);
    expect(calculateViewportTiles(world, 7)).toBeNull();
  });
});
