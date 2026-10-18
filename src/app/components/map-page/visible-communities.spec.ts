import { describe, expect, it } from "vitest";
import { relevantMapCommunities } from "./visible-communities";
import type { CommunitySearchPreview } from "../../services/search.service";
const community = (code: string, scope: "country" | "locality", lat: number, lng: number): CommunitySearchPreview => ({
  id: code + scope, communityKey: code + scope, slug: code, displayName: code,
  scope, countryCode: code, boundsCenter: [lat, lng], totalSpots: 1,
});
const ch = community("CH", "country", 47.3, 8.5);
const fr = community("FR", "country", 47.5, 2.5);
const gb = community("GB", "country", 52.5, -1.5);
// Russia's discovery radius spans thousands of kilometres and covers the UK.
const ru = community("RU", "country", 59, 73);
const zurich = community("CH", "locality", 47.3, 8.5);
const viewport = { zoom: 14, bbox: { north: 48, south: 47, east: 9, west: 8 } };
const europe = { zoom: 5, bbox: { north: 58, south: 46, east: 12, west: -14 } }; // centred near London
describe("relevantMapCommunities", () => {
  it("uses local country evidence instead of oversized country bounds", () => {
    expect(relevantMapCommunities([fr, ch, ru, zurich], viewport)).toEqual([zurich, ch]);
  });
  it("retains both countries when visible Spots straddle a border up close", () => {
    const spots = [{ countryCode: "CH", lat: 47.5, lng: 8.5 }, { countryCode: "fr", lat: 47.4, lng: 8.1 }];
    expect(relevantMapCommunities([ch, fr, ru], viewport, spots)).toEqual([ch, fr]);
  });
  it("falls back to the nearest country without local evidence", () => {
    expect(relevantMapCommunities([fr, ru, ch], viewport)).toEqual([ch]);
  });
  it("shows only the country at the map centre when zoomed out", () => {
    const spots = [
      { countryCode: "GB", lat: 51.5, lng: -0.1 },
      { countryCode: "FR", lat: 48.9, lng: 2.3 },
      { countryCode: "CH", lat: 47.4, lng: 8.5 },
    ];
    expect(relevantMapCommunities([fr, ru, ch, gb, zurich], europe, spots)).toEqual([zurich, gb]);
  });
  it("never suggests Russia over the UK without any evidence", () => {
    expect(relevantMapCommunities([ru, fr, gb], europe)).toEqual([gb]);
  });
});
