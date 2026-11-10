import { describe, expect, it } from "vitest";
import { viewportQuerySegments } from "./viewport-query-segments";

describe("viewportQuerySegments", () => {
  it("keeps an ordinary viewport as one segment", () => {
    expect(viewportQuerySegments({ north: 2, south: 1, west: 8, east: 9 })).toEqual([
      { north: 2, south: 1, west: 8, east: 9 },
    ]);
  });

  it("splits a viewport that crosses the antimeridian", () => {
    expect(viewportQuerySegments({ north: 2, south: 1, west: 170, east: -170 })).toEqual([
      { north: 2, south: 1, west: 170, east: 180 },
      { north: 2, south: 1, west: -180, east: -170 },
    ]);
  });

  it("halves segments wider than 179 degrees", () => {
    expect(viewportQuerySegments({ north: 60, south: -60, west: -170, east: 170 })).toEqual([
      { north: 60, south: -60, west: -170, east: 0 },
      { north: 60, south: -60, west: 0, east: 170 },
    ]);
  });
});
