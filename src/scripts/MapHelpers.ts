import { SpotSchema } from "../db/schemas/SpotSchema";
import {
  TILE_SIZE,
  mercatorProjection as sharedMercatorProjection,
  getUnroundedTileCoordinatesForLocationAndZoom as sharedGetUnroundedTileCoordinatesForLocationAndZoom,
  getTileCoordinatesForLocationAndZoom as sharedGetTileCoordinatesForLocationAndZoom,
  computeTileCoordinates,
} from "./TileCoordinateHelpers";

export namespace MapHelpers {

  export function getBoundsForTile(
    zoom: number,
    x: number,
    y: number
  ): google.maps.LatLngBoundsLiteral {
    const scale = 1 << zoom;
    let southWest = inverseMercatorProjection(
      (x * TILE_SIZE) / scale,
      ((y + 1) * TILE_SIZE) / scale
    );
    let northEast = inverseMercatorProjection(
      ((x + 1) * TILE_SIZE) / scale,
      (y * TILE_SIZE) / scale
    );

    return {
      south: southWest.lat,
      west: southWest.lng,
      north: northEast.lat,
      east: northEast.lng,
    };
  }

  export function mercatorProjection(latLng: google.maps.LatLngLiteral): {
    x: number;
    y: number;
  } {
    return sharedMercatorProjection(latLng.lat, latLng.lng);
  }

  export function inverseMercatorProjection(
    x: number,
    y: number
  ): google.maps.LatLngLiteral {
    var lng = (x / TILE_SIZE - 0.5) * 360;

    var lat =
      (Math.asin(Math.tanh((0.5 - y / TILE_SIZE) * (2 * Math.PI))) * 180) /
      Math.PI;

    return {
      lat: lat,
      lng: lng,
    };
  }

  export function getUnroundedTileCoordinatesForLocationAndZoom(
    latLng: google.maps.LatLngLiteral,
    zoom: number
  ): { x: number; y: number } {
    return sharedGetUnroundedTileCoordinatesForLocationAndZoom(
      latLng.lat,
      latLng.lng,
      zoom
    );
  }

  export function getTileCoordinatesForLocationAndZoom(
    latLng: google.maps.LatLngLiteral,
    zoom: number
  ): { x: number; y: number } {
    return sharedGetTileCoordinatesForLocationAndZoom(latLng.lat, latLng.lng, zoom);
  }

  export function getHumanReadableCoordinates(
    coordinates: google.maps.LatLngLiteral
  ): string {
    let lat: number = coordinates.lat;
    let lng: number = coordinates.lng;

    let isNorth: boolean = lat >= 0;
    let isEast: boolean = lng >= 0;
    lat = Math.abs(lat);
    lng = Math.abs(lng);

    let latDegrees = Math.floor(lat);
    let lngDegrees = Math.floor(lng);

    lat = (lat - latDegrees) * 60;
    lng = (lng - lngDegrees) * 60;
    let latMinutes = Math.floor(lat);
    let lngMinutes = Math.floor(lng);

    lat = (lat - latMinutes) * 60;
    lng = (lng - lngMinutes) * 60;
    let latSeconds = Math.round(lat * 1000) / 1000;
    let lngSeconds = Math.round(lng * 1000) / 1000;

    return `${latDegrees}° ${latMinutes}' ${latSeconds}'' ${
      isNorth ? "N" : "S"
    }, ${lngDegrees}° ${lngMinutes}' ${lngSeconds}'' ${isEast ? "E" : "W"}`;
  }

  export function getTileCoordinates(
    location: google.maps.LatLngLiteral
  ): SpotSchema["tile_coordinates"] {
    return computeTileCoordinates(location.lat, location.lng);
  }
}
