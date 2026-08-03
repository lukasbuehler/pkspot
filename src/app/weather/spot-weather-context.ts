import type { AmenitiesMap } from "../../db/schemas/Amenities";
import type { WeatherResponse } from "./weather.models";

export interface SpotWeatherContext {
  available: boolean;
  covered: boolean;
}

export function getSpotWeatherContext(
  amenities: AmenitiesMap | null | undefined,
): SpotWeatherContext {
  const hasOutdoorArea = amenities?.outdoor === true;
  const isIndoorOnly = amenities?.indoor === true && !hasOutdoorArea;

  return {
    available: !isIndoorOnly,
    covered: hasOutdoorArea && amenities?.covered === true,
  };
}

export function shouldRecommendDrySpots(
  response: WeatherResponse | null | undefined,
): boolean {
  if (!response) return false;
  return (
    response.insights.precipitationRisk === "medium" ||
    response.insights.precipitationRisk === "high" ||
    response.insights.surfaceDrying.status === "wet" ||
    response.insights.surfaceDrying.status === "drying"
  );
}
