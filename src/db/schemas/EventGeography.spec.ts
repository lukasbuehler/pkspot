import { describe, expect, it } from "vitest";
import {
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
});
