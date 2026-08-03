import { inject, Injectable } from "@angular/core";
import { MarkerSchema } from "../components/map/markers/map-marker.model";
import { MapHelpers } from "../../scripts/MapHelpers";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";

const OSM_AMENITY_TILE_ZOOM = 12 as const;
const DEFAULT_NEAREST_AMENITY_RADIUS_METERS = 10_000;
const DEFAULT_NEAREST_AMENITY_MAX_TILES = 9;
const EARTH_RADIUS_METERS = 6_371_000;
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;

// Supporting OSM amenities must never obscure the primary Spot layer.
const OSM_AMENITY_MARKER_PRIORITY = {
  drinkingWater: -10,
  toilet: {
    free: -20,
    unknown: -30,
    paid: -40,
  },
} as const;
const OSM_AMENITY_MARKER_COLOR = "gray" as const;

export interface OsmAmenityTileRequest {
  zoom: typeof OSM_AMENITY_TILE_ZOOM;
  x: number;
  y: number;
}

export type OsmAmenityMarkerType = "wc" | "drinking_water";

export interface FindNearestOsmAmenityOptions {
  type: OsmAmenityMarkerType;
  maxDistanceMeters?: number;
  maxTiles?: number;
}

export interface NearestOsmAmenitySearchResult {
  marker: MarkerSchema | null;
  distanceMeters: number | null;
  searchedTileCount: number;
  /**
   * True when no unsearched tile inside the configured radius can contain a
   * closer matching amenity. False means the maxTiles safety limit was hit.
   */
  complete: boolean;
}

export interface OsmAmenityRecord {
  id: number;
  type: "toilets" | "drinking_water" | "fountain";
  lat: number;
  lng: number;
  name?: string;
  operator?: string;
  fee?: "yes" | "no";
  charge?: string;
  openingHours?: string;
  drinkingWater?: "yes" | "no";
}

export interface OsmAmenityTileResponse {
  tile: OsmAmenityTileRequest;
  fetchedAt: string;
  sourceUpdatedAt?: string;
  stale: boolean;
  amenities: OsmAmenityRecord[];
  attribution: {
    text: string;
    url: string;
    license: string;
  };
}

@Injectable({
  providedIn: "root",
})
export class OsmDataService {
  private readonly functions = inject(FunctionsAdapterService);
  private readonly pendingRequests = new Map<
    string,
    Promise<MarkerSchema[]>
  >();
  private readonly markerCache = new Map<string, MarkerSchema[]>();
  private readonly maxClientCacheEntries = 64;

  /**
   * Loads the normalized amenity records for a canonical server-side tile.
   * The client never contacts Overpass directly.
   */
  getAmenityMarkers(
    tile: OsmAmenityTileRequest,
  ): Promise<MarkerSchema[]> {
    const key = `${tile.zoom}/${tile.x}/${tile.y}`;
    const cached = this.markerCache.get(key);
    if (cached) {
      this.markerCache.delete(key);
      this.markerCache.set(key, cached);
      return Promise.resolve(cached);
    }

    const pending = this.pendingRequests.get(key);
    if (pending) return pending;

    const request = this.functions
      .callAppChecked<OsmAmenityTileRequest, OsmAmenityTileResponse>(
        "getOsmAmenityTile",
        tile,
      )
      .then((response) => response.amenities.map((amenity) => this.toMarker(amenity)));
    this.pendingRequests.set(key, request);
    void request.then(
      (markers) => {
        this.pendingRequests.delete(key);
        this.markerCache.set(key, markers);
        while (this.markerCache.size > this.maxClientCacheEntries) {
          const oldestKey = this.markerCache.keys().next().value;
          if (oldestKey === undefined) break;
          this.markerCache.delete(oldestKey);
        }
      },
      () => this.pendingRequests.delete(key),
    );
    return request;
  }

