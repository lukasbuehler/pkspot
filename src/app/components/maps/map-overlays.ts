import { MarkerSchema } from "../marker/marker.component";

export interface MapPointMarker extends MarkerSchema {
  id: string;
  minZoom?: number;
  maxZoom?: number;
  forceFullMarker?: boolean;
  dotModeThreshold?: number;
}

export interface MapCircleOverlay {
  id: string;
  center: google.maps.LatLngLiteral;
  radiusM: number;
  options?: google.maps.CircleOptions;
}

export interface MapBoundsOverlay {
  id: string;
  bounds: google.maps.LatLngBoundsLiteral;
  options?: google.maps.RectangleOptions;
}

export interface MapFeatureBoundaryOverlay {
  id: string;
  featureType: "COUNTRY";
  placeId?: string;
  query?: string;
  region?: string;
  options?: google.maps.FeatureStyleOptions;
}
