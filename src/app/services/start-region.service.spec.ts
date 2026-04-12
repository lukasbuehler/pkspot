import { TestBed } from "@angular/core/testing";
import { LOCALE_ID, PLATFORM_ID, TransferState } from "@angular/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REQUEST } from "../../express.token";
import {
  DEFAULT_START_REGION_PRESET,
  SERVER_COUNTRY_STATE_KEY,
  StartRegionService,
} from "./start-region.service";
import { ConsentService } from "./consent.service";

describe("StartRegionService", () => {
  const originalLanguage = navigator.language;
  const originalLanguages = navigator.languages;
  let consentGranted = true;

  beforeEach(() => {
    consentGranted = true;
    Object.defineProperty(navigator, "language", {
      configurable: true,
      value: originalLanguage,
    });
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      value: originalLanguages,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function configureBrowser(options?: {
    localeId?: string;
    transferCountry?: string | null;
  }) {
    TestBed.configureTestingModule({
      providers: [
        StartRegionService,
        TransferState,
        {
          provide: ConsentService,
          useValue: {
            hasConsent: () => consentGranted,
          },
        },
        {
          provide: PLATFORM_ID,
          useValue: "browser",
        },
        {
          provide: LOCALE_ID,
          useValue: options?.localeId ?? "en",
        },
      ],
    });

    if (options?.transferCountry !== undefined) {
      const transferState = TestBed.inject(TransferState);
      transferState.set(SERVER_COUNTRY_STATE_KEY, options.transferCountry);
    }

    return TestBed.inject(StartRegionService);
  }

  function configureServer(options?: {
    localeId?: string;
    requestHeaders?: Record<string, string | string[] | undefined>;
  }) {
    TestBed.configureTestingModule({
      providers: [
        StartRegionService,
        TransferState,
        {
          provide: ConsentService,
          useValue: {
            hasConsent: () => consentGranted,
          },
        },
        {
          provide: PLATFORM_ID,
          useValue: "server",
        },
        {
          provide: LOCALE_ID,
          useValue: options?.localeId ?? "en",
        },
        {
          provide: REQUEST,
          useValue: {
            headers: options?.requestHeaders ?? {},
          },
        },
      ],
    });

    return TestBed.inject(StartRegionService);
  }

  it("should prefer a transferred server country over locale and timezone hints", () => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      value: ["de-CH", "en-US"],
    });
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      locale: "de-CH",
      calendar: "gregory",
      numberingSystem: "latn",
      timeZone: "Europe/Zurich",
    } as Intl.ResolvedDateTimeFormatOptions);

    const service = configureBrowser({
      localeId: "de",
      transferCountry: "US",
    });

    expect(service.resolveStartRegion()).toEqual({
      countryCode: "US",
      regionBucket: "north-america",
      source: "server-country",
    });
  });

  it("should use the locale region before falling back to timezone buckets", () => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      value: ["en-AU", "en"],
    });
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      locale: "en-AU",
      calendar: "gregory",
      numberingSystem: "latn",
      timeZone: "Europe/Berlin",
    } as Intl.ResolvedDateTimeFormatOptions);

    const service = configureBrowser({
      localeId: "en",
    });

    expect(service.resolveStartRegion()).toEqual({
      countryCode: "AU",
      regionBucket: "oceania",
      source: "locale-region",
    });
  });

  it("should fall back to the matching region bucket for unsupported countries", () => {
    const service = configureServer({
      requestHeaders: {
        "x-pkspot-client-region": "BR",
      },
    });

    expect(service.resolveStartRegion()).toEqual({
      countryCode: "BR",
      regionBucket: "latin-america",
      source: "server-country",
    });
  });

  it("should keep the existing default preset when consent is not granted", () => {
    consentGranted = false;
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      value: ["en-US"],
    });
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      locale: "en-US",
      calendar: "gregory",
      numberingSystem: "latn",
      timeZone: "America/New_York",
    } as Intl.ResolvedDateTimeFormatOptions);

    const service = configureBrowser({
      transferCountry: "US",
    });

    expect(service.resolveStartRegion()).toEqual({
      regionBucket: "europe",
      source: "default",
    });
    expect(service.resolveInitialPreset()).toEqual(DEFAULT_START_REGION_PRESET);
  });

  it("should fall back to the current default center when no hints are available", () => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      value: ["en"],
    });
    Object.defineProperty(navigator, "language", {
      configurable: true,
      value: "en",
    });
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      locale: "en",
      calendar: "gregory",
      numberingSystem: "latn",
      timeZone: undefined,
    } as Intl.ResolvedDateTimeFormatOptions);

    const service = configureBrowser({
      localeId: "en",
    });

    expect(service.resolveStartRegion()).toEqual({
      regionBucket: "europe",
      source: "default",
    });
    expect(service.resolveInitialPreset()).toEqual(DEFAULT_START_REGION_PRESET);
  });
});
