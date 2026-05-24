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

  it("should canonicalize Prague/Praha/Hlavní město Praha landing fields to English", () => {
    expect(
      deriveSpotCommunityData({
        address: {
          locality: "Prague",
          region: {
            code: "Prague",
            name: "Prague",
          },
          country: {
            code: "cz",
            name: "Czechia",
          },
        },
        type: "urban landscape",
        amenities: {},
      }),
    ).toMatchObject({
      countryCode: "CZ",
      localityName: "Prague",
      localitySlug: "hlavni-mesto-praha",
      regionName: "Prague",
      regionSlug: "hlavni-mesto-praha",
    });
  });

  it("should canonicalize Milan/Milano and Lombardy/Lombardia landing fields", () => {
    expect(
      deriveSpotCommunityData({
        address: {
          locality: "Milano",
          region: {
            code: "Lombardia",
            name: "Lombardia",
          },
          country: {
            code: "it",
            name: "Italy",
          },
        },
        type: "urban landscape",
        amenities: {},
      }),
    ).toMatchObject({
      countryCode: "IT",
      localityName: "Milan",
      localitySlug: "milan",
      regionName: "Lombardy",
      regionSlug: "lombardy",
    });
  });

  it("should strip Czech postal district suffixes from landing localities", () => {
    expect(
      deriveSpotCommunityData({
        address: {
          locality: "Kladno 1",
          region: {
            code: "Central Bohemian Region",
            name: "Central Bohemian Region",
          },
          country: {
            code: "cz",
            name: "Czechia",
          },
        },
        type: "urban landscape",
        amenities: {},
      }),
    ).toMatchObject({
      countryCode: "CZ",
      localityName: "Kladno",
      localitySlug: "kladno",
    });
  });

  it("should strip Czech okres prefixes from landing localities", () => {
    expect(
      deriveSpotCommunityData({
        address: {
          locality: "Okres Mladá Boleslav",
          region: {
            code: "Central Bohemian Region",
            name: "Central Bohemian Region",
          },
          country: {
            code: "cz",
            name: "Czechia",
          },
        },
        type: "urban landscape",
        amenities: {},
      }),
    ).toMatchObject({
      countryCode: "CZ",
      localityName: "Mladá Boleslav",
      localitySlug: "mlada-boleslav",
    });
  });

  it("should drop unusably short landing localities", () => {
    expect(
      deriveSpotCommunityData({
        address: {
          locality: "M",
          region: {
            code: "Victoria",
            name: "Victoria",
          },
          country: {
            code: "au",
            name: "Australia",
          },
        },
        type: "urban landscape",
        amenities: {},
      }),
    ).toMatchObject({
      countryCode: "AU",
      localityName: undefined,
      localitySlug: undefined,
      regionName: "Victoria",
    });
  });

  it("should canonicalize known truncated locality names", () => {
    expect(
      deriveSpotCommunityData({
        address: {
          locality: "Melbourn",
          region: {
            code: "VIC",
            name: "Victoria",
          },
          country: {
            code: "au",
            name: "Australia",
          },
        },
        type: "urban landscape",
        amenities: {},
      }),
    ).toMatchObject({
      countryCode: "AU",
      localityName: "Melbourne",
      localitySlug: "melbourne",
      regionName: "Victoria",
      regionSlug: "victoria",
    });
  });
});
