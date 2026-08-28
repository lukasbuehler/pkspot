import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeolocationService } from "./geolocation.service";
import { LocationAccessService } from "./location-access.service";

describe("LocationAccessService", () => {
  const geolocation = {
    startWatching: vi.fn<() => Promise<void>>(),
    stopWatching: vi.fn<() => Promise<void>>(),
  };
  let service: LocationAccessService;

  beforeEach(() => {
    localStorage.clear();
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