  /**
   * Finds the nearest matching amenity without sending the precise origin to
   * the backend. Tiles are fetched in minimum-distance order and the search
   * stops as soon as no unsearched tile can beat the current result.
   */
  async findNearestAmenity(
    origin: google.maps.LatLngLiteral,
    options: FindNearestOsmAmenityOptions,
  ): Promise<NearestOsmAmenitySearchResult> {
    const maxDistanceMeters =
      options.maxDistanceMeters ?? DEFAULT_NEAREST_AMENITY_RADIUS_METERS;
    const maxTiles = options.maxTiles ?? DEFAULT_NEAREST_AMENITY_MAX_TILES;
    validateNearestAmenitySearch(origin, maxDistanceMeters, maxTiles);

    const queue: AmenityTileCandidate[] = [];
    const queuedTiles = new Set<string>();
    const startTile = getAmenityTileForLocation(origin);
    enqueueAmenityTile(queue, queuedTiles, origin, startTile);

    let nearest: { marker: MarkerSchema; distanceMeters: number } | null = null;
    let searchedTileCount = 0;

    while (queue.length > 0) {
      queue.sort(
        (first, second) =>
          first.minimumDistanceMeters - second.minimumDistanceMeters,
      );
      const next = queue[0];
      if (
        next.minimumDistanceMeters > maxDistanceMeters ||
        (nearest &&
          next.minimumDistanceMeters >= nearest.distanceMeters)
      ) {
        return toNearestAmenitySearchResult(
          nearest,
          searchedTileCount,
          true,
        );
      }
      if (searchedTileCount >= maxTiles) {
        return toNearestAmenitySearchResult(
          nearest,
          searchedTileCount,
          false,
        );
      }

      queue.shift();
      const markers = await this.getAmenityMarkers(next.tile);
      searchedTileCount += 1;
      for (const marker of markers) {
        if (marker.type !== options.type) continue;
        const distanceMeters = getDistanceMeters(origin, marker.location);
        if (
          distanceMeters <= maxDistanceMeters &&
          (!nearest || distanceMeters < nearest.distanceMeters)
        ) {
          nearest = { marker, distanceMeters };
        }
      }

      enqueueNeighbouringAmenityTiles(
        queue,
        queuedTiles,
        origin,
        next.tile,
      );
    }

    return toNearestAmenitySearchResult(nearest, searchedTileCount, true);
  }

  private toMarker(element: OsmAmenityRecord): MarkerSchema {
    const id = `osm-node-${element.id}`;
    const location = { lat: element.lat, lng: element.lng };
    const operator = element.operator ? `by ${element.operator}` : "";

    if (element.type === "drinking_water") {
      return {
        id,
        location,
        icons: ["water_full"],
        name: element.name,
        description: operator,
        color: OSM_AMENITY_MARKER_COLOR,
        priority: OSM_AMENITY_MARKER_PRIORITY.drinkingWater,
        type: "drinking_water",
      };
    }

    if (element.type === "fountain") {
      return {
        id,
        location,
        icons:
          element.drinkingWater === "yes"
            ? ["water_full"]
            : ["water_drop"],
        name: element.name ?? $localize`Unnamed Drinking Water spot`,
        description: operator,
        color: OSM_AMENITY_MARKER_COLOR,
        priority: OSM_AMENITY_MARKER_PRIORITY.drinkingWater,
        type: "drinking_water",
      };
    }

    const isFree = element.fee === "no";
    const isPaid = element.fee === "yes";
    const detailsParts: string[] = [];
    if (isFree) {
      detailsParts.push("No fee");
    } else if (isPaid && element.charge) {
      detailsParts.push(`Fee: ${element.charge}`);
    }
    if (element.operator) {
      detailsParts.push(`by ${element.operator}`);
    }
    if (element.openingHours) {
      detailsParts.push(`Opening hours: ${element.openingHours}`);
    }

    return {
      id,
      location,
      icons: isPaid
        ? ["wc", "paid"]
        : isFree
          ? ["wc", "money_off"]
          : ["wc"],
      name: element.name ?? $localize`Unnamed Toilet`,
      description: detailsParts.join(" • "),
      color: OSM_AMENITY_MARKER_COLOR,
      priority: isFree
        ? OSM_AMENITY_MARKER_PRIORITY.toilet.free
        : isPaid
          ? OSM_AMENITY_MARKER_PRIORITY.toilet.paid
          : OSM_AMENITY_MARKER_PRIORITY.toilet.unknown,
      type: "wc",
    };
  }
}

interface AmenityTileCandidate {
  tile: OsmAmenityTileRequest;
  minimumDistanceMeters: number;
}

function getAmenityTileForLocation(
  location: google.maps.LatLngLiteral,
): OsmAmenityTileRequest {
  const tileCount = 2 ** OSM_AMENITY_TILE_ZOOM;
  const tile = MapHelpers.getTileCoordinatesForLocationAndZoom(
    {
      lat: clamp(
        location.lat,
        -WEB_MERCATOR_MAX_LATITUDE,
        WEB_MERCATOR_MAX_LATITUDE,
      ),
      lng: normalizeLongitude(location.lng),
    },
    OSM_AMENITY_TILE_ZOOM,
  );
  return {
    zoom: OSM_AMENITY_TILE_ZOOM,
    x: normalizeTileX(tile.x, tileCount),
    y: clamp(tile.y, 0, tileCount - 1),
  };
}

