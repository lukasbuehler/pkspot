import { TestBed } from "@angular/core/testing";
import type { Position } from "@capacitor/geolocation";
import { beforeEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
  callbacks: [] as Array<(position: Position | null, err?: unknown) => void>,
  options: [] as Array<Record<string, unknown>>,
}));

vi.mock("@capacitor/geolocation", () => ({
  Geolocation: {
    checkPermissions: vi.fn(async () => ({ location: "granted" })),
    requestPermissions: vi.fn(async () => ({ location: "granted" })),
    watchPosition: vi.fn(async (options: Record<string, unknown>, callback: (typeof plugin.callbacks)[number]) => {
      plugin.options.push(options);
      plugin.callbacks.push(callback);
      return `watch-${plugin.callbacks.length}`;
    }),
    clearWatch: vi.fn(async () => undefined),
  },
}));

import { Geolocation } from "@capacitor/geolocation";
import { GeolocationService, movementSpeed, nativeWatchOptions } from "./geolocation.service";
import { PlatformService } from "./platform.service";

function position(timestamp: number, speed: number | null, lat = 47.37): Position {
  return {
    timestamp,
    coords: { latitude: lat, longitude: 8.54, accuracy: 5, speed, altitude: null, altitudeAccuracy: null, heading: null },
  } as Position;
}

async function startedService() {
  TestBed.configureTestingModule({
    providers: [{ provide: PlatformService, useValue: { isNative: () => true } }],
  });
  const service = TestBed.inject(GeolocationService);
  await service.startWatching();
  return service;
}

const latest = () => plugin.callbacks[plugin.callbacks.length - 1];

describe("GeolocationService (native)", () => {
  beforeEach(() => {
    plugin.callbacks.length = 0;
    plugin.options.length = 0;
    vi.mocked(Geolocation.clearWatch).mockClear();
  });

  it("keeps the location when another request's timeout reaches the watch, and restarts it", async () => {
    const service = await startedService();
    latest()(position(1_000, 0));
    latest()(null, { code: "OS-PLUG-GLOC-0010", message: "timeout" });
    expect(service.error()).toBeNull();
    expect(service.currentLocation()).not.toBeNull();
    await vi.waitFor(() => expect(plugin.callbacks).toHaveLength(2));
    expect(Geolocation.clearWatch).toHaveBeenCalledWith({ id: "watch-1" });
  });

  it("ignores an unavailable position", async () => {
    const service = await startedService();
    latest()(position(1_000, 0));
    latest()(null, { code: "OS-PLUG-GLOC-0002" });
    expect(service.error()).toBeNull();
    expect(plugin.callbacks).toHaveLength(1);
  });

  it("reports a denied permission and ends the watch", async () => {
    const service = await startedService();
    latest()(null, { code: "OS-PLUG-GLOC-0003" });
    expect(service.error()).toEqual({ code: "OS-PLUG-GLOC-0003" });
    expect(service.currentLocation()).toBeNull();
    expect(Geolocation.clearWatch).toHaveBeenCalledWith({ id: "watch-1" });
  });

  it("asks for faster updates while moving and slows down after a still spell", async () => {
    await startedService();
    expect(plugin.options[0]).toMatchObject(nativeWatchOptions(false));
    latest()(position(1_000, 3));
    await vi.waitFor(() => expect(plugin.options).toHaveLength(2));
    expect(plugin.options[1]).toMatchObject(nativeWatchOptions(true));

    latest()(position(5_000, 0.5));
    expect(plugin.options).toHaveLength(2);
    latest()(position(25_000, 0.5));
    await vi.waitFor(() => expect(plugin.options).toHaveLength(3));
    expect(plugin.options[2]).toMatchObject(nativeWatchOptions(false));
  });

  it("derives speed from consecutive fixes when the device reports none", () => {
    // About 111 m north in 10 s.
    expect(movementSpeed(position(10_000, null, 47.371), position(0, null, 47.37))).toBeCloseTo(11.1, 0);
    expect(movementSpeed(position(10_000, null), null)).toBeNull();
    expect(movementSpeed(position(10_000, 2.5), null)).toBe(2.5);
  });
});
