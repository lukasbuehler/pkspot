import type { CommunityPageSchema } from "../db/schemas/CommunityPageSchema";
import type { EntityPlaceNames } from "./EntityPlaceNames";
import { currentPlaceLocalization, localizedCountryName } from "./CommunityPlaceNames";

/**
 * Localized town and region names copied onto a Spot or Event (`place_names`)
 * and into its previews, so cards and search results can show "Lüttich" in
 * German and "Liège" in French without a lookup per card. Server-owned: the
 * original address fields stay unchanged for older clients.
 */
export interface PlaceLabelNames {
  /** The `place_names/{key}` record these names were copied from. */
  key: string;
  locality: Record<string, string>;
  region?: Record<string, string>;
}

/** Locales whose country names are added as search aliases. */
const COUNTRY_SEARCH_LOCALES = ["en", "de", "fr", "it", "es", "nl"] as const;
const MAX_SEARCH_NAMES = 48;
const MAX_SEARCH_NAME_LENGTH = 120;

export function placeLabelNames(place: EntityPlaceNames): PlaceLabelNames | undefined {
  const locality = cleanNames(place.names);
  if (!Object.keys(locality).length) return undefined;
  const region = cleanNames(place.region?.names ?? {});
  return { key: place.key, locality, ...(Object.keys(region).length ? { region } : {}) };
}

/** The name for a locale, then its language, then the original text. */
export function localizedPlaceLabel(
  original: string | undefined,
  names: Record<string, string> | undefined,
  locale: string,
): string {
  const language = locale.split("-")[0];
  return names?.[locale] || names?.[language] || original || "";
}

/**
 * A display label for an entity's town: the localized name when one is known,
 * otherwise the original text. Never use it for editing; forms keep the original.
 */
export function localizedLocalityLabel(
  original: string | undefined,
  names: PlaceLabelNames | undefined,
  locale: string,
): string {
  const localized = names ? localizedPlaceLabel(undefined, names.locality, locale) : "";
  return localized || original || "";
}

/**
 * Every spelling a search should match for a place: original and localized
 * locality and region names, plus the country in the app languages. Matching
 * is case-insensitive, so duplicates differing only in case are dropped.
 */
export function localizedSearchNames(input: {
  locality?: string;
  region?: string;
  countryCode?: string;
  names?: PlaceLabelNames;
  /** Reviewed community overrides, which take precedence in display. */
  overrides?: Record<string, string>;
}): string[] {
  const country = input.countryCode?.trim().toUpperCase();
  const candidates = [
    input.locality,
    ...Object.values(input.overrides ?? {}),
    ...Object.values(input.names?.locality ?? {}),
    input.region,
    ...Object.values(input.names?.region ?? {}),
    ...(country && /^[A-Z]{2}$/.test(country)
      ? COUNTRY_SEARCH_LOCALES.map((locale) => localizedCountryName(country, locale, ""))
      : []),
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value || value.length > MAX_SEARCH_NAME_LENGTH) continue;
    const folded = value.toLocaleLowerCase("en");
    if (seen.has(folded)) continue;
    seen.add(folded);
    result.push(value);
    if (result.length === MAX_SEARCH_NAMES) break;
  }
  return result;
}

/**
 * Search aliases for a community page. Towns match their localized names and
 * region; countries match their name in every app language. A town does not
 * match its country, so "Schweiz" finds Switzerland rather than every town.
 */
export function communitySearchNames(page: CommunityPageSchema): string[] {
  const localization = currentPlaceLocalization(page);
  const names = localization
    ? { key: page.communityKey, locality: localization.names, ...(localization.region ? { region: localization.region.names } : {}) }
    : undefined;
  return localizedSearchNames({
    locality: page.displayName,
    region: page.scope === "locality" ? page.geography?.regionName : undefined,
    countryCode: page.scope === "country" ? page.geography?.countryCode : undefined,
    names,
    overrides: page.place_name_overrides,
  });
}

/** Order-independent equality, so unchanged names never cause a write. */
export function samePlaceFields(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function cleanNames(names: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(names)
    .filter(([locale, name]) => /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(locale) &&
      typeof name === "string" && name.trim() && name.length <= MAX_SEARCH_NAME_LENGTH)
    .map(([locale, name]) => [locale, name.trim()]));
}
