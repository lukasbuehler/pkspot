import type { AmenitiesMap } from "../../db/schemas/Amenities";

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
