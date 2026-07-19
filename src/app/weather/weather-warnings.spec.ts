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
        uvIndex: 7,
      },
    });
    const nighttime = response({
      current: {
        time: "2026-07-19T22:00:00Z",
        condition: "clear",
        isDay: false,
        uvIndex: 7,
      },
    });

    expect(getWeatherWarnings(daytime)).toContain("high-uv");
    expect(getWeatherVisualStatus(daytime)).toBe("warning");
    expect(getWeatherWarnings(nighttime)).not.toContain("high-uv");
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
