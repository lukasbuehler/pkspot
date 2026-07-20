import { describe, expect, it } from "vitest";
import type { WeatherResponse } from "./weather.models";
import {
  getWeatherVisualStatus,
  getWeatherWarnings,
} from "./weather-warnings";

const response = (
  overrides: Partial<WeatherResponse> = {},
): WeatherResponse => ({
  provider: "google",
  mode: "current-and-near-future",
  location: { lat: 47.37, lng: 8.54 },
  generatedAt: "2026-07-19T10:00:00Z",
  expiresAt: "2026-07-19T10:45:00Z",
  current: {
    time: "2026-07-19T10:00:00Z",
    condition: "clear",
    isDay: true,
  },
  forecast: [],
  insights: {
    summary: "Clear",
    precipitationRisk: "none",
    sunExposure: "moderate",
    surfaceDrying: {
      status: "likely_dry",
      confidence: "low",
      factors: [],
    },
  },
  ...overrides,
});

describe("weather warning presentation", () => {
  it("does not show a current warning for high UV later in the forecast", () => {
    const weather = response({
      forecast: [
        {
          time: "2026-07-19T12:00:00Z",
          condition: "clear",
          isDay: true,
          uvIndex: 7,
        },
      ],
    });

    expect(getWeatherWarnings(weather)).not.toContain("high-uv");
    expect(getWeatherVisualStatus(weather)).toBe("great");
  });

  it("shows high UV only for the current daytime conditions", () => {
    const daytime = response({
      current: {
        time: "2026-07-19T10:00:00Z",
        condition: "clear",
        isDay: true,
        uvIndex: 8,
      },
    });
    const nighttime = response({
      current: {
        time: "2026-07-19T22:00:00Z",
        condition: "clear",
        isDay: false,
        uvIndex: 8,
      },
    });

    expect(getWeatherWarnings(daytime)).toContain("high-uv");
    expect(getWeatherVisualStatus(daytime)).toBe("warning");
    expect(getWeatherWarnings(nighttime)).not.toContain("high-uv");
  });

  it("does not warn below UV index 8", () => {
    const weather = response({
      current: {
        time: "2026-07-19T10:00:00Z",
        condition: "clear",
        isDay: true,
        uvIndex: 7,
      },
    });

    expect(getWeatherWarnings(weather)).not.toContain("high-uv");
  });

  it("warns only when the current actual or apparent temperature reaches 30 degrees", () => {
    const laterHeat = response({
      forecast: [
        {
          time: "2026-07-19T12:00:00Z",
          condition: "clear",
          temperatureC: 30,
        },
      ],
    });
    const apparentHeat = response({
      current: {
        time: "2026-07-19T10:00:00Z",
        condition: "clear",
        temperatureC: 28,
        apparentTemperatureC: 31,
      },
    });

    expect(getWeatherWarnings(laterHeat)).not.toContain("high-temperature");
    expect(getWeatherWarnings(apparentHeat)).toContain("high-temperature");
    expect(getWeatherVisualStatus(apparentHeat)).toBe("warning");
  });

  it("suppresses the generic temperature warning when an official heat alert exists", () => {
    const weather = response({
      current: {
        time: "2026-07-19T10:00:00Z",
        condition: "clear",
        isDay: true,
        temperatureC: 36,
      },
      alerts: [
        {
          id: "extreme-heat",
          type: "HEAT",
          title: "Extreme heat warning",
          severity: "extreme",
          certainty: "likely",
          urgency: "expected",
          areaName: "Calabria",
          instructions: [],
          safetyRecommendations: [],
          source: {
            name: "Italian Meteorological Service",
            url: "https://example.com/",
          },
        },
      ],
    });

    expect(getWeatherWarnings(weather)).not.toContain("high-temperature");
    expect(getWeatherVisualStatus(weather)).toBe("warning");
  });

  it("uses wet status for wet surfaces without escalating them to warning", () => {
    const weather = response({
      insights: {
        summary: "Wet",
        precipitationRisk: "low",
        sunExposure: "moderate",
        surfaceDrying: {
          status: "wet",
          confidence: "medium",
          factors: ["recent precipitation"],
        },
      },
    });

    expect(getWeatherWarnings(weather)).toContain("wet-surface");
    expect(getWeatherVisualStatus(weather)).toBe("wet");
  });

  it("uses great status for clear weather without warnings", () => {
    expect(getWeatherVisualStatus(response())).toBe("great");
  });

  it("gives active public alerts warning priority", () => {
    const weather = response({
      alerts: [
        {
          id: "storm",
          type: "STORM",
          title: "Severe storm warning",
          severity: "severe",
          certainty: "likely",
          urgency: "expected",
          areaName: "Zurich",
          instructions: [],
          safetyRecommendations: [],
          source: {
            name: "MeteoSwiss",
            url: "https://www.meteoswiss.admin.ch/",
          },
        },
      ],
    });

    expect(getWeatherVisualStatus(weather)).toBe("warning");
  });

  it("suppresses sun and wet conditions for covered spots", () => {
    const weather = response({
      current: {
        time: "2026-07-19T10:00:00Z",
        condition: "heavy-rain",
        precipitationMm: 4,
        precipitationProbabilityPercent: 90,
        uvIndex: 8,
      },
      insights: {
        summary: "Heavy rain",
        precipitationRisk: "high",
        sunExposure: "harsh",
        surfaceDrying: {
          status: "wet",
          confidence: "medium",
          factors: ["heavy rain"],
        },
      },
    });

    expect(getWeatherWarnings(weather, { covered: true })).not.toContain(
      "heavy-rain",
    );
    expect(getWeatherWarnings(weather, { covered: true })).not.toContain(
      "high-uv",
    );
    expect(getWeatherWarnings(weather, { covered: true })).not.toContain(
      "wet-surface",
    );
    expect(getWeatherVisualStatus(weather, { covered: true })).toBe("neutral");
  });
});
