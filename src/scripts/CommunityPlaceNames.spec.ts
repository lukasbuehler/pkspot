import { describe, expect, it } from "vitest";
import { localizedCommunityRegion, communityPreviewNames, communityLocationPhrase, localizedCountryName, localizedPlaceName, communityPlaceFingerprint, currentPlaceLocalization } from "./CommunityPlaceNames";
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

describe("community preview names", () => {
  const prague = { displayName: "Prague", scope: "locality", geography: {countryCode: "CZ", countryName: "Czech Republic", regionName: "Prague"}, place_localization: {names: {de: "Prag", it: "Praga"}} };
  it("localizes stored town and country names without repeating the city", () => {
    expect(communityPreviewNames(prague, "de")).toEqual({displayName: "Prag", countryName: "Tschechien", localityName: "Prag", regionName: undefined});
  });
  it("handles flattened preview fields and locale fallback", () => {
    expect(communityPreviewNames({displayName: "Prague", scope: "locality", "geography.countryCode": "CZ", "place_localization.names.de": "Prag"}, "de-CH").displayName).toBe("Prag");
  });
  it("prefers curated overrides and keeps original names when translations are absent", () => {
    expect(communityPreviewNames({...prague,place_name_overrides:{de:"Prag (kuratiert)"}}, "de").displayName).toBe("Prag (kuratiert)");
    expect(communityPreviewNames(prague, "nl").displayName).toBe("Prague");
    expect(communityPreviewNames({...prague,place_localization:{names:{de:42}}}, "de").displayName).toBe("Prague");
  });
  it("localizes countries without requiring stored provider data", () => {
    expect(communityPreviewNames({displayName:"Austria",scope:"country",geography:{countryCode:"AT"}}, "de").displayName).toBe("Österreich");
  });
});


describe("regional display names", () => {
  const page = { ...munichPage, place_localization: {source: "geonames" as const, geonamesId: 1, names: {de:"München"}, region: {geonamesId: 2, countryCode: "DE", names:{de:"Bayern"}}, fingerprint:communityPlaceFingerprint(munichPage), updatedAtMs:1} };
  it("uses the base locale and preserves raw fallback without trusting stale geography", () => {
    expect(localizedCommunityRegion(page, "de-CH")).toBe("Bayern");
    expect(localizedCommunityRegion(page, "ko")).toBe("Bavaria");
    expect(localizedCommunityRegion({...page,geography:{...page.geography,regionName:"Hesse"}}, "de")).toBe("Hesse");
  });
  it("supports both nested and flattened Typesense region fields", () => {
    expect(communityPreviewNames(page, "de-CH").regionName).toBe("Bayern");
    expect(communityPreviewNames({displayName:"Catania",scope:"locality","geography.regionName":"Sicilia","place_localization.region.names.de":"Sizilien"}, "de").regionName).toBe("Sizilien");
  });
});
