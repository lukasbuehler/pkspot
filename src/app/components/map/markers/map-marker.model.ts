export type MapMarkerColor = "primary" | "secondary" | "tertiary" | "gray";

export interface MapMarkerSchema {
  name?: string;
  color?: MapMarkerColor;
  location: google.maps.LatLngLiteral;
  icons?: string[];
  /**
   * Optional image source rendered as a small badge in place of `icons`.
   * Used for event/sponsor logos on map pins.
   */
  imageSrc?: string;
  imageBackgroundColor?: string;
  number?: number | string;
  numberVariant?: "default" | "flag";
  size?: number;
  priority?: "required" | number;
  ignoreCollisions?: boolean;
  type?: string;
  description?: string;
}

export type MarkerSchema = MapMarkerSchema;

export function getMapMarkerPriority(marker: MapMarkerSchema): number {
  if (marker.priority === "required") {
    return 10_000;
  }

  if (typeof marker.priority === "number") {
    return marker.priority;
  }

  switch (marker.color) {
    case "secondary":
      return 500;
    case "tertiary":
      return 300;
    case "primary":
    default:
      return 100;
  }
}

export function getMapMarkerCollisionBehavior(
  marker: MapMarkerSchema
): google.maps.CollisionBehavior {
  return marker.priority === "required" || marker.ignoreCollisions
    ? google.maps.CollisionBehavior.REQUIRED
    : google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY;
}

export function buildMapMarkerOptions(
  marker: MapMarkerSchema
): google.maps.marker.AdvancedMarkerElementOptions {
  return {
    gmpClickable: true,
    collisionBehavior: getMapMarkerCollisionBehavior(marker),
    zIndex: getMapMarkerPriority(marker),
  };
}
