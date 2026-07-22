import { TestBed } from "@angular/core/testing";
import { FunctionsAdapterService } from "../services/firebase/functions-adapter.service";
import { getWeatherTile } from "./weather-map-tile";
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
      callAppChecked: vi.fn().mockResolvedValue(response),
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

    expect(functions.callAppChecked).toHaveBeenCalledWith("getWeather", {
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
      callAppChecked: vi.fn().mockReturnValue(pending),
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
    expect(functions.callAppChecked).toHaveBeenCalledOnce();
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
      callAppChecked: vi
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
    expect(functions.callAppChecked).toHaveBeenCalledTimes(2);
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
      callAppChecked: vi.fn().mockResolvedValue(response),
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
    expect(functions.callAppChecked).toHaveBeenCalledOnce();
    expect(functions.callAppChecked).toHaveBeenCalledWith("getWeather", {
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
    expect(functions.callAppChecked).toHaveBeenCalledTimes(2);
  });

  it("canonicalizes nearby points to one zoom-12 weather request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-21T10:00:00Z");
    const response = {
      provider: "google",
      mode: "current-and-near-future",
      location: { lat: 47.37, lng: 8.57 },
      generatedAt: "2026-07-21T10:00:00Z",
      expiresAt: "2026-07-21T10:45:00Z",
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
      callAppChecked: vi.fn().mockResolvedValue(response),
    };
    TestBed.configureTestingModule({
      providers: [
        WeatherService,
        { provide: FunctionsAdapterService, useValue: functions },
      ],
    });
    const location = { lat: 47.3769, lng: 8.5417 };
    const tile = getWeatherTile(location);

    await TestBed.inject(WeatherService).getCurrentAndNearFutureForTileAt(
      location,
    );
    await TestBed.inject(WeatherService).getCurrentAndNearFutureForTileAt({
      lat: 47.3775,
      lng: 8.544,
    });

    expect(functions.callAppChecked).toHaveBeenCalledOnce();
    expect(functions.callAppChecked).toHaveBeenCalledWith("getWeather", {
      mode: "current-and-near-future",
      location: tile.center,
      nearFutureHours: 12,
      languageCode: "en-US",
      spatialScope: {
        type: "mercator-tile",
        zoom: tile.zoom,
        x: tile.x,
        y: tile.y,
      },
    });
  });

  it("requests and caches a tiled event forecast", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-21T10:00:00Z");
    const response = {
      provider: "google",
      mode: "event-forecast",
      location: { lat: 47.37, lng: 8.57 },
      generatedAt: "2026-07-21T10:00:00Z",
      expiresAt: "2026-07-21T10:45:00Z",
      forecast: [],
      dailyForecast: [],
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
      callAppChecked: vi.fn().mockResolvedValue(response),
    };
    TestBed.configureTestingModule({
      providers: [
        WeatherService,
        { provide: FunctionsAdapterService, useValue: functions },
      ],
    });
    const service = TestBed.inject(WeatherService);
    const location = { lat: 47.3769, lng: 8.5417 };
    const tile = getWeatherTile(location);
    const start = new Date("2026-07-23T08:00:00Z");
    const end = new Date("2026-07-27T16:00:00Z");

    await service.getEventForecastForTileAt(location, start, end);
    await service.getEventForecastForTileAt(location, start, end);

    expect(functions.callAppChecked).toHaveBeenCalledOnce();
    expect(functions.callAppChecked).toHaveBeenCalledWith("getWeather", {
      mode: "event-forecast",
      location: tile.center,
      eventStart: start.toISOString(),
      eventEnd: end.toISOString(),
      spatialScope: {
        type: "mercator-tile",
        zoom: tile.zoom,
        x: tile.x,
        y: tile.y,
      },
    });
    expect(service.isEventForecastAvailable(start, end)).toBe(true);
    expect(
      service.isEventForecastAvailable(
        new Date("2026-08-02T11:00:01Z"),
        new Date("2026-08-03T11:00:01Z"),
      ),
    ).toBe(false);
  });
});
