import { Injectable } from "@angular/core";
import Supercluster from "supercluster";
import { SearchService } from "./search.service";
import { VisibleViewport } from "../components/maps/map-base";
import { MapHelpers } from "../../scripts/MapHelpers";

export interface ClusterPoint {
  id: string;
  lat: number;
  lng: number;
  [k: string]: any;
}

@Injectable({ providedIn: "root" })
export class SpotClusterService {
  private _supercluster: Supercluster | null = null;
  private _cache = new Map<
    string,
    { timestamp: number; clusters: any[]; points: ClusterPoint[] }
  >();
  private _inFlight = new Map<
    string,
    Promise<{ clusters: any[]; points: ClusterPoint[] }>
  >();
  // Per-tile cache and in-flight maps to avoid re-querying Typesense for overlapping viewports
  private _tileCache = new Map<
    string,
    { timestamp: number; points: ClusterPoint[] }
  >();
  private _tileInFlight = new Map<string, Promise<ClusterPoint[]>>();
  private readonly CACHE_TTL_MS = 30 * 1000; // 30s cache

  constructor(private _searchService: SearchService) {}

  private _buildGeoJSONPoints(points: ClusterPoint[]) {
    return points.map((p) => ({
      type: "Feature",
      properties: { ...p },
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    }));
  }

  /**
   * Fetch raw spot points for a specific tile (by tile zoom/x/y) and cache results.
   * This reduces the number of Typesense queries when panning/zooming within the
   * same base tiles — higher-zoom tiles inside the same tile will reuse the cached points.
   */
  public async getPointsForTile(
    tileZoom: number,
    x: number,
    y: number,
    maxSpots: number = 250
  ): Promise<ClusterPoint[]> {
    const key = `tile:${tileZoom}:${x}:${y}`;

    const cached = this._tileCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.points;
    }

    const existing = this._tileInFlight.get(key);
    if (existing) return existing;

    const promise = (async () => {
      // Compute bbox for the tile
      const bounds = MapHelpers.getBoundsForTile(tileZoom, x, y);

      const boundsNE = new google.maps.LatLng(bounds.north, bounds.east);
      const boundsSW = new google.maps.LatLng(bounds.south, bounds.west);
      const latLngBounds = new google.maps.LatLngBounds(boundsSW, boundsNE);

      const typesenseResult = await this._searchService.searchSpotsInBounds(
        latLngBounds,
        maxSpots
      );
      const hits = (typesenseResult && (typesenseResult as any).hits) || [];

      const points: ClusterPoint[] = hits
        .map((h: any) => h.document)
        .filter((doc: any) => doc && doc.location)
        .map((doc: any) => {
          let lat = 0;
          let lng = 0;
          if (Array.isArray(doc.location) && doc.location.length >= 2) {
            lat = Number(doc.location[0]);
            lng = Number(doc.location[1]);
          } else if (typeof doc.location === "object") {
            lat = Number(
              (doc.location as any).latitude ?? (doc.location as any).lat ?? 0
            );
            lng = Number(
              (doc.location as any).longitude ?? (doc.location as any).lng ?? 0
            );
          }

          return {
            id: String(doc.id),
            lat,
            lng,
            ...doc,
          } as ClusterPoint;
        })
        .filter(
          (p: ClusterPoint) => Number.isFinite(p.lat) && Number.isFinite(p.lng)
        );

      this._tileCache.set(key, { timestamp: Date.now(), points });
      return points;
    })();

