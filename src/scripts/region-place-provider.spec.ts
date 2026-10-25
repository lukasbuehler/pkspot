import { describe, expect, it, vi } from "vitest";
import { enrichRegionNames, type RegionNameCache } from "../../functions/src/regionPlaceNames";
import { GeoNamesError } from "../../functions/src/communityPlaceNames";

const town = { geonameId: 1, countryCode: "IT", fcode: "PPL" };
const region = { geonameId: 2, countryCode: "IT", fcode: "ADM1" };
const names = { geonamesId: 2, countryCode: "IT", names: { de: "Sizilien" } };
const cache = (): RegionNameCache => ({ get: vi.fn().mockResolvedValue(undefined), set: vi.fn() });

describe("administrative region enrichment", () => {
  it("fetches multilingual region names once and reuses the region across towns", async () => {
    const store = cache();
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ geonames: [region, town] }))
      .mockResolvedValueOnce(Response.json({ ...region, alternateNames: [{ lang: "de", name: "Sizilien" }] }));
    expect(await enrichRegionNames(1, "IT", "fixture", store, request)).toEqual(names);
    expect(store.set).toHaveBeenCalledWith(names);
    vi.mocked(store.get).mockResolvedValue(names);
    request.mockReset().mockResolvedValue(Response.json({ geonames: [region, { ...town, geonameId: 3 }] }));
    expect(await enrichRegionNames(3, "IT", "fixture", store, request)).toEqual(names);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("rejects mismatched, ambiguous and unrelated hierarchies", async () => {
    for (const entries of [[region], [town, { ...region, countryCode: "ES" }], [town, region, { ...region, geonameId: 4 }]]) {
      const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ geonames: entries }));
      await expect(enrichRegionNames(1, "IT", "fixture", cache(), request)).rejects.toEqual(new GeoNamesError("invalid-response"));
    }
  });
  it("allows territories without a first-level region and preserves quota failures for retry", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ geonames: [town] }));
    expect(await enrichRegionNames(1, "IT", "fixture", cache(), request)).toBeUndefined();
    request.mockResolvedValue(new Response("", { status: 429 }));
    await expect(enrichRegionNames(1, "IT", "fixture", cache(), request)).rejects.toEqual(new GeoNamesError("quota"));
  });
});
