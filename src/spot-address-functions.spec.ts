import { describe, expect, it } from "vitest";
import {
  extractAddressFromGeocodeResponse,
  hasAbbreviatedAddressName,
  shouldRefreshAddress,
} from "../functions/src/spotAddressFunctions";

const component = (long_name: string, short_name: string, types: string[]) => ({ long_name, short_name, types });

describe("reverse-geocoded Spot addresses", () => {
  it("names towns and regions with Google's long name and keeps short names as codes", () => {
    const address = extractAddressFromGeocodeResponse({
      results: [{
        formatted_address: "Stadtgarten 1, 44135 Dortmund, Germany",
        geometry: {},
        place_id: "dortmund",
        address_components: [
          component("Dortmund", "DO", ["locality", "political"]),
          component("North Rhine-Westphalia", "NRW", ["administrative_area_level_1", "political"]),
          component("Germany", "DE", ["country", "political"]),
        ],
      }],
    });

    expect(address.locality).toBe("Dortmund");
    expect(address.region).toEqual({ code: "NRW", name: "North Rhine-Westphalia" });
    expect(address.country).toEqual({ code: "DE", name: "Germany" });
  });

  it("refreshes stored abbreviations but leaves short real town names alone", () => {
    const base = { formatted: "x", country: { code: "DE", name: "Germany" }, localityLocal: "x" };
    expect(hasAbbreviatedAddressName({ ...base, locality: "DO" })).toBe(true);
    expect(hasAbbreviatedAddressName({ ...base, locality: "СПБ" })).toBe(true);
    expect(hasAbbreviatedAddressName({ ...base, locality: "Zug" })).toBe(false);
    // Region codes as names are left for the next address change (thousands of Spots).
    expect(hasAbbreviatedAddressName({ ...base, locality: "Wil", region: { code: "SG", name: "SG" } })).toBe(false);
    expect(shouldRefreshAddress({ ...base, locality: "DO" })).toBe(true);
    expect(shouldRefreshAddress({ ...base, locality: "Dortmund" })).toBe(false);
    // A normal Spot without local-language fields is no longer refreshed.
    expect(shouldRefreshAddress({ formatted: "x", country: { code: "FR", name: "France" }, locality: "Vagney" })).toBe(false);
    expect(shouldRefreshAddress(undefined)).toBe(true);
  });
});
