import { Injectable, LOCALE_ID, PLATFORM_ID, TransferState, inject, makeStateKey } from "@angular/core";
import { isPlatformBrowser, isPlatformServer } from "@angular/common";
import { Request } from "express";
import { REQUEST } from "../../express.token";
import { ConsentService } from "./consent.service";

export type StartRegionBucket =
  | "north-america"
  | "europe"
  | "oceania"
  | "latin-america"
  | "asia"
  | "africa"
  | "middle-east";

export type StartRegionSource =
  | "server-country"
  | "locale-region"
  | "timezone-bucket"
  | "default";

export interface StartRegionResolution {
  countryCode?: string;
  regionBucket: StartRegionBucket;
  source: StartRegionSource;
}

export interface StartRegionPreset {
  center: google.maps.LatLngLiteral;
  zoom: number;
}

export const SERVER_COUNTRY_STATE_KEY = makeStateKey<string | null>(
  "pkspot-start-region-country"
);

const DEFAULT_CENTER: google.maps.LatLngLiteral = {
  lat: 48.6270939,
  lng: 2.4305363,
};

export const DEFAULT_START_REGION_PRESET: StartRegionPreset = {
  center: DEFAULT_CENTER,
  zoom: 4,
};

const REGION_BUCKET_PRESETS: Record<StartRegionBucket, StartRegionPreset> = {
  "north-america": {
    center: { lat: 39.8283, lng: -98.5795 },
    zoom: 4,
  },
  europe: {
    center: { lat: 50.1109, lng: 10.4515 },
    zoom: 4,
  },
  oceania: {
    center: { lat: -25.2744, lng: 134.7751 },
    zoom: 4,
  },
  "latin-america": {
    center: { lat: -14.235, lng: -51.9253 },
    zoom: 3,
  },
  asia: {
    center: { lat: 23.6978, lng: 104.1954 },
    zoom: 3,
  },
  africa: {
    center: { lat: 1.6508, lng: 17.6791 },
    zoom: 3,
  },
  "middle-east": {
    center: { lat: 29.2985, lng: 42.551 },
    zoom: 4,
  },
};

const COUNTRY_PRESETS: Record<string, StartRegionPreset> = {
  US: {
    center: { lat: 39.8283, lng: -98.5795 },
    zoom: 4,
  },
  CA: {
    center: { lat: 56.1304, lng: -106.3468 },
    zoom: 4,
  },
  AU: {
    center: { lat: -25.2744, lng: 133.7751 },
    zoom: 4,
  },
  NZ: {
    center: { lat: -40.9006, lng: 174.886 },
    zoom: 5,
  },
  GB: {
    center: { lat: 54.8, lng: -3.4 },
    zoom: 5,
  },
  IE: {
    center: { lat: 53.4129, lng: -8.2439 },
    zoom: 6,
  },
  CH: {
    center: { lat: 46.8182, lng: 8.2275 },
    zoom: 7,
  },
  DE: {
    center: { lat: 51.1657, lng: 10.4515 },
    zoom: 5,
  },
  FR: {
    center: { lat: 46.2276, lng: 2.2137 },
    zoom: 5,
  },
  ES: {
    center: { lat: 40.4637, lng: -3.7492 },
    zoom: 5,
  },
  IT: {
    center: { lat: 41.8719, lng: 12.5674 },
    zoom: 5,
  },
  NL: {
    center: { lat: 52.1326, lng: 5.2913 },
    zoom: 7,
  },
  BE: {
    center: { lat: 50.5039, lng: 4.4699 },
    zoom: 7,
  },
  AT: {
    center: { lat: 47.5162, lng: 14.5501 },
    zoom: 6,
  },
};

