import { describe, expect, it } from "vitest";
import { SpotAccess } from "../../../../db/schemas/SpotTypeAndAccess";
import { getSpotMarkerPriority } from "./spot-marker-priority";

describe("getSpotMarkerPriority", () => {
  it("uses rating times 100 and treats unrated spots as 150", () => {
    expect(getSpotMarkerPriority({ rating: 4.5 })).toBe(450);
    expect(getSpotMarkerPriority({ rating: 0 })).toBe(150);
    expect(getSpotMarkerPriority({})).toBe(150);
  });

  it("balances activity against quality without changing the rating", () => {
    const spot = {rating: 4, recent_activity_min_30d: 2};
    const inactiveFiveStar = getSpotMarkerPriority({rating: 5});
    expect(getSpotMarkerPriority(spot)).toBeLessThan(inactiveFiveStar);
    expect(spot.rating).toBe(4);
    expect(getSpotMarkerPriority({...spot, recent_activity_min_30d: 5})).toBeGreaterThan(inactiveFiveStar);
    expect(getSpotMarkerPriority({...spot, recent_activity_min_30d: 10})).toBeGreaterThan(inactiveFiveStar);
    expect(getSpotMarkerPriority({rating: 3, recent_activity_min_30d: 25})).toBeGreaterThan(inactiveFiveStar);
    expect(getSpotMarkerPriority({...spot, recent_activity_min_30d: null})).toBe(400);
    expect(getSpotMarkerPriority({...spot, recent_activity_min_30d: 1000})).toBe(400);
  });

  it("ranks a recently active two-star Spot above photos but below a better-rated Spot with photos", () => {
    const active = getSpotMarkerPriority({ rating: 2, recent_activity_min_30d: 2 });
    expect(active).toBe(260);
    expect(active).toBeGreaterThan(getSpotMarkerPriority({ rating: 2, hasMedia: true }));
    expect(active).toBeLessThan(getSpotMarkerPriority({ rating: 2.5, hasMedia: true }));
  });

  it("adds a 50 point boost for spots with media", () => {
    expect(getSpotMarkerPriority({ rating: 4.5, hasMedia: true })).toBe(500);
    expect(getSpotMarkerPriority({ rating: 0, hasMedia: true })).toBe(200);
  });

  it("boosts iconic spots and penalizes sensitive access types", () => {
    expect(getSpotMarkerPriority({ rating: 5, isIconic: true })).toBe(575);
    expect(
      getSpotMarkerPriority({ rating: 4.5, access: SpotAccess.Residential }),
    ).toBe(425);
    expect(getSpotMarkerPriority({ rating: 4.5, access: SpotAccess.Private })).toBe(
      390,
    );
    expect(
      getSpotMarkerPriority({ rating: 4.5, access: SpotAccess.OffLimits }),
    ).toBe(310);
    expect(
      getSpotMarkerPriority({
        rating: 0,
        access: SpotAccess.OffLimits,
        isIconic: true,
      }),
    ).toBe(275);
  });

  it("drops reported spots by two rating stars", () => {
    expect(getSpotMarkerPriority({ rating: 4.5, isReported: true })).toBe(250);
    expect(
      getSpotMarkerPriority({
        rating: 4.5,
        access: SpotAccess.Private,
        isReported: true,
      }),
    ).toBe(190);
  });
});
