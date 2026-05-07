import { describe, expect, it } from "vitest";
import {
  RESERVED_SPOT_SLUGS,
  deriveSpotCommunityData,
  getSpotSlugValidationError,
  isDrySpotCandidate,
  isReservedSpotSlug,
  normalizeSpotSlug,
  slugifyUrlSegment,
} from "./SpotLandingHelpers";

describe("SpotLandingHelpers", () => {
  it("should normalize spot slugs", () => {
    expect(normalizeSpotSlug("  Zuerich Hauptbahnhof  ")).toBe(
      "zuerich-hauptbahnhof",
    );
  });

  it("should reject reserved spot slugs", () => {
    expect(RESERVED_SPOT_SLUGS).toContain("community");
    expect(isReservedSpotSlug("community")).toBe(true);
    expect(getSpotSlugValidationError("community")).toContain("reserved");
  });

  it("should reject invalid slug characters", () => {
    expect(getSpotSlugValidationError("hello/world")).toContain(
      "lowercase alphanumeric characters and hyphens",
    );
  });

  it("should derive country and locality landing data", () => {
    expect(
      deriveSpotCommunityData({
        address: {
          locality: "London",
          country: {
            code: "gb",
            name: "United Kingdom",
          },
        },
        type: "parkour gym",
        amenities: {},
      }),
    ).toEqual({
      countryCode: "GB",
      countryNameEn: "United Kingdom",
      countrySlug: "united-kingdom",
      regionCode: undefined,
      regionName: undefined,
      regionSlug: undefined,
      localityName: "London",
      localitySlug: "london",
      isDry: true,
      organizationVerified: false,
    });
  });

  it("should mark covered and indoor spots as dry", () => {
    expect(
      isDrySpotCandidate({
        type: "urban landscape",
        amenities: { covered: true },
      }),
    ).toBe(true);
    expect(
      isDrySpotCandidate({
        type: "urban landscape",
        amenities: { indoor: true },
      }),
    ).toBe(true);
  });

  it("should slugify route segments consistently", () => {
    expect(slugifyUrlSegment("Rio de Janeiro")).toBe("rio-de-janeiro");
  });
});
