import { describe, expect, it, vi } from "vitest";
import {
  attachGoogleMapsAppCheck,
  getGooglePlaceFields,
} from "./maps-api.service";

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