const REGION_BUCKET_COUNTRIES: Record<StartRegionBucket, string[]> = {
  "north-america": [
    "AG",
    "BB",
    "BS",
    "BZ",
    "CA",
    "CR",
    "CU",
    "DM",
    "DO",
    "GD",
    "GT",
    "HN",
    "HT",
    "JM",
    "KN",
    "LC",
    "MX",
    "NI",
    "PA",
    "PR",
    "SV",
    "TT",
    "US",
    "VC",
  ],
  europe: [
    "AD",
    "AL",
    "AT",
    "BA",
    "BE",
    "BG",
    "BY",
    "CH",
    "CY",
    "CZ",
    "DE",
    "DK",
    "EE",
    "ES",
    "FI",
    "FR",
    "GB",
    "GR",
    "HR",
    "HU",
    "IE",
    "IS",
    "IT",
    "LI",
    "LT",
    "LU",
    "LV",
    "MC",
    "MD",
    "ME",
    "MK",
    "MT",
    "NL",
    "NO",
    "PL",
    "PT",
    "RO",
    "RS",
    "SE",
    "SI",
    "SK",
    "SM",
    "UA",
    "VA",
  ],
  oceania: ["AU", "FJ", "NC", "NZ", "PG", "SB", "VU", "WS"],
  "latin-america": [
    "AR",
    "BO",
    "BR",
    "CL",
    "CO",
    "EC",
    "GF",
    "GY",
    "PE",
    "PY",
    "SR",
    "UY",
    "VE",
  ],
  asia: [
    "BD",
    "BN",
    "CN",
    "HK",
    "ID",
    "IN",
    "JP",
    "KG",
    "KH",
    "KR",
    "KZ",
    "LA",
    "LK",
    "MM",
    "MN",
    "MO",
    "MY",
    "NP",
    "PH",
    "PK",
    "SG",
    "TH",
    "TJ",
    "TM",
    "TW",
    "UZ",
    "VN",
  ],
  africa: [
    "AO",
    "BF",
    "BI",
    "BJ",
    "BW",
    "CD",
    "CF",
    "CG",
    "CI",
    "CM",
    "CV",
    "DJ",
    "DZ",
    "EG",
    "ER",
    "ET",
    "GA",
    "GH",
    "GM",
    "GN",
    "GQ",
    "GW",
    "KE",
    "KM",
    "LR",
    "LS",
    "LY",
    "MA",
    "MG",
    "ML",
    "MR",
    "MU",
    "MW",
    "MZ",
    "NA",
    "NE",
    "NG",
    "RW",
    "SC",
    "SD",
    "SL",
    "SN",
    "SO",
    "SS",
    "ST",
    "SZ",
    "TD",
    "TG",
    "TN",
    "TZ",
    "UG",
    "ZA",
    "ZM",
    "ZW",
  ],
  "middle-east": [
    "AE",
    "AM",
    "AZ",
    "BH",
    "GE",
    "IL",
    "IQ",
    "IR",
    "JO",
    "KW",
    "LB",
    "OM",
    "PS",
    "QA",
    "SA",
    "SY",
    "TR",
    "YE",
  ],
};

const TIMEZONE_BUCKET_MAP: Array<{
  prefix: string;
  bucket: StartRegionBucket;
}> = [
  { prefix: "Africa/", bucket: "africa" },
  { prefix: "Antarctica/", bucket: "oceania" },
  { prefix: "Asia/Amman", bucket: "middle-east" },
  { prefix: "Asia/Aden", bucket: "middle-east" },
  { prefix: "Asia/Baghdad", bucket: "middle-east" },
  { prefix: "Asia/Bahrain", bucket: "middle-east" },
  { prefix: "Asia/Beirut", bucket: "middle-east" },
  { prefix: "Asia/Damascus", bucket: "middle-east" },
  { prefix: "Asia/Dubai", bucket: "middle-east" },
  { prefix: "Asia/Gaza", bucket: "middle-east" },
  { prefix: "Asia/Hebron", bucket: "middle-east" },
  { prefix: "Asia/Jerusalem", bucket: "middle-east" },
  { prefix: "Asia/Kuwait", bucket: "middle-east" },
  { prefix: "Asia/Muscat", bucket: "middle-east" },
  { prefix: "Asia/Qatar", bucket: "middle-east" },
  { prefix: "Asia/Riyadh", bucket: "middle-east" },
  { prefix: "Asia/Tehran", bucket: "middle-east" },
  { prefix: "Asia/", bucket: "asia" },
  { prefix: "Atlantic/", bucket: "europe" },
  { prefix: "Australia/", bucket: "oceania" },
  { prefix: "Europe/", bucket: "europe" },
  { prefix: "Indian/Mauritius", bucket: "africa" },
  { prefix: "Indian/Reunion", bucket: "africa" },
  { prefix: "Indian/", bucket: "asia" },
  { prefix: "Pacific/Auckland", bucket: "oceania" },
  { prefix: "Pacific/Chatham", bucket: "oceania" },
  { prefix: "Pacific/Fiji", bucket: "oceania" },
  { prefix: "Pacific/Guam", bucket: "oceania" },
  { prefix: "Pacific/Honolulu", bucket: "north-america" },
  { prefix: "Pacific/Noumea", bucket: "oceania" },
  { prefix: "Pacific/Port_Moresby", bucket: "oceania" },
  { prefix: "Pacific/Tahiti", bucket: "oceania" },
];

const LATIN_AMERICA_TIMEZONES = [
  "America/Argentina/",
  "America/Asuncion",
  "America/Bogota",
  "America/Caracas",
  "America/Cayenne",
  "America/Guayaquil",
  "America/Guyana",
  "America/La_Paz",
  "America/Lima",
  "America/Manaus",
  "America/Montevideo",
  "America/Paramaribo",
  "America/Recife",
  "America/Rio_Branco",
  "America/Santiago",
  "America/Sao_Paulo",
];

function normalizeCountryCode(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return normalizeCountryCode(value[0]);
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim().toUpperCase();
  return /^[A-Z]{2}$/u.test(normalizedValue) ? normalizedValue : undefined;
}