function enqueueNeighbouringAmenityTiles(
  queue: AmenityTileCandidate[],
  queuedTiles: Set<string>,
  origin: google.maps.LatLngLiteral,
  tile: OsmAmenityTileRequest,
): void {
  const tileCount = 2 ** OSM_AMENITY_TILE_ZOOM;
  for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
    const y = tile.y + yOffset;
    if (y < 0 || y >= tileCount) continue;

    for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
      if (xOffset === 0 && yOffset === 0) continue;
      enqueueAmenityTile(queue, queuedTiles, origin, {
        zoom: OSM_AMENITY_TILE_ZOOM,
        x: normalizeTileX(tile.x + xOffset, tileCount),
        y,
      });
    }
  }
}

function enqueueAmenityTile(
  queue: AmenityTileCandidate[],
  queuedTiles: Set<string>,
  origin: google.maps.LatLngLiteral,
  tile: OsmAmenityTileRequest,
): void {
  const key = `${tile.zoom}/${tile.x}/${tile.y}`;
  if (queuedTiles.has(key)) return;

  queuedTiles.add(key);
  queue.push({
    tile,
    minimumDistanceMeters: getMinimumDistanceToTileMeters(origin, tile),
  });
}

function getMinimumDistanceToTileMeters(
  origin: google.maps.LatLngLiteral,
  tile: OsmAmenityTileRequest,
): number {
  const bounds = MapHelpers.getBoundsForTile(tile.zoom, tile.x, tile.y);
  return getDistanceMeters(origin, {
    lat: clamp(origin.lat, bounds.south, bounds.north),
    lng: getClosestLongitudeInBounds(origin.lng, bounds.west, bounds.east),
  });
}

function getClosestLongitudeInBounds(
  longitude: number,
  west: number,
  east: number,
): number {
  const normalizedLongitude = normalizeLongitude(longitude);
  let closest = west;
  let closestDifference = Number.POSITIVE_INFINITY;

  for (const offset of [-360, 0, 360]) {
    const candidate = clamp(
      normalizedLongitude,
      west + offset,
      east + offset,
    );
    const difference = Math.abs(candidate - normalizedLongitude);
    if (difference < closestDifference) {
      closest = candidate;
      closestDifference = difference;
    }
  }
  return closest;
}

function getDistanceMeters(
  from: google.maps.LatLngLiteral,
  to: google.maps.LatLngLiteral,
): number {
  const latitudeDelta = degreesToRadians(to.lat - from.lat);
  const longitudeDelta = degreesToRadians(
    normalizeLongitude(to.lng - from.lng),
  );
  const fromLatitude = degreesToRadians(from.lat);
  const toLatitude = degreesToRadians(to.lat);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(
      Math.sqrt(Math.min(1, haversine)),
      Math.sqrt(Math.max(0, 1 - haversine)),
    )
  );
}

function toNearestAmenitySearchResult(
  nearest: { marker: MarkerSchema; distanceMeters: number } | null,
  searchedTileCount: number,
  complete: boolean,
): NearestOsmAmenitySearchResult {
  return {
    marker: nearest?.marker ?? null,
    distanceMeters: nearest?.distanceMeters ?? null,
    searchedTileCount,
    complete,
  };
}

function validateNearestAmenitySearch(
  origin: google.maps.LatLngLiteral,
  maxDistanceMeters: number,
  maxTiles: number,
): void {
  if (
    !Number.isFinite(origin.lat) ||
    !Number.isFinite(origin.lng) ||
    origin.lat < -90 ||
    origin.lat > 90
  ) {
    throw new RangeError("origin must contain valid latitude and longitude");
  }
  if (!Number.isFinite(maxDistanceMeters) || maxDistanceMeters <= 0) {
    throw new RangeError("maxDistanceMeters must be greater than zero");
  }
  if (!Number.isInteger(maxTiles) || maxTiles <= 0) {
    throw new RangeError("maxTiles must be a positive integer");
  }
}

function normalizeTileX(x: number, tileCount: number): number {
  return ((x % tileCount) + tileCount) % tileCount;
}

function normalizeLongitude(longitude: number): number {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
