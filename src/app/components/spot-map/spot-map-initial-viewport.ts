import { StartRegionPreset } from "../../services/start-region.service";
import { isFiniteLatLngLiteral } from "../../shared/map-coordinate-utils";

export interface StoredMapViewport {
  location: google.maps.LatLngLiteral;
  zoom: number;
}

export interface ResolveInitialMapViewportOptions {
  selectedSpotLocation?: google.maps.LatLngLiteral | null;
  centerStart?: google.maps.LatLngLiteral | null;
  boundsCenter?: google.maps.LatLngLiteral | null;
  lastLocationAndZoom?: StoredMapViewport | null;
  fallbackPreset: StartRegionPreset;
  focusZoom: number;
}

export type InitialMapViewportSource =
  | "selected-spot"
  | "center-start"
  | "bounds"
  | "last-location"
  | "fallback";

export interface InitialMapViewport {
  center: google.maps.LatLngLiteral;
  zoom: number;
  source: InitialMapViewportSource;
}

export function resolveInitialMapViewport(
  options: ResolveInitialMapViewportOptions
): InitialMapViewport {
  if (isFiniteLatLngLiteral(options.selectedSpotLocation)) {
    return {
      center: options.selectedSpotLocation,
      zoom: options.focusZoom,
      source: "selected-spot",
    };
  }

  if (isFiniteLatLngLiteral(options.centerStart)) {
    return {
      center: options.centerStart,
      zoom: options.focusZoom,
      source: "center-start",
    };
  }

  if (isFiniteLatLngLiteral(options.boundsCenter)) {
    return {
      center: options.boundsCenter,
      zoom: options.focusZoom,
      source: "bounds",
    };
  }

  if (isFiniteLatLngLiteral(options.lastLocationAndZoom?.location)) {
    return {
      center: options.lastLocationAndZoom.location,
      zoom: options.lastLocationAndZoom.zoom,
      source: "last-location",
    };
  }

  return {
    center: options.fallbackPreset.center,
    zoom: options.fallbackPreset.zoom,
    source: "fallback",
  };
}
