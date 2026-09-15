import type { CommunityRegionLocalization } from "../../src/db/schemas/CommunityPageSchema";
import { extractPlaceNames, geoNamesClient, GeoNamesError } from "./communityPlaceNames";

export interface RegionNameCache {
  get(id: number): Promise<CommunityRegionLocalization | undefined>;
  set(region: CommunityRegionLocalization): Promise<void>;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;

/** Use provider identities, never assume our Google region codes match GeoNames. */
export async function enrichRegionNames(
  townId: number, countryCode: string, username: string,
  cache: RegionNameCache, request: typeof fetch = fetch,
): Promise<CommunityRegionLocalization | undefined> {
  const get = geoNamesClient(username, request);
  const hierarchy = record(await get("hierarchyJSON", { geonameId: String(townId) }))?.["geonames"];
  if (!Array.isArray(hierarchy)) throw new GeoNamesError("invalid-response");
  const entries = hierarchy.map(record);
  // Validate the hierarchy belongs to the requested town before trusting parents.
  if (!entries.some((entry) => entry?.["geonameId"] === townId && entry["countryCode"] === countryCode)) {
    throw new GeoNamesError("invalid-response");
  }
  const regions = entries.filter((entry) => entry?.["fcode"] === "ADM1");
  if (!regions.length) return undefined; // Some territories have no ADM1.
  const region = regions[0], id = Number(region?.["geonameId"]);
  if (regions.length !== 1 || region?.["countryCode"] !== countryCode || !Number.isSafeInteger(id) || id <= 0) {
    throw new GeoNamesError("invalid-response");
  }
  const cached = await cache.get(id);
  if (cached?.geonamesId === id && cached.countryCode === countryCode) return cached;
  const feature = record(await get("getJSON", { geonameId: String(id) }));
  if (feature?.["geonameId"] !== id || feature["countryCode"] !== countryCode || feature["fcode"] !== "ADM1") {
    throw new GeoNamesError("invalid-response");
  }
  const result = { geonamesId: id, countryCode, names: extractPlaceNames(feature) };
  await cache.set(result);
  return result;
}
