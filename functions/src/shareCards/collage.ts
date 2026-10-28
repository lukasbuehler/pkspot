export const MAX_COMMUNITY_PHOTOS = 16;

export interface PhotoTile {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Split the largest tile on a logical 4×4 grid. Every count fills the same
 * rectangle; earlier photos retain the larger tiles when the count is uneven. */
export function communityPhotoTiles(count: number): PhotoTile[] {
  const tiles: PhotoTile[] = [{ left: 0, top: 0, width: 4, height: 4 }];
  const target = Math.min(MAX_COMMUNITY_PHOTOS, Math.max(0, Math.floor(count)));
  if (!target) return [];
  while (tiles.length < target) {
    const index = tiles.reduce((best, tile, current) =>
      tile.width * tile.height > tiles[best].width * tiles[best].height ? current : best, 0);
    const tile = tiles[index];
    const horizontal = tile.width >= tile.height;
    const first = { ...tile, ...(horizontal ? { width: tile.width / 2 } : { height: tile.height / 2 }) };
    const second = { ...first, ...(horizontal ? { left: tile.left + first.width } : { top: tile.top + first.height }) };
    tiles.splice(index, 1, first, second);
  }
  return tiles.sort((a, b) => b.width * b.height - a.width * a.height || a.top - b.top || a.left - b.left)
    .map((tile) => ({
      left: 300 + tile.left * 225,
      top: Math.round(tile.top * 157.5),
      width: tile.width * 225,
      height: Math.round((tile.top + tile.height) * 157.5) - Math.round(tile.top * 157.5),
    }));
}
