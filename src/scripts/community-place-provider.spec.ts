import { describe, expect, it, vi } from "vitest";
import { enrichPlaceNames, selectGeoNamesMatch, extractPlaceNames, GeoNamesError } from "../../functions/src/communityPlaceNames";
import type { CommunityPageSchema } from "../db/schemas/CommunityPageSchema";
const page = { communityKey: "locality:de:munich", scope: "locality", published: true, bounds_center: [48.14, 11.58], geography: { countryCode: "DE", regionName: "Bavaria", localityName: "Munich" } } as CommunityPageSchema;
const feature = { geonameId: 2867714, name: "Munich", toponymName: "München", countryCode: "DE", adminName1: "Bavaria", fcl: "P", lat: "48.13743", lng: "11.57549", alternateNames: [{ lang: "it", name: "Monaco di Baviera" }, { lang: "ko", name: "뮌헨" }, { lang: "zh", name: "慕尼黑" }] };
describe("GeoNames enrichment", () => {
  it("requires a unique nearby populated place in the right country", () => {
    expect(selectGeoNamesMatch({ geonames: [feature] }, page)).toBe(2867714);
    for (const change of [{ countryCode: "US" }, { fcl: "A" }, { lat: "51" }, { name: "Berlin", toponymName: "Berlin" }]) {
      expect(selectGeoNamesMatch({ geonames: [{ ...feature, ...change }] }, page)).toBeNull();
    }
    expect(selectGeoNamesMatch({ geonames: [feature, { ...feature, geonameId: 2 }] }, page)).toBeNull();
  });
  it("matches first-level region pages without applying the town centroid radius", () => {
    const regional = {...page,scope:"region" as const};
    const bavaria = {...feature,name:"Bavaria",toponymName:"Bayern",fcl:"A",fcode:"ADM1",lat:"49.5"};
    expect(selectGeoNamesMatch({geonames:[bavaria]}, regional)).toBe(feature.geonameId);
    expect(selectGeoNamesMatch({geonames:[{...bavaria,fcode:"ADM2"}]}, regional)).toBeNull();
  });
  it("selects preferred current names, preserving scripts without inventing translations", () => {
    expect(extractPlaceNames({ alternateNames: [
      { lang: "it", name: "Old", isHistoric: true }, { lang: "it", name: "Alternative" },
      { lang: "it", name: "Monaco di Baviera", isPreferredName: "true", isHistoric: "false" },
      { lang: "zh-Hant", name: "慕尼黑" }, { lang: "link", name: "https://example.com" },
    ] })).toEqual({ it: "Monaco di Baviera", "zh-Hant": "慕尼黑" });
  });
  it("fetches all names in two calls and rejects truncated results", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ totalResultsCount: 1, geonames: [feature] })).mockResolvedValueOnce(Response.json(feature));
    const result = await enrichPlaceNames(page, "fixture", request);
    expect(result?.names).toEqual({ it: "Monaco di Baviera", ko: "뮌헨", zh: "慕尼黑" });
    expect(request).toHaveBeenCalledTimes(2);
    expect(String(request.mock.calls[0][0])).toMatch(/^https:\/\/secure.geonames.org\/searchJSON/);
    request.mockReset().mockResolvedValue(Response.json({ totalResultsCount: 21, geonames: [feature] }));
    expect(await enrichPlaceNames(page, "fixture", request)).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("classifies account, quota and malformed responses without raw provider errors", async () => {
    for (const [response, kind] of [[Response.json({ status: { value: 10, message: "private text" } }), "account"], [new Response("", { status: 429 }), "quota"], [new Response("not json"), "invalid-response"]] as const) {
      const request = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(enrichPlaceNames(page, "fixture", request)).rejects.toEqual(new GeoNamesError(kind));
    }
  });
});
