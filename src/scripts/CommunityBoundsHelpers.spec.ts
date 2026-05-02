import { describe, expect, it } from "vitest";
import { computeCommunityBounds } from "./CommunityBoundsHelpers";

describe("computeCommunityBounds", () => {
  it("computes the centroid and buffered radius from raw spot locations", () => {
    const bounds = computeCommunityBounds([
      { location_raw: { lat: 47.36, lng: 8.53 } },
      { location_raw: { lat: 47.38, lng: 8.55 } },
      { location_raw: { lat: 47.37, lng: 8.54 } },
    ]);

    expect(bounds).not.toBeNull();
    expect(bounds?.bounds_center[0]).toBeCloseTo(47.37, 6);
    expect(bounds?.bounds_center[1]).toBeCloseTo(8.54, 6);
    expect(bounds?.bounds_radius_m).toBe(1679);
  });

  it("supports Firestore GeoPoint-like location fields", () => {
    const bounds = computeCommunityBounds([
      { location: { latitude: 47.36, longitude: 8.53 } },
      { location: { _latitude: 47.38, _longitude: 8.55 } },
    ]);

    expect(bounds?.bounds_center[0]).toBeCloseTo(47.37, 6);
    expect(bounds?.bounds_center[1]).toBeCloseTo(8.54, 6);
    expect(bounds?.bounds_radius_m).toBe(1679);
  });

  it("returns null when no spot has a usable location", () => {
    expect(computeCommunityBounds([{}, { location: null }])).toBeNull();
  });
});
