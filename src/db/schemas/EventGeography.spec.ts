// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  deriveEventCountryCode,
  eventRegionsForCountry,
  normalizeEventCountryCode,
} from "./EventGeography";

describe("event geography", () => {
  it("normalizes ISO country selection before deriving a fixed region", () => {
    expect(normalizeEventCountryCode(" ch ")).toBe("CH");
    expect(eventRegionsForCountry("CH")).toEqual(["europe"]);
    expect(eventRegionsForCountry("US")).toEqual(["north-america"]);
    expect(eventRegionsForCountry("BR")).toEqual(["south-america"]);
  });

  it("does not infer a region from free-form locality text or invalid codes", () => {
    expect(normalizeEventCountryCode("Zurich")).toBeUndefined();
    expect(eventRegionsForCountry("Zurich, Switzerland")).toEqual([]);
    expect(eventRegionsForCountry("XX")).toEqual([]);
  });

  it("derives the discovery country from the explicit code or the country key", () => {
    expect(deriveEventCountryCode("es", ["country:ch"])).toBe("ES");
    expect(deriveEventCountryCode(undefined, ["locality:ch:lu:luzern", "country:ch"])).toBe("CH");
    expect(deriveEventCountryCode(undefined, ["locality:ch:lu:luzern"])).toBeUndefined();
    expect(deriveEventCountryCode(undefined, undefined)).toBeUndefined();
  });
});
