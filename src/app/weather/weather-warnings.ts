import {
  WEATHER_STATES,
  type WeatherCondition,
  type WeatherWarning,
} from "./weather-display";
import type { WeatherPoint, WeatherResponse } from "./weather.models";

export type WeatherVisualStatus = "neutral" | "great" | "wet" | "warning";

export interface WeatherPresentationContext {
  covered?: boolean;
}

const ATTENTION_WARNINGS = new Set<WeatherWarning>([
  "heavy-rain",
  "thunderstorm",
  "hail",
  "ice-risk",
  "harsh-sun",
  "high-uv",
  "high-temperature",
  "strong-wind",
  "poor-air-quality",
]);

export function getWeatherWarnings(
  response: WeatherResponse,
  context: WeatherPresentationContext = {},
): WeatherWarning[] {
  const warnings = new Set<WeatherWarning>();
  const points = [response.current, ...(response.forecast ?? [])].filter(
    (point): point is WeatherPoint => point !== undefined,
  );
  const conditions = new Set(
    points.map((point) => point.condition ?? "unknown"),
  );
  const current = response.current ?? response.forecast?.[0];

  if (conditions.has("thunderstorm")) warnings.add("thunderstorm");
  if (conditions.has("hail")) warnings.add("hail");
  if (!context.covered) {
    if (conditions.has("heavy-rain")) warnings.add("heavy-rain");
    if (
      conditions.has("freezing-rain") ||
      points.some(
        (point) =>
          (point.temperatureC ?? Infinity) <= 0 &&
          (point.precipitationMm ?? 0) > 0,
      )
    ) {
      warnings.add("ice-risk");
    }
    if (
      current?.isDay === true &&
      response.insights.sunExposure === "harsh"
    ) {
      warnings.add("harsh-sun");
    } else if (
      current?.isDay === true &&
      (current.uvIndex ?? 0) >= 6
    ) {
      warnings.add("high-uv");
    }
  }
  if (points.some((point) => (point.windSpeedKmh ?? 0) >= 40)) {
    warnings.add("strong-wind");
  }
  if (
    current &&
    Math.max(
      current.temperatureC ?? -Infinity,
      current.apparentTemperatureC ?? -Infinity,
    ) >= 30
  ) {
    warnings.add("high-temperature");
  }
  if (!context.covered && response.insights.surfaceDrying.status === "wet") {
    warnings.add("wet-surface");
  }

  return [...warnings];
}

export function getWeatherVisualStatus(
  response: WeatherResponse,
  context: WeatherPresentationContext = {},
): WeatherVisualStatus {
  if ((response.alerts?.length ?? 0) > 0) {
    return "warning";
  }
  const warnings = getWeatherWarnings(response, context);
  const current = response.current ?? response.forecast?.[0];
  const condition = current?.condition ?? "unknown";

  if (
    warnings.some((warning) => ATTENTION_WARNINGS.has(warning)) ||
    isRelevantSevereCondition(condition, context)
  ) {
    return "warning";
  }
  if (
    !context.covered &&
    (response.insights.surfaceDrying.status === "wet" ||
      WEATHER_STATES[condition].tone === "wet" ||
      isMeaningfulRain(current))
  ) {
    return "wet";
  }
  return WEATHER_STATES[condition].tone === "sun" ? "great" : "neutral";
}

function isRelevantSevereCondition(
  condition: WeatherCondition,
  context: WeatherPresentationContext,
): boolean {
  if (WEATHER_STATES[condition].tone !== "severe") {
    return false;
  }
  return (
    !context.covered ||
    condition === "thunderstorm" ||
    condition === "hail" ||
    condition === "heavy-snow"
  );
}

function isMeaningfulRain(point: WeatherPoint | undefined): boolean {
  return (
    (point?.precipitationProbabilityPercent ?? 0) >= 40 ||
    (point?.precipitationMm ?? 0) >= 0.2
  );
}
