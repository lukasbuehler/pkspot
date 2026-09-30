import { describe, expect, it } from "vitest";
import { relevantMapCommunities } from "./visible-communities";
import type { CommunitySearchPreview } from "../../services/search.service";
const community = (code: string, scope: "country" | "locality", lat: number, lng: number): CommunitySearchPreview => ({
  id: code + scope, communityKey: code + scope, slug: code, displayName: code,
  scope, countryCode: code, boundsCenter: [lat, lng], totalSpots: 1,
});
const ch = community("CH", "country", 47.3, 8.5);
const fr = community("FR", "country", 47.5, 2.5);
const ru = community("RU", "country", 59, 73);
const zurich = community("CH", "locality", 47.3, 8.5);
const viewport = { zoom: 14, bbox: { north: 48, south: 47, east: 9, west: 8 } };
describe("relevantMapCommunities", () => {
  it("uses local country evidence instead of oversized country bounds", () => {
    expect(relevantMapCommunities([fr, ch, ru, zurich], viewport)).toEqual([zurich, ch]);
  });
  it("retains both countries when visible Spots straddle a border", () => {
    expect(relevantMapCommunities([ch, fr, ru], viewport, ["CH", "fr"])).toEqual([ch, fr]);
  });
  it("falls back to the nearest country without local evidence", () => {
    expect(relevantMapCommunities([fr, ru, ch], viewport)).toEqual([ch]);
  });
  it("keeps all overlapping countries at continental zoom", () => {
    expect(relevantMapCommunities([fr, ru, ch], { ...viewport, zoom: 4 })).toEqual([fr, ru, ch]);
  });
});
