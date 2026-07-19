import type { WeatherCondition } from "./weather-display";

export type WeatherProvider = "google" | "open-meteo";

export interface WeatherLocation {
  lat: number;
  lng: number;
}

export interface WeatherPoint {
  time: string;
  temperatureC?: number;
  apparentTemperatureC?: number;
  relativeHumidityPercent?: number;
  precipitationMm?: number;
  precipitationProbabilityPercent?: number;
  uvIndex?: number;
  solarRadiationWm2?: number;
  cloudCoverPercent?: number;
  windSpeedKmh?: number;
  weatherCode?: string;
  condition?: WeatherCondition;
  sunrise?: string;
  sunset?: string;
  isDay?: boolean;
}

export interface WeatherInsights {
  summary: string;
  rainStartsAt?: string;
  rainStopsAt?: string;
  likelyDryUntil?: string;
  precipitationRisk: "none" | "low" | "medium" | "high";
  sunExposure: "dark" | "low" | "moderate" | "harsh";
  surfaceDrying: {
    status: "unknown" | "wet" | "drying" | "likely_dry";
    estimatedDryAt?: string;
    confidence: "low" | "medium";
    factors: string[];
  };
}

export interface WeatherResponse {
  provider: WeatherProvider;
  mode: "current-and-near-future" | "forecast-at" | "event-forecast";
  location: WeatherLocation;
  generatedAt: string;
  expiresAt: string;
  attribution?: string;
  timeZone?: string;
  current?: WeatherPoint;
  forecast?: WeatherPoint[];
  target?: WeatherPoint;
  insights: WeatherInsights;
}

export interface CurrentWeatherRequest {
  mode: "current-and-near-future";
  location: WeatherLocation;
  nearFutureHours: number;
}
