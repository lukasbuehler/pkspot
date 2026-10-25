import { describe, expect, it } from "vitest";
import {
  localizedSpotAddress,
  getDisplayCountryName,
  getDisplayFormattedAddress,
  getDisplayLocationName,
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

  it("falls back to the country name when no locality is available", () => {
    expect(
      getDisplayLocationName({
        country: { code: "NO", name: "Norway", localName: "Norge" },
      }),
    ).toBe("Norge");
  });
});


it("renders cached town and region names in the viewer locale without changing geocoded data", () => {
  const address = {locality:"Prague",localityLocal:"Praha",region:{name:"Prague",localName:"Hlavní město Praha"},country:{code:"CZ",name:"Czech Republic"},formatted:"Original street address"};
  const place = {key:"CZ:prague:50:14",source:"geonames" as const,geonamesId:1,names:{de:"Prag"},region:{geonamesId:2,countryCode:"CZ",names:{de:"Hauptstadt Prag"}}};
  const translated = localizedSpotAddress(address, place, "de-CH");
  expect(getDisplayLocalityString(translated)).toBe("Prag, CZ");
  expect(translated?.region?.localName).toBe("Hauptstadt Prag");
  expect(translated?.country?.localName).toBe("Tschechien");
  expect(translated?.formatted).toBe(address.formatted);
  expect(address.localityLocal).toBe("Praha");
  expect(getDisplayLocalityString(localizedSpotAddress(address, undefined, "de"))).toBe("Praha, CZ");
});
