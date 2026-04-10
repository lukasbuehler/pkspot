import { describe, expect, it } from "vitest";
import {
  getDisplayCountryName,
  getDisplayFormattedAddress,
  getDisplayLocalityName,
  getDisplayLocalityString,
} from "./AddressHelpers";

describe("AddressHelpers", () => {
  const address = {
    sublocality: "Shibuya City",
    sublocalityLocal: "渋谷区",
    locality: "Tokyo",
    localityLocal: "東京",
    country: {
      code: "JP",
      name: "Japan",
      localName: "日本",
    },
    formatted: "Shibuya City, Tokyo, Japan",
    formattedLocal: "日本、〒150-0002 東京都渋谷区",
  };

  it("should prefer local display names when available", () => {
    expect(getDisplayLocalityName(address as any)).toBe("東京");
    expect(getDisplayCountryName(address as any)).toBe("日本");
  });

  it("should build locality strings from local names and country code", () => {
    expect(getDisplayLocalityString(address as any)).toBe("渋谷区, 東京, JP");
  });

  it("should prefer local formatted addresses", () => {
    expect(getDisplayFormattedAddress(address as any)).toBe(
      "日本、〒150-0002 東京都渋谷区"
    );
  });
});
