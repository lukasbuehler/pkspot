import { describe, expect, it } from "vitest";
import { selectLocalizedContent, contentLanguageLabel } from "./LocalizedContent";
import { getBestLocale } from "./LanguageHelpers";
import { entityPlaceKey, entityPlaceSource, placeNamesMatch, publicPlaceNames } from "./EntityPlaceNames";

describe("localized contributor content", () => {
  it("prefers exact and base translations, skips empty values and preserves source language", () => {
    const values = { en: "English", de: "Deutsch", "de-CH": "Grüezi", fr: " " };
    expect(selectLocalizedContent(values, "de-CH")).toEqual({ text: "Grüezi", locale: "de-CH" });
    expect(selectLocalizedContent(values, "de-AT")).toEqual({ text: "Deutsch", locale: "de" });
    expect(selectLocalizedContent(values, "fr")).toEqual({ text: "English", locale: "en" });
    expect(selectLocalizedContent(undefined, "fr", "Original")).toEqual({ text: "Original", locale: undefined });
    expect(selectLocalizedContent(values, "it", "Original", "de")).toEqual({ text: "Deutsch", locale: "de" });
  });
  it("does not confuse different language codes or depend on insertion order", () => {
    expect(getBestLocale(["fil", "fi"], "fi-FI")).toBe("fi");
    expect(getBestLocale(["fr", "en"], "it")).toBe("en");
    expect(contentLanguageLabel("de", "de-CH")).toBe("");
    expect(contentLanguageLabel(undefined, "fr")).toBe("");
    expect(contentLanguageLabel("en", "fr")).toContain("anglais");
  });
});

describe("shared entity town keys", () => {
  const input = { countryCode: "DE", locality: "Munich", lat: 48.14, lng: 11.58 };
  it("shares nearby same-town lookups and rejects incomplete or multi-town input", () => {
    expect(entityPlaceKey(input)).toBe(entityPlaceKey({ ...input, lat: 48.15 }));
    expect(entityPlaceKey({ ...input, locality: "Munich, Germany" })).toBe(entityPlaceKey(input));
    expect(entityPlaceKey({ ...input, locality: "Munich, Berlin" })).toBeUndefined();
    expect(entityPlaceKey({ ...input, lat: NaN })).toBeUndefined();
    expect(entityPlaceKey({ ...input, countryCode: undefined })).toBeUndefined();
    expect(entityPlaceKey({ ...input, countryCode: undefined, locality: "Munich, Germany" })).toBe(entityPlaceKey(input));
  });
  it("exposes only provider town names and verifies the centroid against the entity", () => {
    const source = entityPlaceSource(input)!;
    const names = publicPlaceNames(source.communityKey, { source: "geonames", geonamesId: 2867714, names: { it: "Monaco di Baviera" }, fingerprint: "private source", updatedAtMs: 1, center: [48.13743, 11.57549] });
    expect(Object.keys(names).sort()).toEqual(["center", "geonamesId", "key", "names", "source"]);
    expect(placeNamesMatch(names, input)).toBe(true);
    expect(placeNamesMatch({ ...names, center: [50, 13] }, input)).toBe(false);
  });
});
