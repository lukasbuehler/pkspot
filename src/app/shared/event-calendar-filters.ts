import type {
  EventCategory,
  EventListingTier,
  EventRegionKey,
} from "../../db/schemas/EventSchema";
import { EVENT_REGION_KEYS } from "../../db/schemas/EventSchema";
import { normalizeEventCountryCode } from "../../db/schemas/EventGeography";

/**
 * Public event-calendar filters shared by the Events page, the calendar embed
 * and the iCal subscription feed. All three read the same URL parameters, so a
 * filtered Events page URL, its embed and its feed always list the same events.
 *
 * This module stays free of Angular and Firebase imports because the
 * Cloudflare Worker uses it outside the Angular application.
 */
export interface EventCalendarFilters {
  /** Uppercase ISO 3166-1 alpha-2 codes. */
  countries: string[];
  regions: EventRegionKey[];
  categories: EventCategory[];
  listingTiers: EventListingTier[];
  seriesIds: string[];
}

export const EVENT_CALENDAR_CATEGORIES = [
  "jam",
  "competition",
  "workshop",
  "camp",
  "show",
  "awards",
  "social",
  "travel",
  "other",
] as const satisfies readonly EventCategory[];

const CATEGORY_SET: ReadonlySet<string> = new Set(EVENT_CALENDAR_CATEGORIES);
const REGION_SET: ReadonlySet<string> = new Set(EVENT_REGION_KEYS);
const TIER_SET: ReadonlySet<string> = new Set(["formal", "community"]);
const SERIES_ID_PATTERN = /^[\w-]{1,80}$/u;
/** Keeps feed and Typesense filter strings bounded for hand-edited URLs. */
const MAX_VALUES_PER_FILTER = 20;

export const EMPTY_EVENT_CALENDAR_FILTERS: EventCalendarFilters = {
  countries: [],
  regions: [],
  categories: [],
  listingTiers: [],
  seriesIds: [],
};

/** Reads comma-separated or repeated parameters such as `country=ch,de`. */
export function readEventCalendarList(
  getAll: (key: string) => readonly string[],
  key: string,
): string[] {
  return [
    ...new Set(
      getAll(key)
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

export function readEventCalendarFilters(
  getAll: (key: string) => readonly string[],
): EventCalendarFilters {
  const list = (key: string) =>
    readEventCalendarList(getAll, key).slice(0, MAX_VALUES_PER_FILTER);
  return {
    countries: parseEventCountryCodes(list("country")),
    regions: list("region").filter((value): value is EventRegionKey =>
      REGION_SET.has(value),
    ),
    categories: list("category").filter((value): value is EventCategory =>
      CATEGORY_SET.has(value),
    ),
    listingTiers: list("tier").filter((value): value is EventListingTier =>
      TIER_SET.has(value),
    ),
    seriesIds: list("series").filter((value) => SERIES_ID_PATTERN.test(value)),
  };
}

/** Normalizes, validates and de-duplicates country codes. */
export function parseEventCountryCodes(values: readonly string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => normalizeEventCountryCode(value))
        .filter((value): value is string => !!value),
    ),
  ];
}

/**
 * Canonical query parameters for a filter set. Country codes are lowercase in
 * URLs to match community keys and look natural in a shared link.
 */
export function eventCalendarFilterParams(
  filters: EventCalendarFilters,
): Record<string, string> {
  const params: Record<string, string> = {};
  const set = (key: string, values: readonly string[]) => {
    if (values.length > 0) params[key] = values.join(",");
  };
  set("country", filters.countries.map((code) => code.toLowerCase()));
  set("region", filters.regions);
  set("category", filters.categories);
  set("tier", filters.listingTiers);
  set("series", filters.seriesIds);
  return params;
}

export function hasEventCalendarFilters(filters: EventCalendarFilters): boolean {
  return Object.values(filters).some((values) => values.length > 0);
}

/** Community key that the server assigns to every event in a country. */
export function eventCountryCommunityKey(countryCode: string): string {
  return `country:${countryCode.toLowerCase()}`;
}

function quoteTypesenseValue(value: string): string {
  return `\`${value.replace(/[`\\]/gu, "\\$&")}\``;
}

export function typesenseArrayFilter(
  field: string,
  values: readonly string[],
): string | undefined {
  return values.length === 0
    ? undefined
    : `${field}:=[${values.map(quoteTypesenseValue).join(",")}]`;
}

/**
 * Typesense filter for a country selection.
 *
 * Older events only carry the server-derived `country:xx` community key, while
 * newer ones also store an explicit `country_code`. Matching either keeps every
 * event in the country visible without a data backfill.
 */
export function eventCountryTypesenseFilter(
  countries: readonly string[],
): string | undefined {
  const codes = parseEventCountryCodes(countries);
  if (codes.length === 0) return undefined;
  return `(${typesenseArrayFilter(
    "community_keys",
    codes.map(eventCountryCommunityKey),
  )} || ${typesenseArrayFilter("country_code", codes)})`;
}

/** Typesense filter clauses for the calendar filters, excluding time ranges. */
export function eventCalendarTypesenseFilters(
  filters: EventCalendarFilters,
): (string | undefined)[] {
  return [
    eventCountryTypesenseFilter(filters.countries),
    typesenseArrayFilter("region_keys", filters.regions),
    typesenseArrayFilter("event_categories", filters.categories),
    typesenseArrayFilter("listing_tier", filters.listingTiers),
    typesenseArrayFilter("series_ids", filters.seriesIds),
  ];
}

export interface EventCountryFacet {
  /** Uppercase ISO code. */
  value: string;
  count: number;
}

/**
 * Combines the `country:xx` community-key facet with the `country_code` facet.
 *
 * An event can carry both, so the counts cannot be added. The larger count per
 * country is exact whenever one field covers all of that country's events,
 * which holds for current data, and never overcounts.
 */
export function mergeEventCountryFacets(
  communityFacets: readonly { value: string; count: number }[],
  countryCodeFacets: readonly { value: string; count: number }[],
): EventCountryFacet[] {
  const counts = new Map<string, number>();
  const add = (rawCode: string | undefined, count: number) => {
    const code = normalizeEventCountryCode(rawCode);
    if (!code || count <= 0) return;
    counts.set(code, Math.max(counts.get(code) ?? 0, count));
  };
  for (const facet of communityFacets) {
    add(/^country:([a-z]{2})$/iu.exec(facet.value)?.[1], facet.count);
  }
  for (const facet of countryCodeFacets) add(facet.value, facet.count);
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

/** Regional-indicator flag emoji for an ISO country code. */
export function eventCountryFlag(countryCode: string): string {
  const code = normalizeEventCountryCode(countryCode);
  if (!code) return "";
  return String.fromCodePoint(
    ...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  );
}

/** Localized country name, falling back to the ISO code. */
export function eventCountryName(countryCode: string, locale: string): string {
  const code = normalizeEventCountryCode(countryCode) ?? countryCode.toUpperCase();
  try {
    return new Intl.DisplayNames([locale, "en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