function extractCountryCodeFromLocaleTag(localeTag: string): string | undefined {
  const segments = localeTag
    .split(/[-_]/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (let index = segments.length - 1; index >= 1; index--) {
    const segment = segments[index]?.toUpperCase();
    if (segment && /^[A-Z]{2}$/u.test(segment)) {
      return segment;
    }
  }

  return undefined;
}

@Injectable({
  providedIn: "root",
})
export class StartRegionService {
  private _platformId = inject(PLATFORM_ID);
  private _transferState = inject(TransferState);
  private _consentService = inject(ConsentService);
  private _locale = inject(LOCALE_ID, { optional: true });
  private _request = inject(REQUEST, { optional: true }) as Request | null;

  resolveStartRegion(): StartRegionResolution {
    if (!this._consentService.hasConsent()) {
      return this._createDefaultResolution();
    }

    const serverCountryCode = this._getServerCountryCode();
    if (serverCountryCode) {
      return {
        countryCode: serverCountryCode,
        regionBucket: this._getRegionBucketForCountry(serverCountryCode),
        source: "server-country",
      };
    }

    const localeCountryCode = this._getLocaleCountryCode();
    if (localeCountryCode) {
      return {
        countryCode: localeCountryCode,
        regionBucket: this._getRegionBucketForCountry(localeCountryCode),
        source: "locale-region",
      };
    }

    const timezoneBucket = this._getTimezoneBucket();
    if (timezoneBucket) {
      return {
        regionBucket: timezoneBucket,
        source: "timezone-bucket",
      };
    }

    return this._createDefaultResolution();
  }

  resolveInitialPreset(defaultZoom: number = DEFAULT_START_REGION_PRESET.zoom): StartRegionPreset {
    const resolution = this.resolveStartRegion();

    if (resolution.countryCode) {
      const countryPreset = COUNTRY_PRESETS[resolution.countryCode];
      if (countryPreset) {
        return countryPreset;
      }
    }

    if (resolution.source === "default") {
      return {
        center: DEFAULT_START_REGION_PRESET.center,
        zoom: defaultZoom,
      };
    }

    return REGION_BUCKET_PRESETS[resolution.regionBucket];
  }

  private _createDefaultResolution(): StartRegionResolution {
    return {
      regionBucket: "europe",
      source: "default",
    };
  }

  private _getServerCountryCode(): string | undefined {
    if (isPlatformServer(this._platformId)) {
      const normalizedCountry = normalizeCountryCode(
        this._request?.headers["x-pkspot-client-region"]
      );

      if (normalizedCountry) {
        this._transferState.set(SERVER_COUNTRY_STATE_KEY, normalizedCountry);
      }

      return normalizedCountry;
    }

    if (!isPlatformBrowser(this._platformId)) {
      return undefined;
    }

    const transferredCountry = normalizeCountryCode(
      this._transferState.get<string | null>(SERVER_COUNTRY_STATE_KEY, null)
    );

    this._transferState.remove(SERVER_COUNTRY_STATE_KEY);
    return transferredCountry;
  }

  private _getLocaleCountryCode(): string | undefined {
    const localeCandidates = new Set<string>();

    if (typeof this._locale === "string" && this._locale.trim()) {
      localeCandidates.add(this._locale.trim());
    }

    if (isPlatformServer(this._platformId)) {
      const acceptLanguage = this._request?.headers["accept-language"];
      if (typeof acceptLanguage === "string") {
        for (const entry of acceptLanguage.split(",")) {
          const localeTag = entry.split(";")[0]?.trim();
          if (localeTag) {
            localeCandidates.add(localeTag);
          }
        }
      }
    }

    if (isPlatformBrowser(this._platformId) && typeof navigator !== "undefined") {
      for (const localeTag of navigator.languages ?? []) {
        if (localeTag) {
          localeCandidates.add(localeTag);
        }
      }

      if (navigator.language) {
        localeCandidates.add(navigator.language);
      }
    }

    for (const localeTag of localeCandidates) {
      const countryCode = extractCountryCodeFromLocaleTag(localeTag);
      if (countryCode) {
        return countryCode;
      }
    }

    return undefined;
  }

  private _getTimezoneBucket(): StartRegionBucket | undefined {
    if (!isPlatformBrowser(this._platformId) || typeof Intl === "undefined") {
      return undefined;
    }

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) {
      return undefined;
    }

    if (
      timeZone.startsWith("America/") &&
      LATIN_AMERICA_TIMEZONES.some((prefix) => timeZone.startsWith(prefix))
    ) {
      return "latin-america";
    }

    for (const mapping of TIMEZONE_BUCKET_MAP) {
      if (timeZone.startsWith(mapping.prefix)) {
        return mapping.bucket;
      }
    }

    if (timeZone.startsWith("America/")) {
      return "north-america";
    }

    return undefined;
  }

  private _getRegionBucketForCountry(countryCode: string): StartRegionBucket {
    for (const [bucket, countryCodes] of Object.entries(REGION_BUCKET_COUNTRIES)) {
      if (countryCodes.includes(countryCode)) {
        return bucket as StartRegionBucket;
      }
    }

    return "europe";
  }
}
