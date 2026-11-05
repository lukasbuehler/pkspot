import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "../../environments/environment.default";
import { BehaviorSubject } from "rxjs";
import {
  attachGoogleMapsAppCheck,
  getEarlyMapStartScript,
  getGooglePlaceFields,
  MapsApiService,
} from "./maps-api.service";
import { CURRENT_TERMS_VERSION } from "./consent-version";

describe("getEarlyMapStartScript", () => {
  afterEach(() => {
    document.getElementById("pkspot-early-maps-api")?.remove();
    localStorage.removeItem("acceptedVersion");
    delete (window as Window & { mapsCallback?: () => void }).mapsCallback;
  });

  const run = () => new Function(getEarlyMapStartScript())();

  it("contacts Google only after consent to the current terms", () => {
    localStorage.setItem("acceptedVersion", "outdated");
    run();
    expect(document.getElementById("pkspot-early-maps-api")).toBeNull();
  });

  it("starts the Maps download for a visitor who has consented", () => {
    localStorage.setItem("acceptedVersion", CURRENT_TERMS_VERSION);
    run();
    const script = document.getElementById(
      "pkspot-early-maps-api",
    ) as HTMLScriptElement;
    expect(new URL(script.src).searchParams.get("libraries")).toBe("marker");
    expect(getEarlyMapStartScript()).not.toContain("recaptcha");
  });
});

