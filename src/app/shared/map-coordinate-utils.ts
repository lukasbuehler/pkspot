export function isFiniteLatLngLiteral(
  coordinate: google.maps.LatLngLiteral | null | undefined,
): coordinate is google.maps.LatLngLiteral {
  return (
    !!coordinate &&
    Number.isFinite(coordinate.lat) &&
    coordinate.lat >= -90 &&
    coordinate.lat <= 90 &&
    Number.isFinite(coordinate.lng) &&
    coordinate.lng >= -180 &&
    coordinate.lng <= 180
  );
}

const MAX_WEB_MERCATOR_LATITUDE = 85.05112878;

export function isUsableMapCenterLiteral(
  coordinate: google.maps.LatLngLiteral | null | undefined,
): coordinate is google.maps.LatLngLiteral {
  return (
    isFiniteLatLngLiteral(coordinate) &&
    coordinate.lat > -MAX_WEB_MERCATOR_LATITUDE &&
    coordinate.lat < MAX_WEB_MERCATOR_LATITUDE
  );
}

export function toFiniteLatLngLiteral(
  coordinate:
    | google.maps.LatLng
    | google.maps.LatLngLiteral
    | null
    | undefined,
): google.maps.LatLngLiteral | null {
  if (!coordinate) return null;

  const literal =
    "toJSON" in coordinate ? coordinate.toJSON() : coordinate;
  return isFiniteLatLngLiteral(literal) ? literal : null;
}

export function toUsableMapCenterLiteral(
  coordinate:
    | google.maps.LatLng
    | google.maps.LatLngLiteral
    | null
    | undefined,
): google.maps.LatLngLiteral | null {
  const literal = toFiniteLatLngLiteral(coordinate);
  return isUsableMapCenterLiteral(literal) ? literal : null;
}

export function isFiniteBoundsLiteral(
  bounds: google.maps.LatLngBoundsLiteral | null | undefined,
): bounds is google.maps.LatLngBoundsLiteral {
  return (
    !!bounds &&
    Number.isFinite(bounds.north) &&
    bounds.north >= -90 &&
    bounds.north <= 90 &&
    Number.isFinite(bounds.south) &&
    bounds.south >= -90 &&
    bounds.south <= 90 &&
    Number.isFinite(bounds.east) &&
    bounds.east >= -180 &&
    bounds.east <= 180 &&
    Number.isFinite(bounds.west) &&
    bounds.west >= -180 &&
    bounds.west <= 180 &&
    bounds.north >= bounds.south
  );
}

export function isFiniteLatLngBounds(
  bounds: google.maps.LatLngBounds | null | undefined,
): bounds is google.maps.LatLngBounds {
  return !!bounds && isFiniteBoundsLiteral(bounds.toJSON());
}

export function reportInvalidMapCoordinate(
  message: string,
  value: unknown,
): void {
  let error: Error;
  try {
    throw new Error(`[MapCoordinateGuard] ${message}`);
  } catch (caught) {
    error = caught instanceof Error ? caught : new Error(String(caught));
  }

  console.warn(
    `[MapCoordinateGuard] ${message}; value=${serializeInvalidMapValue(value)}\n${
      error.stack ?? String(error)
    }`,
  );
}

function serializeInvalidMapValue(value: unknown): string {
  if (value === undefined) return "undefined";

  try {
    return JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item === "number" && !Number.isFinite(item)) {
        return String(item);
      }

      return item;
    });
  } catch {
    return String(value);
  }
}
