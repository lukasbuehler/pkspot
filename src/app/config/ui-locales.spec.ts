import { describe, expect, it } from "vitest";
import {
  isKnownUiLocalePrefix,
  normalizeUiLocale,
  SUPPORTED_UI_LOCALES,
} from "./ui-locales";

describe("UI locales", () => {
  it("exposes only locales with application bundles", () => {
    expect(SUPPORTED_UI_LOCALES).toEqual([
      "en",
      "de",
      "fr",
      "it",
      "es",
      "nl",
    ]);
    expect(SUPPORTED_UI_LOCALES).not.toContain("de-CH");
  });

  it("normalizes retired and regional German locales to German", () => {
    expect(normalizeUiLocale("de-CH")).toBe("de");
    expect(normalizeUiLocale("de_CH")).toBe("de");
    expect(normalizeUiLocale("DE-ch")).toBe("de");
    expect(normalizeUiLocale("de-AT")).toBe("de");
  });

  it("recognizes retired URL prefixes without making them active locales", () => {
    expect(isKnownUiLocalePrefix("de-CH")).toBe(true);
    expect(isKnownUiLocalePrefix("de")).toBe(true);
    expect(isKnownUiLocalePrefix("de-CH-community")).toBe(false);
  });
});
