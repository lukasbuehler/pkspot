import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeolocationService } from "./geolocation.service";
import { LocationAccessService } from "./location-access.service";

describe("LocationAccessService", () => {
  const geolocation = {
    checkPermissions: vi.fn<() => Promise<boolean>>(),
    startWatching: vi.fn<() => Promise<void>>(),
    stopWatching: vi.fn<() => Promise<void>>(),
  };
  let service: LocationAccessService;

  beforeEach(() => {
    localStorage.clear();
    geolocation.checkPermissions.mockReset();
    geolocation.checkPermissions.mockResolvedValue(false);
    geolocation.startWatching.mockReset();
    geolocation.stopWatching.mockReset();
    geolocation.startWatching.mockResolvedValue();
    geolocation.stopWatching.mockResolvedValue();
    TestBed.configureTestingModule({
      providers: [
        LocationAccessService,
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: GeolocationService, useValue: geolocation },
      ],
    });
    service = TestBed.inject(LocationAccessService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to off and does not start a watch", async () => {
    expect(service.mode()).toBe("off");
    await expect(service.startWatchingIfEnabled()).resolves.toBe(false);
    expect(geolocation.startWatching).not.toHaveBeenCalled();
  });

  it("resumes opted-in location silently when OS permission is still granted", async () => {
    await service.enablePersistent();
    geolocation.startWatching.mockClear();
    geolocation.checkPermissions.mockResolvedValue(true);
    await expect(service.startWatchingIfEnabled()).resolves.toBe(true);
    expect(geolocation.startWatching).toHaveBeenCalledOnce();
  });

  it("allows an explicit location action to request permission again", async () => {
    await service.enablePersistent();
    geolocation.startWatching.mockClear();
    await expect(service.startWatchingIfEnabled({ requestPermission: true })).resolves.toBe(true);
    expect(geolocation.startWatching).toHaveBeenCalledOnce();
  });

  it.each(["on", "temporary"])("does not prompt on startup when saved %s access has lost browser permission", async (mode) => {
    localStorage.setItem("pkspot_location_access", JSON.stringify({ mode, temporaryUntilMs: Date.now() + 60_000 }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: PLATFORM_ID, useValue: "browser" },
      { provide: GeolocationService, useValue: geolocation },
    ] });
    const restored = TestBed.inject(LocationAccessService);
    expect(restored.enabled()).toBe(true);
    await expect(restored.startWatchingIfEnabled()).resolves.toBe(false);
    expect(geolocation.startWatching).not.toHaveBeenCalled();
    await restored.disable();
  });

  it("expires temporary access after five minutes and clears the watch", async () => {
    vi.useFakeTimers();
    await service.enableTemporarily();
    expect(service.enabled()).toBe(true);
    expect(geolocation.startWatching).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1_000);

    expect(service.mode()).toBe("off");
    expect(service.enabled()).toBe(false);
    expect(geolocation.stopWatching).toHaveBeenCalledOnce();
  });
});