    this._tileInFlight.set(key, promise);
    try {
      const res = await promise;
      return res;
    } finally {
      this._tileInFlight.delete(key);
    }
  }

  /**
   * Cluster an array of points for a given viewport using Supercluster.
   */
  public clusterPointsForViewport(
    points: ClusterPoint[],
    viewport: VisibleViewport
  ): { clusters: any[]; points: ClusterPoint[] } {
    const geojson = this._buildGeoJSONPoints(points);
    const index = new Supercluster({ radius: 60, maxZoom: 20 });
    index.load(geojson as any);

    const bbox = [
      viewport.bbox.west,
      viewport.bbox.south,
      viewport.bbox.east,
      viewport.bbox.north,
    ] as [number, number, number, number];
    const clusters = index.getClusters(
      bbox,
      Math.max(0, Math.floor(viewport.zoom))
    );
    return { clusters, points };
  }

  /**
   * Query Typesense for spots inside viewport bounds and return clusters
   * using Supercluster. Returns an object with `clusters` and `points`.
   */
  public async getClustersForViewport(
    viewport: VisibleViewport,
    maxSpots: number = 2000
  ): Promise<{ clusters: any[]; points: ClusterPoint[] }> {
    // Build a stable cache key by quantizing center and span
    const centerLat = (viewport.bbox.north + viewport.bbox.south) / 2;
    const centerLng = (viewport.bbox.east + viewport.bbox.west) / 2;
    const spanLat = Math.abs(viewport.bbox.north - viewport.bbox.south);
    const spanLng = Math.abs(viewport.bbox.east - viewport.bbox.west);

    const q = (v: number, decimals = 3) =>
      Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals);
    const key = `${Math.floor(viewport.zoom)}|${q(centerLat)}|${q(
      centerLng
    )}|${q(spanLat)}|${q(spanLng)}`;

    // Return cached result if still fresh
    const cached = this._cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return { clusters: cached.clusters, points: cached.points };
    }

    // Return existing in-flight promise if present
    const existing = this._inFlight.get(key);
    if (existing) return existing;

    // Construct google.maps.LatLngBounds-like object for SearchService
    const boundsNE = new google.maps.LatLng(
      viewport.bbox.north,
      viewport.bbox.east
    );
    const boundsSW = new google.maps.LatLng(
      viewport.bbox.south,
      viewport.bbox.west
    );
    const bounds = new google.maps.LatLngBounds(boundsSW, boundsNE);

    const promise = (async () => {
      const typesenseResult = await this._searchService.searchSpotsInBounds(
        bounds,
        maxSpots
      );

      // Typesense returns hits in `hits` array; each hit has `document` with fields.
      const hits = (typesenseResult && (typesenseResult as any).hits) || [];

      const points: ClusterPoint[] = hits
        .map((h: any) => h.document)
        .filter((doc: any) => doc && doc.location)
        .map((doc: any) => {
          // Typesense `geopoint` is typically returned as an object with lat/lng or array
          let lat = 0;
          let lng = 0;
          if (Array.isArray(doc.location) && doc.location.length >= 2) {
            lat = Number(doc.location[0]);
            lng = Number(doc.location[1]);
          } else if (typeof doc.location === "object") {
            lat = Number(
              (doc.location as any).latitude ?? (doc.location as any).lat ?? 0
            );
            lng = Number(
              (doc.location as any).longitude ?? (doc.location as any).lng ?? 0
            );
          }

          return {
            id: String(doc.id),
            lat,
            lng,
            ...doc,
          } as ClusterPoint;
        })
        .filter(
          (p: ClusterPoint) => Number.isFinite(p.lat) && Number.isFinite(p.lng)
        );

      // Build geojson features and create a supercluster index
      const geojson = this._buildGeoJSONPoints(points);

      // Recreate supercluster per request (safe for small result sets)
      const index = new Supercluster({ radius: 60, maxZoom: 20 });
      index.load(geojson as any);

      // Supercluster expects bbox in [west, south, east, north]
      const bbox = [
        viewport.bbox.west,
        viewport.bbox.south,
        viewport.bbox.east,
        viewport.bbox.north,
      ] as [number, number, number, number];

      // Use viewport.zoom for clustering level
      const clusters = index.getClusters(
        bbox,
        Math.max(0, Math.floor(viewport.zoom))
      );

      // cache result
      this._cache.set(key, { timestamp: Date.now(), clusters, points });

      return { clusters, points };
    })();

    this._inFlight.set(key, promise);
    try {
      const res = await promise;
      return res;
    } finally {
      this._inFlight.delete(key);
    }
  }
}