describe("MapsApiService library loading", () => {
  afterEach(() => vi.unstubAllGlobals());

  const createService = (overrides: Record<string, unknown> = {}) =>
    Object.assign(Object.create(MapsApiService.prototype), {
      hasConsent: () => true,
      isApiLoaded: () => true,
      _isApiLoaded: () => true,
      executeWithConsent: <T>(work: () => Promise<T>) => work(),
      ...overrides,
    }) as MapsApiService;

  it("keeps Places and unused visualization code out of the map bootstrap", () => {
    const service = createService({
      isApiLoaded: () => false,
      _isLoading$: new BehaviorSubject(false),
      _loadingProgress$: new BehaviorSubject(0),
    });
    service.loadGoogleMapsApi();
    const script = document.querySelector<HTMLScriptElement>(
      'script[src^="https://maps.googleapis.com/maps/api/js"]',
    );
    try {
      expect(script).not.toBeNull();
      expect(new URL(script!.src).searchParams.get("libraries")).toBe("marker");
    } finally {
      script?.remove();
      delete (window as Window & { mapsCallback?: () => void }).mapsCallback;
    }
  });

  it("adopts an early Maps script instead of adding a second one", () => {
    const early = document.createElement("script");
    early.id = "pkspot-early-maps-api";
    document.head.appendChild(early);
    const service = createService({
      isApiLoaded: () => false,
      _isLoading$: new BehaviorSubject(false),
      _loadingProgress$: new BehaviorSubject(0),
    });
    try {
      service.loadGoogleMapsApi();
      expect(
        document.querySelector('script[src^="https://maps.googleapis.com/maps/api/js"]'),
      ).toBeNull();
      expect(
        (window as Window & { mapsCallback?: () => void }).mapsCallback,
      ).toBeTypeOf("function");
    } finally {
      early.remove();
      delete (window as Window & { mapsCallback?: () => void }).mapsCallback;
    }
  });

  it("loads Maps again after an adopted early script fails", () => {
    const early = document.createElement("script");
    early.id = "pkspot-early-maps-api";
    early.onerror = () => early.remove();
    document.head.appendChild(early);
    const isLoading$ = new BehaviorSubject(false);
    const loadingProgress$ = new BehaviorSubject(0);
    const service = createService({
      isApiLoaded: () => false,
      _isLoading$: isLoading$,
      _loadingProgress$: loadingProgress$,
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const retryScript = () =>
      document.querySelector<HTMLScriptElement>(
        'script[src^="https://maps.googleapis.com/maps/api/js"]',
      );
    try {
      service.loadGoogleMapsApi();
      expect(isLoading$.value).toBe(true);

      early.dispatchEvent(new Event("error"));
      expect(isLoading$.value).toBe(false);
      expect(loadingProgress$.value).toBe(0);

      service.loadGoogleMapsApi();
      expect(isLoading$.value).toBe(true);
      expect(retryScript()).not.toBeNull();
    } finally {
      consoleError.mockRestore();
      early.remove();
      retryScript()?.remove();
      delete (window as Window & { mapsCallback?: () => void }).mapsCallback;
    }
  });

  it("loads Places on demand before autocomplete, detail and nearby calls", async () => {
    const fetchFields = vi.fn().mockResolvedValue(undefined);
    const suggestions = vi.fn().mockResolvedValue({ suggestions: [] });
    const nearby = vi.fn().mockResolvedValue({ places: [] });
    const importLibrary = vi.fn().mockResolvedValue({
      AutocompleteSuggestion: { fetchAutocompleteSuggestions: suggestions },
      Place: class {
        static searchNearby = nearby;
        fetchFields = fetchFields;
      },
      SearchNearbyRankPreference: { DISTANCE: "DISTANCE" },
    });
    vi.stubGlobal("google", { maps: { importLibrary } });
    const service = createService();
    expect(importLibrary).not.toHaveBeenCalled();
    await expect(service.autocompletePlaceSearch("London")).resolves.toEqual([]);
    await service.getGooglePlaceById("place-id");
    await expect(service.getNearbyPlacesByDistance({ lat: 0, lng: 0 })).resolves.toEqual([]);
    expect(importLibrary).toHaveBeenCalledTimes(3);
    expect(importLibrary.mock.calls.every(([library]) => library === "places")).toBe(true);
    expect(suggestions).toHaveBeenCalledOnce();
    expect(fetchFields).toHaveBeenCalledWith({ fields: getGooglePlaceFields("location") });
    expect(nearby).toHaveBeenCalledOnce();
  });
});

describe("MapsApiService App Check", () => {
  const appCheckWasEnabled = environment.appCheck.enabled;
  beforeEach(() => {
    environment.appCheck.enabled = true;
  });
  afterEach(() => {
    environment.appCheck.enabled = appCheckWasEnabled;
    vi.unstubAllGlobals();
  });

  async function configure(state: "ready" | "failed") {
    const settings: { fetchAppCheckToken?: unknown } = {};
    vi.stubGlobal("google", {
      maps: {
        importLibrary: vi.fn().mockResolvedValue({
          Settings: { getInstance: () => settings },
        }),
      },
    });
    let finishCheck!: () => void;
    const service = Object.assign(
      Object.create(MapsApiService.prototype) as MapsApiService,
      {
        _appCheck: {
          firstCheckFinished: new Promise<void>((r) => (finishCheck = r)),
          status: () => ({ state }),
          getTokenForRequest: async () => "token",
        },
      },
    ) as unknown as { _configureGoogleMapsAppCheck(): Promise<void> };
    await service._configureGoogleMapsAppCheck();
    return { settings, finishCheck };
  }

  it("does not hold tile requests until a token exists", async () => {
    const { settings, finishCheck } = await configure("ready");
    expect(settings.fetchAppCheckToken).toBeUndefined();

    finishCheck();
    await new Promise((resolve) => setTimeout(resolve));
    expect(settings.fetchAppCheckToken).toBeTypeOf("function");
  });

  it("keeps the map working without a token when the check fails", async () => {
    const { settings, finishCheck } = await configure("failed");

    finishCheck();
    await new Promise((resolve) => setTimeout(resolve));
    expect(settings.fetchAppCheckToken).toBeUndefined();
  });
});

describe("MapsApiService place detail fields", () => {
  it("keeps map positioning requests within the Essentials tier", () => {
    expect(getGooglePlaceFields("location")).toEqual([
      "location",
      "types",
      "viewport",
    ]);
    expect(getGooglePlaceFields("location")).not.toEqual(
      expect.arrayContaining([
        "rating",
        "regularOpeningHours",
        "websiteURI",
      ]),
    );
  });

  it("reserves Enterprise fields for rich place cards", () => {
    expect(getGooglePlaceFields("rich")).toEqual(
      expect.arrayContaining([
        "rating",
        "regularOpeningHours",
        "websiteURI",
      ]),
    );
  });

  it("attaches App Check tokens to Google Maps requests", async () => {
    const settings = {
      fetchAppCheckToken: async () => ({ token: "" }),
    };

    attachGoogleMapsAppCheck(settings, async () => "app-check-token");

    await expect(settings.fetchAppCheckToken()).resolves.toEqual({
      token: "app-check-token",
    });
  });
});

describe("Street View image requests", () => {
  it("uses the checked panorama for both preview and detail camera framing", async () => {
    const { MapsApiService } = await import('./maps-api.service');
    // Isolate the request/cache flow from Google loader and consent DI. No live requests.
    const service = Object.assign(Object.create(MapsApiService.prototype) as MapsApiService, {
      streetViewCache: new Map(), streetViewMetadataCache: new Map(),
      streetViewPanoramas: new Map(), streetViewMetadataInFlight: new Map(),
      hasConsent: () => true, isStreetViewPreviewEnabled: () => true,
      isStreetViewDetailEnabled: () => true,
      executeWithConsent: (work: () => Promise<boolean>) => work(),
    });
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ status: 'OK', pano_id: 'tested-panorama', location: { lat: 0, lng: 0 } }),
    } as Response);
    try {
      const target = { lat: 0, lng: 20 / 6371000 * 180 / Math.PI };
      expect(await service.hasStreetViewPanoramaForLocation(target, 'spot')).toBe(true);
      const preview = service.getStaticStreetViewImageForLocation(target, 400, 400, 'spot');
      const query = new URL(preview!).searchParams;
      expect(query.get('pano')).toBe('tested-panorama');
      expect(Number(query.get('heading'))).toBeCloseTo(90);
      expect(Number(query.get('fov'))).toBeCloseTo(73.74, 1);
      expect(query.get('pitch')).toBe('0');
      expect(await service.loadStreetviewForLocation(target, 'spot')).toBeDefined();
      expect(fetch).toHaveBeenCalledOnce();
    } finally { fetch.mockRestore(); }
  });
});

