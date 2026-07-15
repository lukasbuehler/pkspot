import { describe, expect, it } from "vitest";
import { SpotAccess } from "../schemas/SpotTypeAndAccess";
import { makeSmartAmenitiesArray } from "./Amenities";

describe("makeSmartAmenitiesArray", () => {
  it.each([
    {
      environment: "indoor and outdoor",
      amenities: { indoor: true, outdoor: true, covered: true },
    },
    {
      environment: "not classified",
      amenities: { covered: true },
    },
  ])("keeps a covered $environment spot visible in compact headers", ({ amenities }) => {
    const smartAmenities = makeSmartAmenitiesArray(amenities);

    expect(smartAmenities).toContainEqual(
      expect.objectContaining({
        name: "Dry spot",
        priority: "high",
      })
    );
  });

  it("does not duplicate entry fee when commercial access already shows paid access", () => {
    const amenities = makeSmartAmenitiesArray(
      {
        indoor: true,
        entry_fee: true,
      },
      undefined,
      SpotAccess.Commercial
    );

    expect(amenities.map((amenity) => amenity.name)).not.toContain(
      "Entry fee"
    );
    expect(amenities.map((amenity) => amenity.icon)).not.toContain("paid");
  });

  it("keeps entry fee visible when access does not already describe paid access", () => {
    const amenities = makeSmartAmenitiesArray(
      {
        indoor: true,
        entry_fee: true,
      },
      undefined,
      SpotAccess.Public
    );

    expect(amenities).toContainEqual(
      expect.objectContaining({
        name: "Entry fee",
        icon: "paid",
        priority: "high",
      })
    );
  });
});
