import { describe, expect, it } from "vitest";
import {
  averageSpotPhotoCoordinates,
  BOUNDS_MATCH_RADIUS_METERS,
  POINT_MATCH_RADIUS_METERS,
  distanceMeters,
  groupSpotMediaCoordinates,
  rankSpotMediaCandidates,
} from "./spot-media-geo";

describe("spot media matching", () => {
  const origin = { lat: 51.05, lng: -1.35 };

  it("matches a point Spot at 50 m and rejects it beyond the boundary", () => {
    const inside = { lat: origin.lat, lng: origin.lng + 0.0004 };
    const outside = { lat: origin.lat, lng: origin.lng + 0.0009 };
    expect(distanceMeters(origin, inside)).toBeLessThanOrEqual(POINT_MATCH_RADIUS_METERS);
    expect(rankSpotMediaCandidates(origin, [{ id: "point", location: inside }])).toHaveLength(1);
    expect(rankSpotMediaCandidates(origin, [{ id: "point", location: outside }])).toHaveLength(0);
  });

  it("matches a bounded Spot inside and near its polygon edge", () => {
    const bounds = [
      { lat: 51.049, lng: -1.351 },
      { lat: 51.049, lng: -1.349 },
      { lat: 51.051, lng: -1.349 },
      { lat: 51.051, lng: -1.351 },
    ];
    expect(rankSpotMediaCandidates(origin, [{ id: "bounds", bounds }])[0]?.distanceMeters).toBe(0);
    const nearEdge = { lat: 51.04885, lng: -1.35 };
    expect(rankSpotMediaCandidates(nearEdge, [{ id: "bounds", bounds }])[0]?.distanceMeters).toBeLessThanOrEqual(BOUNDS_MATCH_RADIUS_METERS);
  });

  it("sorts equal-distance candidates by stable Spot ID", () => {
    const candidates = [
      { id: "z", location: { lat: origin.lat, lng: origin.lng } },
      { id: "a", location: { lat: origin.lat, lng: origin.lng } },
    ];
    expect(rankSpotMediaCandidates(origin, candidates).map((candidate) => candidate.id)).toEqual(["a", "z"]);
  });

  it("handles antimeridian distances and polygon edges", () => {
    const point = { lat: 0, lng: 179.999 };
    expect(distanceMeters(point, { lat: 0, lng: -179.999 })).toBeLessThan(300);
    const bounds = [
      { lat: -0.001, lng: 179.998 },
      { lat: -0.001, lng: -179.998 },
      { lat: 0.001, lng: -179.998 },
      { lat: 0.001, lng: 179.998 },
    ];
    expect(rankSpotMediaCandidates(point, [{ id: "crossing", bounds }])).toHaveLength(1);
  });

  it("suggests averaged coordinates, including across the date line", () => {
    expect(averageSpotPhotoCoordinates([{ lat: 47, lng: 8 }, { lat: 47.0002, lng: 8.0002 }]).lat)
      .toBeCloseTo(47.0001);
    expect(Math.abs(averageSpotPhotoCoordinates([{ lat: 0, lng: 179.999 }, { lat: 0, lng: -179.999 }]).lng))
      .toBeCloseTo(180);
  });

  it("ignores invalid coordinates instead of matching or looping over them", () => {
    expect(rankSpotMediaCandidates(origin, [{ id: "invalid", bounds: [
      { lat: 0, lng: Infinity }, { lat: 1, lng: 0 }, { lat: 0, lng: 1 },
    ] }])).toEqual([]);
    expect(groupSpotMediaCoordinates([{ id: "invalid", coordinate: { lat: 91, lng: 0 } }]))
      .toEqual([]);
  });

  it("groups conservatively around an average instead of transitive chains", () => {
    const latitude = 51.05;
    const metresToDegrees = (metres: number) => metres / 111_000;
    const groups = groupSpotMediaCoordinates([
      { id: "a", coordinate: { lat: latitude, lng: -1.35 } },
      { id: "b", coordinate: { lat: latitude + metresToDegrees(18), lng: -1.35 } },
      { id: "c", coordinate: { lat: latitude + metresToDegrees(45), lng: -1.35 } },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.assetIds)).toEqual([["a", "b"], ["c"]]);
  });
});
