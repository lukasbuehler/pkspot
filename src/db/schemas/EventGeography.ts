import type { EventRegionKey } from "./EventSchema";

/**
 * ISO 3166-1 alpha-2 country groups used by Event discovery. This deliberately
 * lives next to the schema so browser filters and server-side authoring share
 * one stable vocabulary without trusting a client-supplied continent.
 */
const REGION_COUNTRIES: Readonly<Record<EventRegionKey, readonly string[]>> = {
  africa: [
    "AO", "BF", "BI", "BJ", "BW", "CD", "CF", "CG", "CI", "CM", "CV", "DJ",
    "DZ", "EG", "EH", "ER", "ET", "GA", "GH", "GM", "GN", "GQ", "GW", "KE",
    "KM", "LR", "LS", "LY", "MA", "MG", "ML", "MR", "MU", "MW", "MZ", "NA",
    "NE", "NG", "RE", "RW", "SC", "SD", "SH", "SL", "SN", "SO", "SS", "ST",
    "SZ", "TD", "TG", "TN", "TZ", "UG", "YT", "ZA", "ZM", "ZW",
  ],
  asia: [
    "AE", "AF", "AM", "AZ", "BD", "BH", "BN", "BT", "CC", "CN", "CX", "CY",
    "GE", "HK", "ID", "IL", "IN", "IO", "IQ", "IR", "JO", "JP", "KG", "KH",
    "KP", "KR", "KW", "KZ", "LA", "LB", "LK", "MM", "MN", "MO", "MV", "MY",
    "NP", "OM", "PH", "PK", "PS", "QA", "SA", "SG", "SY", "TH", "TJ", "TL",
    "TM", "TR", "TW", "UZ", "VN", "YE",
  ],
  europe: [
    "AD", "AL", "AT", "AX", "BA", "BE", "BG", "BY", "CH", "CZ", "DE", "DK",
    "EE", "ES", "FI", "FO", "FR", "GB", "GG", "GI", "GR", "HR", "HU", "IE",
    "IM", "IS", "IT", "JE", "LI", "LT", "LU", "LV", "MC", "MD", "ME", "MK",
    "MT", "NL", "NO", "PL", "PT", "RO", "RS", "RU", "SE", "SI", "SJ", "SK",
    "SM", "UA", "VA",
  ],
  "north-america": [
    "AG", "AI", "AW", "BB", "BL", "BM", "BQ", "BS", "BZ", "CA", "CR", "CU",
    "CW", "DM", "DO", "GD", "GL", "GP", "GT", "HN", "HT", "JM", "KN", "KY",
    "LC", "MF", "MQ", "MS", "MX", "NI", "PA", "PM", "PR", "SV", "SX", "TC",
    "TT", "US", "VC", "VG", "VI",
  ],
  "south-america": [
    "AR", "BO", "BR", "CL", "CO", "EC", "FK", "GF", "GY", "PE", "PY", "SR",
    "UY", "VE",
  ],
  oceania: [
    "AS", "AU", "CK", "FJ", "FM", "GU", "KI", "MH", "MP", "NC", "NF", "NR",
    "NU", "NZ", "PF", "PG", "PN", "PW", "SB", "TK", "TO", "TV", "UM", "VU",
    "WF", "WS",
  ],
};

const REGION_BY_COUNTRY = new Map<string, EventRegionKey>(
  Object.entries(REGION_COUNTRIES).flatMap(([region, countries]) =>
    countries.map((country) => [country, region as EventRegionKey] as const),
  ),
);

/** Supported ISO choices for authoring country pickers. */
export const EVENT_COUNTRY_CODES = [...REGION_BY_COUNTRY.keys()].sort();

/** Returns an uppercase ISO country code or undefined for unsupported input. */
export function normalizeEventCountryCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const country = value.trim().toUpperCase();
  return /^[A-Z]{2}$/u.test(country) && REGION_BY_COUNTRY.has(country)
    ? country
    : undefined;
}

/** A country belongs to one initial discovery region. */
export function eventRegionsForCountry(value: unknown): EventRegionKey[] {
  const country = normalizeEventCountryCode(value);
  const region = country ? REGION_BY_COUNTRY.get(country) : undefined;
  return region ? [region] : [];
}

/** Human labels retained beside the stable URL and index keys. */
export const EVENT_REGION_LABELS: Readonly<Record<EventRegionKey, string>> = {
  africa: "Africa",
  asia: "Asia",
  europe: "Europe",
  "north-america": "North America",
  "south-america": "South America",
  oceania: "Oceania",
};
