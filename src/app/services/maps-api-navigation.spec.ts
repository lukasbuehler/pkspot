import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ open: vi.fn(), platform: vi.fn(() => "web") }));
vi.mock("@capacitor/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@capacitor/core")>();
  return {
    ...actual,
    Capacitor: { ...actual.Capacitor, getPlatform: native.platform },
    registerPlugin: (name: string) => name === "MapsLauncher" ? native : actual.registerPlugin(name),
  };
});

import { MapsApiService } from "./maps-api.service";

describe("external map navigation", () => {
  const location = { lat: 47.3769, lng: 8.5417 };
  let service: MapsApiService;
  let open: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    native.platform.mockReturnValue("web");
    native.open.mockReset().mockResolvedValue(undefined);
    open = vi.spyOn(window, "open").mockReturnValue(null);
    // These launch methods need analytics only, not the Google loader or consent DI.
    service = Object.assign(Object.create(MapsApiService.prototype) as MapsApiService, {
      _analytics: { addUtmToUrl: () => undefined, trackEvent: vi.fn() },
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("honors an explicit Google choice on iOS", async () => {
    native.platform.mockReturnValue("ios");
    await service.openLatLngInMaps(location, "google");
    expect(native.open).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(expect.stringContaining("https://www.google.com/maps/search/"));
  });

  it("honors an explicit Apple choice on Android", async () => {
    native.platform.mockReturnValue("android");
    await service.openLatLngInMaps(location, "apple");
    expect(native.open).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(expect.stringContaining("https://maps.apple.com/?ll=47.3769,8.5417"));
  });

  it.each([false, true])("hands the implicit iOS choice to the OS (directions=%s)", async directions => {
    native.platform.mockReturnValue("ios");
    await (directions ? service.openDirectionsInMaps(location) : service.openLatLngInMaps(location));
    expect(native.open).toHaveBeenCalledWith({ ...location, directions });
    expect(open).not.toHaveBeenCalled();
  });

  it.each([false, true])("falls back when default navigation or the native bridge is unavailable (directions=%s)", async directions => {
    native.platform.mockReturnValue("ios");
    native.open.mockRejectedValue(new Error("unavailable"));
    await (directions ? service.openDirectionsInMaps(location) : service.openLatLngInMaps(location));
    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(expect.stringContaining(
      directions ? "?daddr=47.3769,8.5417" : "?ll=47.3769,8.5417",
    ));
  });

  it("opens web links during the click even without analytics URL tagging", () => {
    vi.spyOn(service, "isMacOSOriOS").mockReturnValue(false);
    void service.openLatLngInMaps(location);
    expect(open).toHaveBeenCalledWith(expect.stringContaining("query=47.3769,8.5417"));
  });

  it("recognizes Mac browsers without literal slashes around the user agent", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    expect(service.isMacOSOriOS()).toBe(true);
  });
});