describe("training locality labels", () => {
  it("uses the locality instead of a street address and reuses the lookup", async () => {
    const { MapsApiService } = await import("./maps-api.service");
    const geocode = vi.fn().mockResolvedValue({ results: [{ address_components: [
      { long_name: "Private street", types: ["route"] },
      { long_name: "Zürich", types: ["locality", "political"] },
    ] }] });
    const service = Object.assign(Object.create(MapsApiService.prototype) as MapsApiService, {
      localityNames: new Map(), hasConsent: () => true,
      isApiLoaded: () => true, loadGoogleMapsApi: vi.fn(),
    });
    vi.stubGlobal("google", { maps: { importLibrary: vi.fn().mockResolvedValue({
      Geocoder: class { geocode = geocode; },
    }) } });
    try {
      const location = { lat: 47.377, lng: 8.542 };
      expect(await service.getLocalityName(location)).toBe("Zürich");
      expect(await service.getLocalityName(location)).toBe("Zürich");
      expect(geocode).toHaveBeenCalledTimes(1);
      geocode.mockRejectedValueOnce(new Error("Unavailable"));
      expect(await service.getLocalityName({ lat: 48, lng: 9 })).toBeNull();
      expect(await service.getLocalityName({ lat: 48, lng: 9 })).toBe("Zürich");
    } finally { vi.unstubAllGlobals(); }
  });

  it("does not load Google without consent", async () => {
    const { MapsApiService } = await import("./maps-api.service");
    const loadGoogleMapsApi = vi.fn();
    const service = Object.assign(Object.create(MapsApiService.prototype) as MapsApiService, {
      hasConsent: () => false, loadGoogleMapsApi,
    });
    expect(await service.getLocalityName({ lat: 47, lng: 8 })).toBeNull();
    expect(loadGoogleMapsApi).not.toHaveBeenCalled();
  });
});
