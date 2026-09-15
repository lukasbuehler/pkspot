import { countries } from "./Countries";
import type { CommunityPageSchema, CommunityPlaceLocalization } from "../db/schemas/CommunityPageSchema";
import { localizedCountryName } from "./CommunityPlaceNames";

export type PlaceNameSource = Pick<CommunityPageSchema, "communityKey" | "scope" | "published" | "displayName" | "geography" | "bounds_center" | "place_localization" | "redirect_to_community_key"> & Partial<Pick<CommunityPageSchema, "relationships" | "childCommunities">>;

export interface EntityPlaceInput {
  countryCode?: string;
  locality?: string;
  lat?: number;
  lng?: number;
}
export interface EntityPlaceNames {
  key: string;
  source: "geonames";
  geonamesId: number;
  center?: [number, number];
  names: Record<string, string>;
  version?: 2;
  region?: CommunityPlaceLocalization["region"];
}

/** A coarse geographic key separates namesakes without publishing source coordinates. */
export function entityPlaceKey(input: EntityPlaceInput): string | undefined {
  const country = countryForLocality(input.countryCode, input.locality);
  const locality = singleLocality(input.locality, country);
  if (!country || !/^[A-Z]{2}$/.test(country) || !locality ||
    !Number.isFinite(input.lat) || !Number.isFinite(input.lng) ||
    Math.abs(input.lat!) > 90 || Math.abs(input.lng!) > 180) return undefined;
  const name = locality.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  return `${country}:${encodeURIComponent(name)}:${Math.round(input.lat!)}:${Math.round(input.lng!)}`;
}

/** Recognize only an explicit known country suffix in legacy "Town, Country" text. */
export function countryForLocality(code: string | undefined, locality?: string): string | undefined {
  if (code?.trim()) return code.trim().toUpperCase();
  const parts = locality?.trim().split(/,\s*/) ?? [];
  if (parts.length !== 2) return undefined;
  const suffix = parts[1].toLowerCase();
  return Object.entries(countries).find(([key, country]) => key.toLowerCase() === suffix || country.name.toLowerCase() === suffix)?.[0];
}

// Older Event locality strings may include a country suffix. Do not interpret
// a multi-city itinerary as a single town, or translate a street/venue name.
export function singleLocality(value: string | undefined, countryCode?: string): string | undefined {
  countryCode = countryForLocality(countryCode, value);
  const parts = value?.trim().split(/,\s*/).filter(Boolean) ?? [];
  if (parts.length === 2 && countryCode) {
    const countryNames = [countryCode, ...["en", "de", "fr", "it", "es", "nl"].map((locale) => localizedCountryName(countryCode, locale, countryCode))];
    if (countryNames.some((name) => name.toLowerCase() === parts[1].toLowerCase())) parts.pop();
  }
  return parts.length === 1 && parts[0].length <= 120 && !/[;/\n]/.test(parts[0]) ? parts[0] : undefined;
}

export function entityPlaceSource(input: EntityPlaceInput): PlaceNameSource | undefined {
  const key = entityPlaceKey(input);
  if (!key) return undefined;
  return {
    communityKey: key, scope: "locality", published: true,
    displayName: singleLocality(input.locality, input.countryCode)!,
    geography: { countryCode: countryForLocality(input.countryCode, input.locality), localityName: singleLocality(input.locality, input.countryCode) },
    bounds_center: [input.lat!, input.lng!],
    relationships: { parentKeys: [], childKeys: [], relatedKeys: [] },
  };
}

export function publicPlaceNames(key: string, localization: CommunityPlaceLocalization): EntityPlaceNames {
  return { key, source: "geonames", geonamesId: localization.geonamesId, names: localization.names, ...(localization.version ? { version: localization.version } : {}), ...(localization.region ? { region: localization.region } : {}), ...(localization.center ? { center: localization.center } : {}) };
}

export function placeNamesMatch(names: EntityPlaceNames, input: EntityPlaceInput): boolean {
  if (names.key !== entityPlaceKey(input) || !names.center) return false;
  const rad = Math.PI / 180;
  const [lat, lng] = names.center;
  const h = Math.sin((lat - input.lat!) * rad / 2) ** 2 +
    Math.cos(lat * rad) * Math.cos(input.lat! * rad) * Math.sin((lng - input.lng!) * rad / 2) ** 2;
  return Number.isFinite(h) && 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h))) <= 40;
}
