import type {
  WeatherLocation,
  WeatherTile,
} from "./weather.models";

const MAX_MERCATOR_LATITUDE = 85.05112878;
export const WEATHER_TILE_ZOOM = 12;

export function getWeatherTile(
  location: WeatherLocation,
  zoom = WEATHER_TILE_ZOOM,
): WeatherTile {
  const tileCount = 2 ** zoom;
  const latitude = clamp(
    location.lat,
    -MAX_MERCATOR_LATITUDE,
    MAX_MERCATOR_LATITUDE,
  );
  const longitude = normalizeLongitude(location.lng);
  const latitudeRadians = (latitude * Math.PI) / 180;
  const x = clamp(
    Math.floor(((longitude + 180) / 360) * tileCount),
    0,
    tileCount - 1,
  );
  const y = clamp(
    Math.floor(
      ((1 -
        Math.asinh(Math.tan(latitudeRadians)) / Math.PI) /
        2) *
        tileCount,
    ),
    0,
    tileCount - 1,
  );

  return {
    type: "mercator-tile",
    zoom,
    x,
    y,
    center: getWeatherTileCenter(zoom, x, y),
    key: `${zoom}/${x}/${y}`,
  };
}

export function getViewportCenter(
  bbox: {
    north: number;
    south: number;
    east: number;
    west: number;
  },
): WeatherLocation {
  const longitudeSpan =
    bbox.east >= bbox.west
      ? bbox.east - bbox.west
      : bbox.east + 360 - bbox.west;
  return {
    lat: (bbox.north + bbox.south) / 2,
    lng: normalizeLongitude(bbox.west + longitudeSpan / 2),
  };
}

function getWeatherTileCenter(
  zoom: number,
  x: number,
  y: number,
): WeatherLocation {
  const tileCount = 2 ** zoom;
  const lng = ((x + 0.5) / tileCount) * 360 - 180;
  const mercatorY = Math.PI * (1 - (2 * (y + 0.5)) / tileCount);
  const lat = (Math.atan(Math.sinh(mercatorY)) * 180) / Math.PI;
  return { lat, lng };
}

function normalizeLongitude(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
