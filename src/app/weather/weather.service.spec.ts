import { TestBed } from "@angular/core/testing";
import { FunctionsAdapterService } from "../services/firebase/functions-adapter.service";
import { WeatherService } from "./weather.service";

describe("WeatherService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls the normalized weather endpoint", async () => {
    const response = {
      provider: "google",
      mode: "current-and-near-future",
      location: { lat: 47.37, lng: 8.54 },
      generatedAt: "2026-07-19T10:00:00Z",
      expiresAt: "2026-07-19T10:45:00Z",
      insights: {
        summary: "Dry conditions",
        precipitationRisk: "none",
        sunExposure: "low",
        surfaceDrying: {
          status: "likely_dry",
          confidence: "low",
          factors: [],
        },
      },
    };
    const functions = {
      callPublic: vi.fn().mockResolvedValue(response),
    };
    TestBed.configureTestingModule({
      providers: [
        WeatherService,
        { provide: FunctionsAdapterService, useValue: functions },
      ],
    });

    const result = await TestBed.inject(
      WeatherService,
    ).getCurrentAndNearFuture({ lat: 47.37, lng: 8.54 });

    expect(functions.callPublic).toHaveBeenCalledWith("getWeather", {
      mode: "current-and-near-future",
      location: { lat: 47.37, lng: 8.54 },
      nearFutureHours: 12,
      languageCode: "en-US",
    });
    expect(result).toBe(response);
  });

  it("deduplicates simultaneous requests for the same point", async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    const pending = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    const functions = {
      callPublic: vi.fn().mockReturnValue(pending),
    };
    TestBed.configureTestingModule({
      providers: [
        WeatherService,
        { provide: FunctionsAdapterService, useValue: functions },
      ],
    });
    const service = TestBed.inject(WeatherService);

    const first = service.getCurrentAndNearFuture({ lat: 47.37, lng: 8.54 });
    const second = service.getCurrentAndNearFuture({
      lat: 47.3702,
      lng: 8.5402,
    });

    expect(first).toBe(second);
    expect(functions.callPublic).toHaveBeenCalledOnce();
    resolveRequest?.({});
    await first;
  });

  it("allows a request to be retried after a provider failure", async () => {
    const response = {
      provider: "google",
      mode: "current-and-near-future",
      location: { lat: 47.37, lng: 8.54 },
      generatedAt: "2026-07-19T10:00:00Z",
      expiresAt: "2026-07-19T10:45:00Z",
      insights: {
        summary: "Dry conditions",
        precipitationRisk: "none",
        sunExposure: "low",
        surfaceDrying: {
          status: "likely_dry",
          confidence: "low",
          factors: [],
        },
      },
    };
    const functions = {
      callPublic: vi
        .fn()
        .mockRejectedValueOnce(new Error("provider unavailable"))
        .mockResolvedValueOnce(response),
    };
    TestBed.configureTestingModule({
      providers: [
        WeatherService,
        { provide: FunctionsAdapterService, useValue: functions },
      ],
    });
    const service = TestBed.inject(WeatherService);
    const location = { lat: 47.37, lng: 8.54 };

    await expect(service.getCurrentAndNearFuture(location)).rejects.toThrow(
      "provider unavailable",
    );
    await expect(service.getCurrentAndNearFuture(location)).resolves.toBe(
      response,
    );
    expect(functions.callPublic).toHaveBeenCalledTimes(2);
  });

  it("reuses a completed tile response until it expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-19T10:00:00Z");
    const response = {
      provider: "google",
      mode: "current-and-near-future",
      location: { lat: 47.37, lng: 8.57 },
      generatedAt: "2026-07-19T10:00:00Z",
      expiresAt: "2026-07-19T10:45:00Z",
      insights: {
        summary: "Dry conditions",
        precipitationRisk: "none",
        sunExposure: "low",
        surfaceDrying: {
          status: "likely_dry",
          confidence: "low",
          factors: [],
        },
      },
    };
    const functions = {
      callPublic: vi.fn().mockResolvedValue(response),
    };
    TestBed.configureTestingModule({
      providers: [
        WeatherService,
        { provide: FunctionsAdapterService, useValue: functions },
      ],
    });
    const service = TestBed.inject(WeatherService);
    const tile = {
      type: "mercator-tile" as const,
      zoom: 12,
      x: 2145,
      y: 1432,
      center: { lat: 47.37, lng: 8.57 },
      key: "12/2145/1432",
    };

    await service.getCurrentAndNearFutureForTile(tile);
    await service.getCurrentAndNearFutureForTile(tile);
    expect(functions.callPublic).toHaveBeenCalledOnce();
    expect(functions.callPublic).toHaveBeenCalledWith("getWeather", {
      mode: "current-and-near-future",
      location: tile.center,
      nearFutureHours: 12,
      languageCode: "en-US",
      spatialScope: {
        type: "mercator-tile",
        zoom: 12,
        x: 2145,
        y: 1432,
      },
    });

    vi.setSystemTime("2026-07-19T10:46:00Z");
    await service.getCurrentAndNearFutureForTile(tile);
    expect(functions.callPublic).toHaveBeenCalledTimes(2);
  });
});
