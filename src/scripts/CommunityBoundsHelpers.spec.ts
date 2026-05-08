import { describe, expect, it } from "vitest";
import { computeCommunityBounds } from "./CommunityBoundsHelpers";

describe("computeCommunityBounds", () => {
  // Radius algorithm: 80th-percentile distance from centroid + 5 % cushion,
  // floor 1 km. Numbers below are the expected output of that math; if the
  // algorithm changes (e.g. percentile dial moves), update here.

  it("computes the centroid and 80th-percentile radius from raw spot locations", () => {
    const bounds = computeCommunityBounds([
      { location_raw: { lat: 47.36, lng: 8.53 } },
      { location_raw: { lat: 47.38, lng: 8.55 } },
      { location_raw: { lat: 47.37, lng: 8.54 } },
    ]);

    expect(bounds).not.toBeNull();
    expect(bounds?.bounds_center[0]).toBeCloseTo(47.37, 6);
    expect(bounds?.bounds_center[1]).toBeCloseTo(8.54, 6);
    expect(bounds?.bounds_radius_m).toBe(1410);
  });

  it("supports Firestore GeoPoint-like location fields", () => {
    const bounds = computeCommunityBounds([
      { location: { latitude: 47.36, longitude: 8.53 } },
      { location: { _latitude: 47.38, _longitude: 8.55 } },
    ]);

    expect(bounds?.bounds_center[0]).toBeCloseTo(47.37, 6);
    expect(bounds?.bounds_center[1]).toBeCloseTo(8.54, 6);
    expect(bounds?.bounds_radius_m).toBe(1410);
  });

  it("ignores a single far-flung outlier spot via the 80th percentile", () => {
    // 10 tight Zurich-area spots + 1 Paris outlier (~470 km away).
    // Old algorithm (max distance + 25 %) would stretch the radius across
    // western Europe; the percentile keeps it focused on the cluster.
    // With n=11, rank = 10 * 0.8 = 8 → percentile distance is the 9th
    // sorted value, well within the cluster.
    const cluster = Array.from({ length: 10 }, (_, i) => ({
      location_raw: { lat: 47.36 + i * 0.002, lng: 8.53 + i * 0.002 },
    }));
    const bounds = computeCommunityBounds([
      ...cluster,
      { location_raw: { lat: 48.85, lng: 2.35 } }, // Paris outlier
    ]);

    expect(bounds).not.toBeNull();
    // Cluster diameter is ≪ 5 km — anything beyond that means the outlier
    // contaminated the radius.
    expect(bounds!.bounds_radius_m).toBeLessThan(5_000);
  });

  it("returns null when no spot has a usable location", () => {
    expect(computeCommunityBounds([{}, { location: null }])).toBeNull();
  });
});
