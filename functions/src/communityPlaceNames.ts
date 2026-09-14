import type { CommunityPageSchema, CommunityPlaceLocalization } from "../../src/db/schemas/CommunityPageSchema";
import { COMMUNITY_NAME_LOCALES, communityPlaceFingerprint } from "../../src/scripts/CommunityPlaceNames";

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
const clean = (value: unknown): string => typeof value === "string" ? value.trim().slice(0, 160) : "";
const normalized = (value: unknown): string => clean(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

export const placeFingerprint = communityPlaceFingerprint;

export function canEnrichPlace(page: CommunityPageSchema | undefined): page is CommunityPageSchema {
  const center = page?.bounds_center;
  return !!page && page.published && !page.redirect_to_community_key && page.scope === "locality" &&
    !!page.geography.countryCode && !!page.geography.localityName && !!center &&
    Number.isFinite(center[0]) && Math.abs(center[0]) <= 90 &&
    Number.isFinite(center[1]) && Math.abs(center[1]) <= 180;
}

function distanceKm(a: readonly number[], b: readonly number[]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function selectGeoNamesMatch(payload: unknown, page: CommunityPageSchema): number | null {
  const results = record(payload)?.["geonames"];
  if (!Array.isArray(results) || !canEnrichPlace(page)) return null;
  const expectedNames = [page.geography.localityName, page.geography.localityLocalName].map(normalized).filter(Boolean);
  const candidates = results.map(record).filter((item) => {
    if (!item || item["countryCode"] !== page.geography.countryCode?.toUpperCase() || item["fcl"] !== "P") return false;
    const names = [item["name"], item["toponymName"], ...(Array.isArray(item["alternateNames"]) ? item["alternateNames"].map((v) => record(v)?.["name"]) : [])];
    const lat = Number(item["lat"]), lng = Number(item["lng"]);
    return names.some((name) => expectedNames.includes(normalized(name))) &&
      Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
      distanceKm(page.bounds_center!, [lat, lng]) <= 40 &&
      Number.isSafeInteger(item["geonameId"]) && Number(item["geonameId"]) > 0;
  });
  // Administrative names are corroboration, not codes: GeoNames and our source
  // do not necessarily use the same subdivision-code system.
  const regionMatches = candidates.filter((item) => page.geography.regionName &&
    normalized(item!["adminName1"]) === normalized(page.geography.regionName));
  const matches = regionMatches.length ? regionMatches : candidates;
  return matches.length === 1 ? Number(matches[0]!["geonameId"]) : null;
}

export function extractPlaceNames(payload: unknown): Record<string, string> {
  const entries = record(payload)?.["alternateNames"];
  if (!Array.isArray(entries)) return {};
  const names: Record<string, string> = {};
  const flag = (value: unknown) => value === true || value === "true";
  const ordered = entries.map(record).filter((v) => !!v && !flag(v["isHistoric"]) && !flag(v["isColloquial"]))
    .sort((a, b) => Number(flag(b!["isPreferredName"])) - Number(flag(a!["isPreferredName"])));
  for (const entry of ordered) {
    const raw = clean(entry!["lang"]).replace(/_/g, "-");
    const language = COMMUNITY_NAME_LOCALES.find((l) => l.toLowerCase() === raw.toLowerCase());
    const name = clean(entry!["name"]);
    if (language && name && !names[language]) names[language] = name;
  }
  return names;
}

export class GeoNamesError extends Error {
  constructor(readonly kind: "account" | "quota" | "unavailable" | "invalid-response") { super(kind); }
}

export async function enrichPlaceNames(
  page: CommunityPageSchema,
  username: string,
  request: typeof fetch = fetch,
): Promise<CommunityPlaceLocalization | null> {
  const get = async (path: string, params: Record<string, string>): Promise<unknown> => {
    const url = new URL(path, "https://secure.geonames.org/");
    url.search = new URLSearchParams({ ...params, username, style: "FULL" }).toString();
    let response: Response;
    try { response = await request(url, { signal: AbortSignal.timeout(15_000), redirect: "error" }); }
    catch { throw new GeoNamesError("unavailable"); }
    if (response.status === 401 || response.status === 403) throw new GeoNamesError("account");
    if (response.status === 429) throw new GeoNamesError("quota");
    if (!response.ok) throw new GeoNamesError("unavailable");
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new GeoNamesError("invalid-response"); }
    const status = record(record(payload)?.["status"]);
    if (status) throw new GeoNamesError(status["value"] === 10 ? "account" : [18, 19, 20].includes(Number(status["value"])) ? "quota" : "unavailable");
    return payload;
  };
  const results = await get("searchJSON", {
    name_equals: page.geography.localityName!, country: page.geography.countryCode!.toUpperCase(),
    featureClass: "P", maxRows: "20",
  });
  // A truncated result set cannot prove uniqueness.
  if (Number(record(results)?.["totalResultsCount"]) > 20) return null;
  const geonamesId = selectGeoNamesMatch(results, page);
  if (!geonamesId) return null;
  const feature = await get("getJSON", { geonameId: String(geonamesId) });
  if (record(feature)?.["geonameId"] !== geonamesId || record(feature)?.["countryCode"] !== page.geography.countryCode!.toUpperCase()) {
    throw new GeoNamesError("invalid-response");
  }
  const names = extractPlaceNames(feature);
  if (!Object.keys(names).length) return null;
  return { source: "geonames", geonamesId, names, fingerprint: placeFingerprint(page), updatedAtMs: Date.now() };
}
