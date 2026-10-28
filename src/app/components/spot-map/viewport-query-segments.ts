export interface QueryBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Splits viewport bounds into geo-polygon query segments that Typesense
 * reads unambiguously: at the antimeridian, and into halves when a segment
 * spans more than 179° of longitude (a wider polygon could wrap the wrong way).
 */
export function viewportQuerySegments(bounds: QueryBounds): QueryBounds[] {
  const { north, south, east, west } = bounds;
  const strips: [number, number][] = west > east ? [[west, 180], [-180, east]] : [[west, east]];
  return strips.flatMap(([from, to]) => {
    if (to - from <= 179) return [{ north, south, west: from, east: to }];
    const middle = (from + to) / 2;
    return [
      { north, south, west: from, east: middle },
      { north, south, west: middle, east: to },
    ];
  });
}
