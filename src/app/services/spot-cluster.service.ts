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
  private readonly MIN_FETCH_ZOOM = 2;
  private readonly MAX_FETCH_ZOOM = 14;

  // Caches
  private _tileCache = new Map<
    string,
    { timestamp: number; points: ClusterPoint[] }
  >();
  private _tileInFlight = new Map<string, Promise<ClusterPoint[]>>();

  /**
   * Cached Supercluster index - only rebuilt when the underlying points change.
   * This is the key optimization: index.load() is O(n log n), but getClusters() is fast.
   */
  private _clusterIndex: Supercluster | null = null;
  private _clusterIndexTileKey: string = "";
  private _clusterIndexPoints: ClusterPoint[] = [];

  /**
   * Guard to prevent duplicate in-flight cluster requests for the same tile set.
   */
  private _clusterInFlight: Promise<ClusterResult> | null = null;
  private _clusterInFlightTileKey: string = "";

  private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute cache for tiles

  constructor(private _searchService: SearchService) {}

  /**
   * Main entry point: Get clusters for a specific viewport.
   * This method abstracts away the tiling logic and uses cached Supercluster index.
   */
  public async getClustersForViewport(
    viewport: VisibleViewport,
    zoom: number
  ): Promise<ClusterResult> {
    // 1. Calculate which tiles cover this viewport
    // Fetch from one zoom level up to keep transitions smooth
    // (e.g. render zoom 15 reads cluster source zoom 14).
    const fetchZoom = this._getFetchZoomForViewportZoom(zoom);

    // Don't fetch if zoom is too low (server-side clustering should handle < 10 or so in a real app,
    // but here we just follow existing logic or return empty if very far out)
    // We use a safe adaptive strategy now, so we can allow it.
    // if (zoom < 4) return { clusters: [], points: [] };

    // Identify tiles at fetchZoom that cover the viewport
    const tilesToFetch = this._getTilesCoveringViewport(viewport, fetchZoom);

    // Create a stable tile key for caching - sorted to ensure consistent key regardless of tile order
    const tileKey = tilesToFetch
      .map((t) => `${fetchZoom}:${t.x}:${t.y}`)
      .sort()
      .join("|");

    // If we already have an in-flight request for the same tile set, reuse it
    if (this._clusterInFlight && this._clusterInFlightTileKey === tileKey) {
      await this._clusterInFlight;
      // Return fresh clusters for current viewport using cached index
      return this._getClusterResultForViewport(viewport, zoom);
    }

    // If the tile coverage hasn't changed, we can reuse the cached index
    // and just query it with the new viewport (getClusters is fast)
    if (this._clusterIndex && this._clusterIndexTileKey === tileKey) {
      return this._getClusterResultForViewport(viewport, zoom);
    }

    // Need to fetch points and rebuild the index
    const fetchPromise = this._fetchAndBuildIndex(
      tilesToFetch,
      fetchZoom,
      tileKey
    );
    this._clusterInFlight = fetchPromise.then(() =>
      this._getClusterResultForViewport(viewport, zoom)
    );
    this._clusterInFlightTileKey = tileKey;

    try {
      await fetchPromise;
      return this._getClusterResultForViewport(viewport, zoom);
    } catch (e) {
      console.error("[SpotClusterService] fetchAndBuildIndex failed", e);
      throw e;
    } finally {
      this._clusterInFlight = null;
      this._clusterInFlightTileKey = "";
    }
  }

  /**
   * Fetch points for tiles and build the Supercluster index.
   * This is the expensive operation that we want to minimize.
   */
  private async _fetchAndBuildIndex(
    tilesToFetch: { x: number; y: number }[],
    fetchZoom: number,
    tileKey: string
  ): Promise<void> {
    // Fetch points for these tiles (parallel)
    const pointsArrays = await Promise.all(
      tilesToFetch.map((t) => this.getPointsForTile(fetchZoom, t.x, t.y))
    );

    // Deduplicate points (because a spot might be on the edge or logic overlap)
    const uniquePoints = this._deduplicatePoints(pointsArrays.flat());

    // Build the new index
    const index = new Supercluster({ radius: 60, maxZoom: 20 });
    const geojson = uniquePoints.map((p) => ({
      type: "Feature" as const,
      properties: { ...p },
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
    }));
    index.load(geojson);

    // Cache the new index
    this._clusterIndex = index;
    this._clusterIndexTileKey = tileKey;
    this._clusterIndexPoints = uniquePoints;
  }

  /**
   * Get cluster result for a viewport using the cached index.
   * This is fast - just a spatial query on the already-built index.
   */
  private _getClusterResultForViewport(
    viewport: VisibleViewport,
    zoom: number
  ): ClusterResult {
    if (!this._clusterIndex) {
      return { clusters: [], points: [] };
    }

    const { north, south, east, west } = viewport.bbox;

    // Special case: when west === east, the viewport spans the full 360° world
    // Query the entire longitude range
    if (west === east) {
      const bbox: [number, number, number, number] = [-180, south, 180, north];
      const clusters = this._clusterIndex.getClusters(bbox, Math.floor(zoom));
      return { clusters, points: this._clusterIndexPoints };
    }

    // Check if the viewport crosses the International Date Line
    if (west > east) {
      // Split into two queries: one for the "left" side (west to 180) and one for the "right" side (-180 to east)
      const bboxLeft: [number, number, number, number] = [
        west,
        south,
        180,
        north,
      ];
      const bboxRight: [number, number, number, number] = [
        -180,
        south,
        east,
        north,
      ];

      const clustersLeft = this._clusterIndex.getClusters(
        bboxLeft,
        Math.floor(zoom)
      );
      const clustersRight = this._clusterIndex.getClusters(
        bboxRight,
        Math.floor(zoom)
      );

      return {
        clusters: [...clustersLeft, ...clustersRight],
        points: this._clusterIndexPoints,
      };
    }

    const bbox: [number, number, number, number] = [west, south, east, north];

    const clusters = this._clusterIndex.getClusters(bbox, Math.floor(zoom));
    return { clusters, points: this._clusterIndexPoints };
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

  private _getFetchZoomForViewportZoom(zoom: number): number {
    const intZoom = Math.max(0, Math.floor(zoom));
    const preferredZoom = intZoom - 1;
    return Math.max(
      this.MIN_FETCH_ZOOM,
      Math.min(this.MAX_FETCH_ZOOM, preferredZoom)
    );
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

    // Maximum valid tile index for Y at this zoom level
    const maxTileIndex = (1 << zoom) - 1;

    // Clamp Y coordinates to valid tile bounds (0 to 2^zoom - 1)
    // This is necessary because extreme latitudes (near poles) can produce
    // out-of-bounds tile coordinates
    const clampY = (y: number) => Math.max(0, Math.min(maxTileIndex, y));

    // Check if we are viewing the full world (360 degrees) or close to it
    // If so, we need to fetch all tile columns, because swTile.x and neTile.x might be identical (e.g. 0 and 0)
    // which _enumerateXRange would mistakenly interpret as a single column.
    // Handle date line crossing: when west > east, the viewport spans across the date line
    // Special case: when west === east, it means the viewport has wrapped around the entire world (360°)
    const west = viewport.bbox.west;
    const east = viewport.bbox.east;
    const isFullWorldWrap = west === east; // e.g., west=0, east=0 means full 360° view
    const lngDiff = isFullWorldWrap
      ? 360
      : west > east
      ? 360 - west + east
      : east - west;
    let xRange: number[] = [];

    // If we cover ~360 degrees, we must fetch all tiles in the row
    // Also, at low zoom levels (like 2), if swTile.x === neTile.x but we're viewing a large
    // portion of the world (e.g., > 90 degrees), we need all tiles because the coordinates wrapped
    if (
      lngDiff > 359 ||
      isFullWorldWrap ||
      (zoom <= 4 && swTile.x === neTile.x && lngDiff > 90)
    ) {
      const tileCount = 1 << zoom;
      xRange = Array.from({ length: tileCount }, (_, i) => i);
    } else {
      xRange = this._enumerateXRange(swTile.x, neTile.x, zoom);
    }

    // Clamp Y values to valid tile bounds before iterating
    const yMin = clampY(Math.min(swTile.y, neTile.y));
    const yMax = clampY(Math.max(swTile.y, neTile.y));

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
