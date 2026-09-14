import { describe, expect, it } from "vitest";
import { communityLocationPhrase, localizedCountryName, localizedPlaceName, communityPlaceFingerprint, currentPlaceLocalization } from "./CommunityPlaceNames";
import type { CommunityPageSchema } from "../db/schemas/CommunityPageSchema";

const munichPage = {
  communityKey: "locality:de:munich", scope: "locality", published: true,
  displayName: "Munich", bounds_center: [48.14, 11.58],
  geography: { countryCode: "DE", countryName: "Germany", regionName: "Bavaria", localityName: "Munich", localityLocalName: "München" },
} as CommunityPageSchema;

describe("community place presentation", () => {
  it.each([
    ["fr", "DK", "au Danemark"], ["fr", "DE", "en Allemagne"], ["fr", "US", "aux États-Unis"],
    ["it", "CH", "in Svizzera"], ["it", "NL", "nei Paesi Bassi"], ["it", "US", "negli Stati Uniti"],
    ["de", "CH", "in der Schweiz"], ["de-CH", "NL", "in den Niederlanden"],
    ["de", "US", "in den Vereinigten Staaten"], ["de", "GB", "im Vereinigten Königreich"],
    ["nl", "GB", "in het Verenigd Koninkrijk"], ["en", "GB", "in the United Kingdom"], ["es", "DE", "en Alemania"],
  ])("inflects %s / %s", (locale, code, expected) => {
    expect(communityLocationPhrase(localizedCountryName(code, locale, code), "country", code, locale)).toBe(expected);
  });
  it("handles city articles and reviewed phrase overrides", () => {
    expect(communityLocationPhrase("Le Havre", "locality", "FR", "fr")).toBe("au Havre");
    expect(communityLocationPhrase("Monaco di Baviera", "locality", "DE", "it")).toBe("a Monaco di Baviera");
    expect(communityLocationPhrase("X", "country", "CH", "de-CH", { de: "in der Schweiz" })).toBe("in der Schweiz");
  });
  it("prefers reviewed names and ignores enrichment for an old identity", () => {
    const localization = { source: "geonames" as const, geonamesId: 2867714, names: { it: "Monaco di Baviera", de: "München" }, fingerprint: communityPlaceFingerprint(munichPage), updatedAtMs: 1 };
    expect(localizedPlaceName(localization, { de: "München (Bayern)" }, "de-CH", "Munich")).toBe("München (Bayern)");
    expect(localizedPlaceName(localization, undefined, "ko", "München")).toBe("München");
    expect(currentPlaceLocalization({ ...munichPage, place_localization: localization })).toBe(localization);
    expect(currentPlaceLocalization({ ...munichPage, geography: { ...munichPage.geography, localityName: "Berlin" }, place_localization: localization })).toBeUndefined();
    expect(communityPlaceFingerprint({ ...munichPage, counts: { totalSpots: 99, topRated: 1, dry: 0 } })).toBe(localization.fingerprint);
  });
});
