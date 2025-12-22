import { Injectable } from "@angular/core";
import Supercluster from "supercluster";
import { SearchService } from "./search.service";
import { VisibleViewport } from "../components/maps/map-base";
import { MapHelpers } from "../../scripts/MapHelpers";
import { SpotClusterDotSchema } from "../../db/schemas/SpotClusterTile";

export interface ClusterPoint {
  id: string;
  lat: number;
  lng: number;
  [k: string]: any;
}

export interface ClusterResult {
  clusters: Supercluster.ClusterFeature<any>[];
  points: ClusterPoint[];
}

@Injectable({ providedIn: "root" })
export class SpotClusterService {
  // Caches
  private _tileCache = new Map<
    string,
    { timestamp: number; points: ClusterPoint[] }
  >();
  private _tileInFlight = new Map<string, Promise<ClusterPoint[]>>();

  private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute cache for tiles

  constructor(private _searchService: SearchService) {}

  /**
   * Main entry point: Get clusters for a specific viewport.
   * This method abstract away the tiling logic.
   */
  public async getClustersForViewport(
    viewport: VisibleViewport,
    zoom: number
  ): Promise<ClusterResult> {
    // 1. Calculate which tiles cover this viewport
    // We use a fixed "fetching zoom" (e.g. 12) to cache data efficiently
    // This allows panning around without re-fetching everything if we stay in same tiles
    const fetchZoom = 12;

    // Don't fetch if zoom is too low (server-side clustering should handle < 10 or so in a real app,
    // but here we just follow existing logic or return empty if very far out)
    if (zoom < 4) return { clusters: [], points: [] };

    // Identify tiles at fetchZoom that cover the viewport
    const tilesToFetch = this._getTilesCoveringViewport(viewport, fetchZoom);

    // 2. Fetch points for these tiles (parallel)
    const pointsArrays = await Promise.all(
      tilesToFetch.map((t) => this.getPointsForTile(fetchZoom, t.x, t.y))
    );

    // 3. Deduplicate points (because a spot might be on the edge or logic overlap)
    const uniquePoints = this._deduplicatePoints(pointsArrays.flat());

    // 4. Cluster using Supercluster
    return this.clusterPointsForViewport(uniquePoints, viewport, zoom);
  }

  /**
   * Fetch raw spot points for a specific tile.
   * Handles caching and in-flight request deduplication.
   */
  public async getPointsForTile(
    tileZoom: number,
    x: number,
    y: number,
    maxSpots: number = 250 // Per tile max
  ): Promise<ClusterPoint[]> {
    const key = `tile:${tileZoom}:${x}:${y}`;

    // Check cache
    const cached = this._tileCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.points;
    }

    // Check in-flight
    const existingPromise = this._tileInFlight.get(key);
    if (existingPromise) return existingPromise;

    // Fetch
    const promise = this._fetchTilePoints(tileZoom, x, y, maxSpots)
      .then((points) => {
        this._tileCache.set(key, { timestamp: Date.now(), points });
        return points;
      })
      .catch((err) => {
        console.error(`Failed to fetch tile ${key}`, err);
        return [];
      });

    this._tileInFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      this._tileInFlight.delete(key);
    }
  }

  /**
   * Cluster an array of points for a given viewport using Supercluster.
   * Made public for testing or if external manual clustering is needed.
   */
  public clusterPointsForViewport(
    points: ClusterPoint[],
    viewport: VisibleViewport,
    zoom: number
  ): ClusterResult {
    const index = new Supercluster({ radius: 60, maxZoom: 20 });

    const geojson = points.map((p) => ({
      type: "Feature" as const,
      properties: { ...p },
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
    }));

    index.load(geojson);

    // Supercluster expects bbox in [west, south, east, north]
    const bbox: [number, number, number, number] = [
      viewport.bbox.west,
      viewport.bbox.south,
      viewport.bbox.east,
      viewport.bbox.north,
    ];

    const clusters = index.getClusters(bbox, Math.floor(zoom));

    return { clusters, points };
  }

  // --- Private Helpers ---

  private async _fetchTilePoints(
    z: number,
    x: number,
    y: number,
    maxSpots: number
  ): Promise<ClusterPoint[]> {
    const bounds = MapHelpers.getBoundsForTile(z, x, y);
    const boundsNE = new google.maps.LatLng(bounds.north, bounds.east);
    const boundsSW = new google.maps.LatLng(bounds.south, bounds.west);
    const latLngBounds = new google.maps.LatLngBounds(boundsSW, boundsNE);

    const typesenseResult = await this._searchService.searchSpotsInBounds(
      latLngBounds,
      maxSpots
    );
    const hits = (typesenseResult && (typesenseResult as any).hits) || [];

    return hits
      .map((h: any) => h.document)
      .filter((doc: any) => doc && doc.location)
      .map((doc: any) => this._mapDocumentToClusterPoint(doc))
      .filter(
        (p: ClusterPoint) => Number.isFinite(p.lat) && Number.isFinite(p.lng)
      );
  }

  private _mapDocumentToClusterPoint(doc: any): ClusterPoint {
    let lat = 0;
    let lng = 0;

    if (Array.isArray(doc.location) && doc.location.length >= 2) {
      lat = Number(doc.location[0]);
      lng = Number(doc.location[1]);
    } else if (typeof doc.location === "object") {
      lat = Number(doc.location.latitude ?? doc.location.lat ?? 0);
      lng = Number(doc.location.longitude ?? doc.location.lng ?? 0);
    }

    return {
      id: String(doc.id),
      lat,
      lng,
      ...doc,
    };
  }

  private _getTilesCoveringViewport(
    viewport: VisibleViewport,
    zoom: number
  ): { x: number; y: number }[] {
    const ne = { lat: viewport.bbox.north, lng: viewport.bbox.east };
    const sw = { lat: viewport.bbox.south, lng: viewport.bbox.west };

    const neTile = MapHelpers.getTileCoordinatesForLocationAndZoom(ne, zoom);
    const swTile = MapHelpers.getTileCoordinatesForLocationAndZoom(sw, zoom);

    const tiles: { x: number; y: number }[] = [];

    // Handle wrap around if needed (simple version for now)
    const xRange = this._enumerateXRange(swTile.x, neTile.x, zoom);
    const yMin = Math.min(swTile.y, neTile.y);
    const yMax = Math.max(swTile.y, neTile.y);

    xRange.forEach((x) => {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ x, y });
      }
    });
    return tiles;
  }

  private _enumerateXRange(start: number, end: number, zoom: number): number[] {
    const tileCount = 1 << zoom;
    const normalize = (val: number) =>
      ((val % tileCount) + tileCount) % tileCount;
    const from = normalize(start);
    const to = normalize(end);

    const range: number[] = [];
    let current = from;
    let safety = 0;
    while (current !== to && safety < tileCount + 10) {
      range.push(current);
      current = (current + 1) % tileCount;
      safety++;
    }
    range.push(to);
    return range;
  }

  private _deduplicatePoints(points: ClusterPoint[]): ClusterPoint[] {
    const seen = new Set<string>();
    const unique: ClusterPoint[] = [];
    for (const p of points) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        unique.push(p);
      }
    }
    return unique;
  }
}
