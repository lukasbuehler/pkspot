import type { WeatherCondition } from "./weather-display";

export type WeatherProvider = "google" | "open-meteo";

export interface WeatherLocation {
  lat: number;
  lng: number;
}

export interface WeatherTileScope {
  type: "mercator-tile";
  zoom: number;
  x: number;
  y: number;
}

export interface WeatherTile extends WeatherTileScope {
  center: WeatherLocation;
  key: string;
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

export interface DailyWeatherPoint {
  date: string;
  maxTemperatureC?: number;
  minTemperatureC?: number;
  precipitationMm?: number;
  precipitationProbabilityPercent?: number;
  uvIndex?: number;
  weatherCode?: string;
  condition?: WeatherCondition;
  sunrise?: string;
  sunset?: string;
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

export type WeatherAlertSeverity =
  | "unknown"
  | "minor"
  | "moderate"
  | "severe"
  | "extreme";

export interface WeatherAlert {
  id: string;
  type: string;
  title: string;
  severity: WeatherAlertSeverity;
  certainty:
    | "unknown"
    | "observed"
    | "very-likely"
    | "likely"
    | "possible"
    | "unlikely";
  urgency: "unknown" | "immediate" | "expected" | "future" | "past";
  areaName: string;
  startsAt?: string;
  expiresAt?: string;
  description?: string;
  instructions: string[];
  safetyRecommendations: Array<{
    directive: string;
    subtext?: string;
  }>;
  source: {
    name: string;
    url: string;
  };
}

export interface WeatherResponse {
  provider: WeatherProvider;
  mode: "current-and-near-future" | "forecast-at" | "event-forecast";
  location: WeatherLocation;
  countryCode?: string;
  generatedAt: string;
  expiresAt: string;
  attribution?: string;
  timeZone?: string;
  current?: WeatherPoint;
  forecast?: WeatherPoint[];
  dailyForecast?: DailyWeatherPoint[];
  target?: WeatherPoint;
  alerts?: WeatherAlert[];
  alertsStatus?: "available" | "unavailable";
  alertsExpiresAt?: string;
  insights: WeatherInsights;
}

export interface CurrentWeatherRequest {
  mode: "current-and-near-future";
  location: WeatherLocation;
  nearFutureHours: number;
  spatialScope?: WeatherTileScope;
  languageCode?: string;
}
