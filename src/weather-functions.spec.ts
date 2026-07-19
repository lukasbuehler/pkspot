import { describe, expect, it, afterEach } from "vitest";
import {
  buildEventInsights,
  buildWeatherCacheKey,
  buildWeatherInsights,
  getProviderCacheDurationMs,
  normalizeWeatherCondition,
  parseWeatherRequest,
  resolveRequestWindow,
  resolveWeatherProvider,
} from "../functions/src/weatherFunctions";
import type { WeatherPoint } from "../functions/src/weatherFunctions";

describe("weather functions", () => {
  afterEach(() => {
    delete process.env.WEATHER_PROVIDER;
  });

  it("validates current and near-future requests", () => {
    expect(
      parseWeatherRequest({
        mode: "current-and-near-future",
        location: { lat: 47.37, lng: 8.54 },
        nearFutureHours: 12,
      })
    ).toEqual({
      mode: "current-and-near-future",
      location: { lat: 47.37, lng: 8.54 },
      nearFutureHours: 12,
      providerOverride: undefined,
    });

    expect(() =>
      parseWeatherRequest({
        mode: "current-and-near-future",
        location: { lat: 47.37, lng: 8.54 },
        nearFutureHours: 25,
      })
    ).toThrow(/nearFutureHours/);
  });

  it("allows provider override only for admins", () => {
    expect(resolveWeatherProvider("open-meteo", true)).toBe("open-meteo");
    expect(() => resolveWeatherProvider("open-meteo", false)).toThrow(
      /admin privileges/
    );
  });

  it("uses Google as the default provider unless configured otherwise", () => {
    expect(resolveWeatherProvider(undefined, false)).toBe("google");
    process.env.WEATHER_PROVIDER = "open-meteo";
    expect(resolveWeatherProvider(undefined, false)).toBe("open-meteo");
  });

  it("enforces provider forecast windows", () => {
    const now = new Date("2026-07-08T10:15:00Z");

    expect(() =>
      resolveRequestWindow(
        {
          mode: "forecast-at",
          location: { lat: 47.37, lng: 8.54 },
          targetTime: "2026-07-20T10:00:00Z",
        },
        "google",
        now
      )
    ).toThrow(/forecast range/);

    expect(
      resolveRequestWindow(
        {
          mode: "forecast-at",
          location: { lat: 47.37, lng: 8.54 },
          targetTime: "2026-07-20T10:00:00Z",
        },
        "open-meteo",
        now
      ).endTime.toISOString()
    ).toBe("2026-07-20T14:00:00.000Z");

    expect(() =>
      resolveRequestWindow(
        {
          mode: "forecast-at",
          location: { lat: 47.37, lng: 8.54 },
          targetTime: "2026-07-08T09:00:00Z",
        },
        "open-meteo",
        now
      )
    ).toThrow(/past/);
  });

  it("buckets cache keys by rounded point and request window", () => {
    const first = parseWeatherRequest({
      mode: "current-and-near-future",
      location: { lat: 47.371, lng: 8.541 },
      nearFutureHours: 12,
    });
    const second = parseWeatherRequest({
      mode: "current-and-near-future",
      location: { lat: 47.372, lng: 8.542 },
      nearFutureHours: 12,
    });
    const window = {
      startTime: new Date("2026-07-08T10:00:00Z"),
      endTime: new Date("2026-07-08T22:00:00Z"),
    };

    expect(buildWeatherCacheKey(first, "google", window)).toBe(
      buildWeatherCacheKey(second, "google", window)
    );
  });

  it("uses a canonical map tile center and cache key", () => {
    const request = parseWeatherRequest({
      mode: "current-and-near-future",
      location: { lat: 0, lng: 0 },
      nearFutureHours: 12,
      spatialScope: {
        type: "mercator-tile",
        zoom: 12,
        x: 2145,
        y: 1432,
      },
    });
    const window = {
      startTime: new Date("2026-07-08T10:00:00Z"),
      endTime: new Date("2026-07-08T22:00:00Z"),
    };
    const sameTile = {
      ...request,
      location: { lat: 40, lng: 12 },
    };

    expect(request.location).not.toEqual({ lat: 0, lng: 0 });
    expect(buildWeatherCacheKey(request, "google", window)).toBe(
      buildWeatherCacheKey(sameTile, "google", window)
    );
  });

  it("rejects invalid map tile coordinates", () => {
    expect(() =>
      parseWeatherRequest({
        mode: "current-and-near-future",
        location: { lat: 47.37, lng: 8.54 },
        spatialScope: {
          type: "mercator-tile",
          zoom: 12,
          x: 4096,
          y: 1432,
        },
      })
    ).toThrow(/spatialScope.x/);
  });

  it("rejects map tile scope for non-current forecast modes", () => {
    expect(() =>
      parseWeatherRequest({
        mode: "forecast-at",
        location: { lat: 47.37, lng: 8.54 },
        targetTime: "2026-07-09T10:00:00Z",
        spatialScope: {
          type: "mercator-tile",
          zoom: 12,
          x: 2145,
          y: 1432,
        },
      })
    ).toThrow(/only supported for current weather/);
  });

  it("keeps Google cached weather below the hourly provider limit", () => {
    expect(getProviderCacheDurationMs("google", "current-and-near-future")).toBe(
      45 * 60 * 1000
    );
    expect(getProviderCacheDurationMs("google", "event-forecast")).toBe(
      45 * 60 * 1000
    );
    expect(getProviderCacheDurationMs("open-meteo", "event-forecast")).toBe(
      6 * 60 * 60 * 1000
    );
  });

  it("normalizes provider weather conditions", () => {
    expect(normalizeWeatherCondition("google", "MOSTLY_CLEAR")).toBe(
      "mostly-clear"
    );
    expect(normalizeWeatherCondition("google", "HEAVY_RAIN_SHOWERS")).toBe(
      "heavy-rain"
    );
    expect(normalizeWeatherCondition("google", "RAIN_AND_SNOW")).toBe("sleet");
    expect(normalizeWeatherCondition("open-meteo", 45)).toBe("fog");
    expect(normalizeWeatherCondition("open-meteo", 67)).toBe("freezing-rain");
    expect(normalizeWeatherCondition("open-meteo", 99)).toBe("hail");
    expect(normalizeWeatherCondition("open-meteo", 999)).toBe("unknown");
  });

  it("derives rain, dry-until, sun, and drying insights", () => {
    const points: WeatherPoint[] = [
      {
        time: "2026-07-08T10:00:00Z",
        weatherCode: "CLEAR",
        precipitationProbabilityPercent: 5,
        precipitationMm: 0,
        uvIndex: 9,
        solarRadiationWm2: 750,
        cloudCoverPercent: 0,
        temperatureC: 28,
        relativeHumidityPercent: 45,
        windSpeedKmh: 10,
        isDay: true,
      },
      {
        time: "2026-07-08T11:00:00Z",
        precipitationProbabilityPercent: 60,
        precipitationMm: 0.4,
        temperatureC: 25,
        relativeHumidityPercent: 70,
        windSpeedKmh: 8,
        cloudCoverPercent: 80,
        isDay: true,
      },
      {
        time: "2026-07-08T12:00:00Z",
        precipitationProbabilityPercent: 10,
        precipitationMm: 0,
        temperatureC: 26,
        relativeHumidityPercent: 55,
        windSpeedKmh: 15,
        solarRadiationWm2: 500,
        cloudCoverPercent: 30,
        isDay: true,
      },
    ];

    const insights = buildWeatherInsights(points);

    expect(insights.summary).toBe("Rain possible later");
    expect(insights.rainStartsAt).toBe("2026-07-08T11:00:00Z");
    expect(insights.rainStopsAt).toBe("2026-07-08T12:00:00.000Z");
    expect(insights.likelyDryUntil).toBe("2026-07-08T11:00:00Z");
    expect(insights.precipitationRisk).toBe("medium");
    expect(insights.sunExposure).toBe("harsh");
    expect(insights.surfaceDrying.status).toBe("drying");
  });

  it("derives event-level wettest, hottest, and dry windows", () => {
    const insights = buildEventInsights([
      {
        time: "2026-07-08T10:00:00Z",
        temperatureC: 20,
        precipitationProbabilityPercent: 0,
        precipitationMm: 0,
        isDay: true,
      },
      {
        time: "2026-07-08T11:00:00Z",
        temperatureC: 24,
        precipitationProbabilityPercent: 80,
        precipitationMm: 1,
        isDay: true,
      },
      {
        time: "2026-07-08T12:00:00Z",
        temperatureC: 30,
        precipitationProbabilityPercent: 0,
        precipitationMm: 0,
        uvIndex: 8,
        solarRadiationWm2: 600,
        cloudCoverPercent: 5,
        isDay: true,
      },
    ]);

    expect(insights.wettestHour?.time).toBe("2026-07-08T11:00:00Z");
    expect(insights.hottestHour?.time).toBe("2026-07-08T12:00:00Z");
    expect(insights.harshestSunHour?.time).toBe("2026-07-08T12:00:00Z");
    expect(insights.rainPeriods).toEqual([
      {
        start: "2026-07-08T11:00:00Z",
        end: "2026-07-08T12:00:00.000Z",
      },
    ]);
    expect(insights.likelyDryWindows).toEqual([
      {
        start: "2026-07-08T10:00:00Z",
        end: "2026-07-08T11:00:00.000Z",
      },
      {
        start: "2026-07-08T12:00:00Z",
        end: "2026-07-08T13:00:00.000Z",
      },
    ]);
  });
});
