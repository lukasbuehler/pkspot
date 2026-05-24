import { describe, expect, it } from "vitest";
import {
  buildCommunitySlugCandidates,
  buildLocalityCommunityKey,
  getSpotCommunityCandidates,
  normalizeCommunitySlug,
} from "./CommunityHelpers";

describe("CommunityHelpers", () => {
  it("should normalize community slugs to ASCII", () => {
    expect(normalizeCommunitySlug(" Pfäffikon ")).toBe("pfaeffikon");
  });

  it("should build locality community keys with region disambiguation", () => {
    expect(buildLocalityCommunityKey("CH", "pfaeffikon", "zh")).toBe(
      "locality:ch:zh:pfaeffikon"
    );
  });

  it("should prefer region suffixes for same-country disambiguation", () => {
    expect(
      buildCommunitySlugCandidates({
        displayName: "Pfäffikon",
        geography: {
          countryCode: "CH",
          regionCode: "ZH",
        },
      })
    ).toEqual([
      "pfaeffikon",
      "pfaeffikon-zh",
      "pfaeffikon-ch",
      "pfaeffikon-zh-ch",
    ]);
  });

  it("should prefer country suffixes for cross-country disambiguation", () => {
    expect(
      buildCommunitySlugCandidates(
        {
          displayName: "London",
          geography: {
            countryCode: "GB",
            regionCode: "LDN",
          },
        },
        "CA"
      )
    ).toEqual(["london", "london-uk", "london-ldn", "london-ldn-uk"]);
  });

  it("should derive country and locality candidates from spot geography", () => {
    expect(
      getSpotCommunityCandidates({
        address: {
          locality: "Pfäffikon",
          region: {
            code: "ZH",
            name: "Zurich",
          },
          country: {
            code: "CH",
            name: "Switzerland",
          },
        },
        landing: null,
      } as any)
    ).toMatchObject([
      {
        communityKey: "country:ch",
        scope: "country",
      },
      {
        communityKey: "locality:ch:zh:pfaeffikon",
        scope: "locality",
        displayName: "Pfäffikon",
      },
    ]);
  });

  it("should use country names for country community display names", () => {
    expect(
      getSpotCommunityCandidates({
        address: {
          country: {
            code: "IT",
            name: "Italy",
          },
        },
        landing: null,
      })
    ).toMatchObject([
      {
        communityKey: "country:it",
        displayName: "Italy",
        geography: {
          countryName: "Italy",
          countrySlug: "italy",
        },
      },
    ]);
  });

  it("should add search aliases for country communities", () => {
    expect(
      buildCommunitySlugCandidates({
        displayName: "United States",
        geography: {
          countryCode: "US",
          countryName: "United States",
          countrySlug: "united-states",
        },
      })
    ).toContain("usa");
  });

  it("should canonicalize Prague/Praha/Hlavní město Praha address fields in getSpotCommunityCandidates", () => {
    expect(
      getSpotCommunityCandidates({
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
        landing: null,
      } as any)
    ).toContainEqual(
      expect.objectContaining({
        communityKey: "locality:cz:hlavni-mesto-praha:hlavni-mesto-praha",
        scope: "locality",
        displayName: "Prague",
      })
    );
  });

  it("should canonicalize Milan/Milano community candidates to one English key", () => {
    expect(
      getSpotCommunityCandidates({
        address: {
          locality: "Milano",
          localityLocal: "Milano",
          region: {
            code: "Lombardia",
            name: "Lombardia",
            localName: "Lombardia",
          },
          country: {
            code: "it",
            name: "Italy",
          },
        },
        landing: null,
      } as any)
    ).toContainEqual(
      expect.objectContaining({
        communityKey: "locality:it:lombardy:milan",
        scope: "locality",
        displayName: "Milan",
      })
    );
  });

  it("should collapse Czech numbered postal districts for community candidates", () => {
    expect(
      getSpotCommunityCandidates({
        address: {
          locality: "Strakonice 1",
          region: {
            code: "South Bohemian Region",
            name: "South Bohemian Region",
          },
          country: {
            code: "cz",
            name: "Czechia",
          },
        },
        landing: null,
      } as any)
    ).toContainEqual(
      expect.objectContaining({
        communityKey: "locality:cz:south-bohemian-region:strakonice",
        scope: "locality",
        displayName: "Strakonice",
      })
    );
  });

  it("should collapse Czech okres locality fallbacks for community candidates", () => {
    expect(
      getSpotCommunityCandidates({
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
        landing: null,
      } as any)
    ).toContainEqual(
      expect.objectContaining({
        communityKey: "locality:cz:central-bohemian-region:mlada-boleslav",
        scope: "locality",
        displayName: "Mladá Boleslav",
      })
    );
  });

  it("should prefer address locality over stale landing locality data", () => {
    expect(
      getSpotCommunityCandidates({
        address: {
          sublocality: "Greenwich Peninsula",
          locality: "London",
          region: {
            code: "ENG",
            name: "England",
          },
          country: {
            code: "gb",
            name: "United Kingdom",
          },
        },
        landing: {
          countryCode: "GB",
          countryNameEn: "United Kingdom",
          countrySlug: "united-kingdom",
          regionCode: "ENG",
          regionName: "England",
          regionSlug: "eng",
          localityName: "Greenwich Peninsula",
          localitySlug: "greenwich-peninsula",
          isDry: false,
          organizationVerified: false,
        },
      })
    ).toContainEqual(
      expect.objectContaining({
        communityKey: "locality:gb:eng:london",
        scope: "locality",
        displayName: "London",
      })
    );
  });
});
