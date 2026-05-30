import { describe, expect, it } from "vitest";
import { SpotAccess } from "../../../../db/schemas/SpotTypeAndAccess";
import { getSpotMarkerPriority } from "./spot-marker-priority";

describe("getSpotMarkerPriority", () => {
  it("uses rating times 100 and treats unrated spots as 150", () => {
    expect(getSpotMarkerPriority({ rating: 4.5 })).toBe(450);
    expect(getSpotMarkerPriority({ rating: 0 })).toBe(150);
    expect(getSpotMarkerPriority({})).toBe(150);
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
});
