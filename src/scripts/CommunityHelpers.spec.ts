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
});
