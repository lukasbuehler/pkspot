import {
  getWeatherForecastState,
  hasMeaningfulPrecipitation,
} from "../../weather/weather-display";
import type { WeatherPoint, WeatherResponse } from "../../weather/weather.models";

export type TrainingRainOutlook =
  | { kind: "raining" }
  | { kind: "dry-until"; time: string }
  | { kind: "dry" };

/**
 * Reduces a near-future forecast to the one question that decides an outdoor
 * session: is it raining now, and if not, how long will it stay dry?
 */
export function trainingRainOutlook(
  response: WeatherResponse,
): TrainingRainOutlook {
  const current = response.current ?? response.forecast?.[0];
  if (current && isWet(current)) return { kind: "raining" };
  const currentTime = current ? new Date(current.time).getTime() : -Infinity;
  const nextRain = (response.forecast ?? []).find(
    (point) =>
      new Date(point.time).getTime() > currentTime &&
      hasMeaningfulPrecipitation(point),
  );
  return nextRain ? { kind: "dry-until", time: nextRain.time } : { kind: "dry" };
}

function isWet(point: WeatherPoint): boolean {
  const state = getWeatherForecastState({
    ...point,
    condition: point.condition ?? "unknown",
  });
  return (
    hasMeaningfulPrecipitation(point) ||
    state.tone === "wet" ||
    state.tone === "severe"
  );
}
