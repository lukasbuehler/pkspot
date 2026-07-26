import { describe, expect, it } from "vitest";
import type { WeatherResponse } from "./weather.models";
import {
  getSpotWeatherContext,
  shouldRecommendDrySpots,
} from "./spot-weather-context";

const weatherResponse = {
  provider: "google",
  mode: "current-and-near-future",
  location: { lat: 47.37, lng: 8.54 },
  generatedAt: "2026-07-26T10:00:00Z",
  expiresAt: "2026-07-26T10:45:00Z",
  insights: {
    summary: "Dry conditions",
    precipitationRisk: "none",
    sunExposure: "moderate",
    surfaceDrying: {
      status: "likely_dry",
      confidence: "medium",
      factors: [],
    },
  },
} satisfies WeatherResponse;

describe("getSpotWeatherContext", () => {
  it("disables weather for indoor-only spots", () => {
    expect(
      getSpotWeatherContext({ indoor: true, outdoor: false, covered: true }),
    ).toEqual({ available: false, covered: false });
  });

  it("keeps weather for spots with indoor and outdoor areas", () => {
    expect(
      getSpotWeatherContext({ indoor: true, outdoor: true, covered: false }),
    ).toEqual({ available: true, covered: false });
  });

  it("marks covered outdoor spots as covered", () => {
    expect(
      getSpotWeatherContext({ indoor: false, outdoor: true, covered: true }),
    ).toEqual({ available: true, covered: true });
  });

  it("recommends dry spots when meaningful rain is expected", () => {
    expect(
      shouldRecommendDrySpots({
        ...weatherResponse,
        insights: {
          ...weatherResponse.insights,
          precipitationRisk: "medium",
        },
      }),
    ).toBe(true);
  });

  it("recommends dry spots while outdoor surfaces are still drying", () => {
    expect(
      shouldRecommendDrySpots({
        ...weatherResponse,
        insights: {
          ...weatherResponse.insights,
          surfaceDrying: {
            ...weatherResponse.insights.surfaceDrying,
            status: "drying",
          },
        },
      }),
    ).toBe(true);
  });

  it("keeps the normal ranking for a dry forecast", () => {
    expect(shouldRecommendDrySpots(weatherResponse)).toBe(false);
  });
});
