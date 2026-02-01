import { firstValueFrom } from "rxjs";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { SpotId, SpotSchema } from "../../../db/schemas/SpotSchema";
import {
  MapTileKey,
  getClusterTileKey,
  getDataFromClusterTileKey,
  SpotClusterDotSchema,
  SpotClusterTileSchema,
} from "../../../db/schemas/SpotClusterTile";
import { TilesObject } from "../google-map-2d/google-map-2d.component";
import { VisibleViewport } from "../maps/map-base";
import { MarkerSchema } from "../marker/marker.component";
import { Injector, signal, computed, NgZone } from "@angular/core";
import { SpotTypes } from "../../../db/schemas/SpotTypeAndAccess";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { SpotClusterService } from "../../services/spot-cluster.service";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { LocaleCode } from "../../../db/models/Interfaces";
import { OsmDataService } from "../../services/osm-data.service";
import { MapHelpers } from "../../../scripts/MapHelpers";
import { createUserReference } from "../../../scripts/Helpers";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { GeoPoint } from "firebase/firestore";
import { ConsentService } from "../../services/consent.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { UserReferenceSchema } from "../../../db/schemas/UserSchema";
import { getBestLocale } from "../../../scripts/LanguageHelpers";
import { SpotFilterMode, SPOT_FILTER_CONFIGS } from "./spot-filter-config";

// Re-export SpotFilterMode for backward compatibility with existing imports
export { SpotFilterMode } from "./spot-filter-config";

import { SearchService } from "../../services/search.service";

/**
 * This interface is used to reference a spot in the loaded spots array.
 */
interface LoadedSpotReference {
  spot: Spot;
  tile: { x: number; y: number };
  indexInTileArray: number;
  indexInTotalArray: number;
}

/**
 *
 *
 */
export class SpotMapDataManager {
  private _spotsService: SpotsService;
  private _spotEditsService: SpotEditsService;
  private _osmDataService: OsmDataService;
  private _consentService: ConsentService;
  private _authService: AuthenticationService;
  private _searchService: SearchService;
  private _ngZone: NgZone;

  private _spotClusterTiles: Map<MapTileKey, SpotClusterTileSchema>;
  private _spotClusterService: SpotClusterService | null;
  // private _spotClusterKeysByZoom: Map<number, Map<string, MapTileKey>>;
  private _spots: Map<MapTileKey, Spot[]>;
  private _markers: Map<MapTileKey, MarkerSchema[]>;
  private _tilesLoading: Set<MapTileKey>;

  /**
   * Cache for SpotPreviewData objects to maintain reference stability.
   */
  private _spotPreviewCache: Map<SpotId, SpotPreviewData> = new Map();

  private _visibleSpots = signal<Spot[]>([]);
  private _visibleDots = signal<SpotClusterDotSchema[]>([]);
  private _visibleAmenityMarkers = signal<MarkerSchema[]>([]);
  private _visibleHighlightedSpots = signal<SpotPreviewData[]>([]);

  private _manualHighlightedSpots = signal<SpotPreviewData[]>([]);
  private _filteredSpotsCache: Map<SpotId, SpotPreviewData> = new Map();

  // Single-select filter mode for showing special filter pins on the map.
  public spotFilterMode = signal<SpotFilterMode>(SpotFilterMode.None);

  public visibleSpots = this._visibleSpots.asReadonly();
  public visibleDots = this._visibleDots.asReadonly();
  public visibleAmenityMarkers = this._visibleAmenityMarkers.asReadonly();
  public visibleHighlightedSpots = this._visibleHighlightedSpots.asReadonly();

  private _lastVisibleTiles = signal<TilesObject | null>(null);

  readonly spotZoom = 16;
  readonly amenityMarkerZoom = 14;
  readonly amenityMarkerDisplayZoom = 16;
  readonly clusterZooms = [2, 4, 6, 8, 10, 12];
  readonly divisor = 2;
  readonly defaultRating = 1.5;

  private _clusterDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly CLUSTER_DEBOUNCE_MS = 200;
  private readonly HIGHLIGHT_THROTTLE_MS = 500;
  private _lastHighlightFetchTime: number = 0;

  private currentSearchRequestId: ReturnType<typeof setTimeout> | undefined;

  private _lastRenderedClusterKeys: Set<string> | null = null;
  private _updateRequestId = 0;

  private _yieldToMain() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  constructor(
    readonly locale: LocaleCode,
    injector: Injector,
    readonly debugMode: boolean = false
  ) {
    this._spotsService = injector.get(SpotsService);
    this._spotEditsService = injector.get(SpotEditsService);
    this._osmDataService = injector.get(OsmDataService);
    this._consentService = injector.get(ConsentService);
    this._authService = injector.get(AuthenticationService);
    this._searchService = injector.get(SearchService);
    this._ngZone = injector.get(NgZone);

    this._spotClusterTiles = new Map<MapTileKey, SpotClusterTileSchema>();
    this._spots = new Map<MapTileKey, Spot[]>();
    this._markers = new Map<MapTileKey, MarkerSchema[]>();
    this._tilesLoading = new Set<MapTileKey>();

    try {
      this._spotClusterService = injector.get(SpotClusterService);
    } catch (e) {
      this._spotClusterService = null as any;
    }
  }

  // public functions

  /**
   * Clear the SpotPreviewData cache.
   * Useful for memory management or when you need to force refresh of all preview data.
   */
  clearPreviewCache(): void {
    this._spotPreviewCache.clear();
  }

  /**
   * Load and add a specific spot by ID to the data manager.
   * This allows newly created spots to appear on the map without a page reload.
   */
  async loadAndAddSpotById(spotId: SpotId): Promise<Spot | null> {
    try {
      const spot = await firstValueFrom(
        this._spotsService.getSpotById$(spotId, this.locale)
      );

      if (spot) {
        // Add the spot to the data manager's internal cache
        this._addLoadedSpots([spot]);
        return spot;
      }
      return null;
    } catch (error) {
      console.error(`Failed to load spot ${spotId}:`, error);
      return null;
    }
  }

  /**
   * Manually set the highlighted spots, for example from a search result.
   * These spots persist across viewport changes when a filter mode is active.
   * Uses caching to maintain stable object references and prevent flickering.
   */
  setManualHighlightedSpots(spots: SpotPreviewData[]) {
    // Merge new spots with existing cache to maintain stable references
    const mergedSpots: SpotPreviewData[] = [];
    const newSpotIds = new Set<SpotId>();

    for (const spot of spots) {
      const id = spot.id as SpotId;
      newSpotIds.add(id);

      // Check if we already have this spot in cache
      const cachedSpot = this._filteredSpotsCache.get(id);
      if (cachedSpot) {
        // Reuse cached object reference to prevent re-render
        mergedSpots.push(cachedSpot);
      } else {
        // Add new spot to cache
        this._filteredSpotsCache.set(id, spot);
        mergedSpots.push(spot);
      }
    }

    // Check if the content has actually changed before updating signals
    const currentSpots = this._visibleHighlightedSpots();
    const currentIds = new Set(currentSpots.map((s) => s.id));

    // Compare: same size and same IDs means no change
    const hasChanged =
      currentSpots.length !== mergedSpots.length ||
      mergedSpots.some((s) => !currentIds.has(s.id));

    if (hasChanged) {
      this._manualHighlightedSpots.set(mergedSpots);
      this._visibleHighlightedSpots.set(mergedSpots);
    }
  }

  /**
   * Clear the manual highlighted spots and cache (used when filter is deactivated).
   */
  clearManualHighlightedSpots() {
    this._manualHighlightedSpots.set([]);
    this._filteredSpotsCache.clear();
  }

  refresh() {
    this._lastRenderedClusterKeys = null;
    const tiles = this._lastVisibleTiles();
    if (tiles) {
      this.setVisibleTiles(tiles);
    }
  }

  // public functions

  // Throttling for setVisibleTiles to prevent UI blocking during fast zooms
  private _visibleTilesThrottleTimer: any = null;
  private readonly VISIBLE_TILES_THROTTLE_MS = 100;
  private _pendingVisibleTiles: TilesObject | null = null;
  private _lastVisibleTilesExecutionTime = 0;

  setVisibleTiles(visibleTilesObj: TilesObject) {
    this._pendingVisibleTiles = visibleTilesObj;
    const now = Date.now();

    // If enough time has passed since last execution, run immediately (throttle)
    if (
      now - this._lastVisibleTilesExecutionTime >
      this.VISIBLE_TILES_THROTTLE_MS
    ) {
      this._executeSetVisibleTiles(visibleTilesObj);
    } else {
      // Otherwise schedule/update the trailing call (debounce/throttle tail)
      if (this._visibleTilesThrottleTimer) {
        // Timer already exists, just updating _pendingVisibleTiles is enough
        return;
      }

      this._visibleTilesThrottleTimer = setTimeout(() => {
        if (this._pendingVisibleTiles) {
          this._executeSetVisibleTiles(this._pendingVisibleTiles);
        }
        this._visibleTilesThrottleTimer = null;
      }, this.VISIBLE_TILES_THROTTLE_MS);
    }
  }

  private async _executeSetVisibleTiles(visibleTilesObj: TilesObject) {
    this._lastVisibleTilesExecutionTime = Date.now();
    const startTime = this._lastVisibleTilesExecutionTime;
    const requestId = ++this._updateRequestId;
    // update the visible tiles
    this._lastVisibleTiles.set(visibleTilesObj);

    // Yield removed to prevent delay
    // await this._yieldToMain();

    const zoom = visibleTilesObj.zoom;

    // If we have the SpotClusterService available and the zoom is < 16,
    // we still want to fetch "Highlights" via Typesense to enrich the map
    // because clusters don't show enough detail.
    // However, for CLUSTERS themselves, we revert to the tile-based loading (handled below)
    // to ensure smooth transitions and caching.
    if (this._spotClusterService && zoom < 16) {
      // Fetch highlights using Typesense for better performance than client-side filtering
      // Only if "Highlights" (No Filter) is active
      const activeFilter = this.spotFilterMode
        ? this.spotFilterMode()
        : SpotFilterMode.None;

      if (activeFilter === SpotFilterMode.None) {
        const now = Date.now();
        // Throttle: Allow updates while moving (at least every X ms)
        // Throttle: Allow updates while moving (at least every X ms)
        if (now - this._lastHighlightFetchTime > this.HIGHLIGHT_THROTTLE_MS) {
          this._loadHighlightsForTiles(visibleTilesObj);
          this._lastHighlightFetchTime = now;
        }

        // Debounce: Ensure we catch the final resting state (and handle small movements)
        if (this._clusterDebounceTimer) {
          clearTimeout(this._clusterDebounceTimer);
        }

        this._clusterDebounceTimer = setTimeout(() => {
          this._clusterDebounceTimer = null;
          this._loadHighlightsForTiles(visibleTilesObj);
          this._lastHighlightFetchTime = Date.now();
        }, this.CLUSTER_DEBOUNCE_MS);
      }
    }

    if (requestId !== this._updateRequestId) {
      return;
    }

    // Load amenity markers at zoom >= 14 (amenityMarkerZoom) for efficient caching
    // But they will only be displayed at zoom >= 16 (amenityMarkerDisplayZoom)
    if (zoom >= this.amenityMarkerZoom) {
      const markerTilesToLoad: Set<MapTileKey> =
        this._getMarkerTilesToLoad(visibleTilesObj);
      this._loadMarkersForTiles(markerTilesToLoad);
    }

    // Yield removed
    // await this._yieldToMain();

    if (zoom >= this.spotZoom) {
      // show spots and markers
      this._showCachedSpotsAndMarkersForTiles(visibleTilesObj);

      // now determine the missing information and load spots for it
      const spotTilesToLoad16: Set<MapTileKey> =
        this._getSpotTilesToLoad(visibleTilesObj);

      // load spots for missing tiles
      this._loadSpotsForTiles(spotTilesToLoad16);
    } else {
      // show spot clusters
      // Also used to gate the loading logic: if the visible keys haven't changed (returns false),
      // we don't need to check for missing tiles, since the set of needed tiles hasn't changed.
      const didRender = this._showCachedSpotClustersForTiles(visibleTilesObj);

      // Ensure we always load missing cluster tiles even if we didn't re-render
      // (e.g. if we just panned a tiny bit but exposed a new tile)
      // BUT _showCachedSpotClustersForTiles returns true if there are MISSING tiles too.
      // So if it returned false, it means we have everything we need AND nothing changed??
      // Let's stick to the original logic: only load if didRender is true OR we think we might need it.
      // Actually, if we didn't render (because keys are same), we probably don't need to load either.

      if (didRender) {
        // now determine missing information and load spot clusters for that
        const spotClusterTilesToLoad: Set<MapTileKey> =
          this._getSpotClusterTilesToLoad(visibleTilesObj);

        if (spotClusterTilesToLoad.size > 0) {
          this._loadSpotClustersForTiles(spotClusterTilesToLoad);
        }
      }
    }
  }

  private _currentViewport: VisibleViewport | null = null;

  /**
   * New API: accept a viewport (bbox + zoom) and convert to TilesObject
   * for backward compatibility with the existing tile-based loading logic.
   */
  setVisibleViewport(viewport: VisibleViewport) {
    this._currentViewport = viewport; // Store exact viewport for precise filtering

    const zoom = viewport.zoom;

    const ne = { lat: viewport.bbox.north, lng: viewport.bbox.east };
    const sw = { lat: viewport.bbox.south, lng: viewport.bbox.west };

    const neTile = MapHelpers.getTileCoordinatesForLocationAndZoom(ne, zoom);
    const swTile = MapHelpers.getTileCoordinatesForLocationAndZoom(sw, zoom);

    const tilesObj: TilesObject = {
      zoom: zoom,
      tiles: [],
      ne: neTile,
      sw: swTile,
    };

    // Clamp Y coordinates to valid tile bounds (0 to 2^zoom - 1)
    // This is necessary because extreme latitudes (near poles) can produce
    // out-of-bounds tile coordinates
    const maxTileIndex = (1 << zoom) - 1;
    const clampY = (y: number) => Math.max(0, Math.min(maxTileIndex, y));

    // Detect full 360° world view: when west === east, the viewport has wrapped around
    const west = viewport.bbox.west;
    const east = viewport.bbox.east;
    const isFullWorldWrap = west === east;

    let xRange: number[];
    if (isFullWorldWrap) {
      // Fetch all horizontal tiles when viewing full 360°
      const tileCount = 1 << zoom;
      xRange = Array.from({ length: tileCount }, (_, i) => i);
    } else {
      xRange = this._enumerateXRange(swTile.x, neTile.x, zoom);
    }

    const yMin = clampY(Math.min(swTile.y, neTile.y));
    const yMax = clampY(Math.max(swTile.y, neTile.y));

    xRange.forEach((x) => {
      for (let y = yMin; y <= yMax; y++) {
        tilesObj.tiles.push({ x, y });
      }
    });

    // reuse existing tile-based handling
    this.setVisibleTiles(tilesObj);
  }

  async saveSpot(
    spot: Spot | LocalSpot,
    originalSpot?: Spot | LocalSpot
  ): Promise<SpotId> {
    // Ensure user is authenticated
    if (!this._authService.isSignedIn || !this._authService.user?.uid) {
      throw new Error("User not authenticated");
    }

    // Create user reference with properly formatted profile picture URL
    const userReference = createUserReference(this._authService.user.data!);

    if (spot instanceof Spot) {
      // Existing spot - create an UPDATE edit with only changed fields
      const spotId = spot.id as SpotId;
      const currentData = spot.data();

      // Compute diff if we have the original data
      let diffData: Partial<SpotSchema> = currentData;
      if (originalSpot && originalSpot instanceof Spot) {
        const originalData = originalSpot.data();

        diffData = this._computeDataDiff(
          originalData,
          currentData
        ) as Partial<SpotSchema>;
      }

      await this._spotEditsService.createSpotUpdateEdit(
        spotId,
        diffData,
        userReference,
        originalSpot?.data()
      );
      return spotId;
    } else {
      // New spot - use the proper flow: create spot document first (server-side ID),
      // then create a CREATE edit for it
      const spotData = spot.data();
      const spotId = await this._spotEditsService.createSpotWithEdit(
        spotData,
        userReference
      );
      return spotId;
    }
  }

  /**
   * Compute a diff between original and current data, returning only changed fields.
   * This ensures that edits only contain fields that were actually modified.
   * For nested objects, only includes properties that actually changed.
   *
   * @param originalData - The original spot data before editing
   * @param currentData - The current/new spot data after editing
   * @returns A partial object containing only the fields that changed
   */
  private _computeDataDiff(
    originalData: Partial<any>,
    currentData: Partial<any>
  ): Partial<any> {
    const diff: Partial<any> = {};

    // Iterate through current data keys
    for (const key of Object.keys(currentData)) {
      const originalValue = originalData[key];
      const currentValue = currentData[key];

      // Check if the field changed
      if (!this._deepEqual(originalValue, currentValue)) {
        // For nested objects, create a partial object with only changed properties
        if (
          typeof currentValue === "object" &&
          currentValue !== null &&
          !Array.isArray(currentValue) &&
          !(currentValue instanceof Date) &&
          currentValue._latitude === undefined && // not a GeoPoint
          currentValue.seconds === undefined // not a Timestamp
        ) {
          // This is a plain object - compute the diff for nested properties
          const nestedDiff = this._computeNestedDiff(
            originalValue || {},
            currentValue
          );
          if (Object.keys(nestedDiff).length > 0) {
            diff[key] = nestedDiff;
          }
        } else {
          // For primitives, arrays, and special types (GeoPoint, Timestamp, Date), use as-is
          diff[key] = currentValue;
        }
      }
    }

    return diff;
  }

  /**
   * Compute a diff for nested objects, returning only properties that changed.
   * Used for objects like amenities where we only want to include changed properties.
   */
  private _computeNestedDiff(originalObj: any, currentObj: any): any {
    const diff: any = {};

    // Get all unique keys from both objects
    const keysA = Object.keys(originalObj);
    const keysB = Object.keys(currentObj);
    const allKeys = new Set([...keysA, ...keysB]);

    // For each key, compare and only include if changed
    for (const key of allKeys) {
      const originalValue = originalObj[key];
      const currentValue = currentObj[key];

      if (!this._deepEqual(originalValue, currentValue)) {
        diff[key] = currentValue;
      }
    }

    return diff;
  }

  /**
   * Deep equality comparison for various data types including GeoPoint, Timestamp, etc.
   * Recursively compares nested objects and arrays up to any depth.
   * Handles sparse objects (with undefined/null properties) correctly.
   */
  private _deepEqual(a: any, b: any): boolean {
    // Handle same reference
    if (a === b) return true;

    // Handle null/undefined explicitly - treat undefined and null as equivalent for deep equality
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;

    // Handle primitive types
    if (typeof a !== "object" || typeof b !== "object") return false;

    // Handle GeoPoint (Firebase Firestore type)
    if (a._latitude !== undefined && b._latitude !== undefined) {
      return a._latitude === b._latitude && a._longitude === b._longitude;
    }

    // Handle Timestamp (Firebase Firestore type)
    if (a.seconds !== undefined && b.seconds !== undefined) {
      return a.seconds === b.seconds && a.nanoseconds === b.nanoseconds;
    }

    // Handle Date objects
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }

    // Handle arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => this._deepEqual(item, b[index]));
    }

    // Handle plain objects (including nested objects like AmenitiesMap)
    // First check if both are arrays or both are objects
    if (Array.isArray(a) !== Array.isArray(b)) return false;

    // Get all unique keys from both objects to handle sparse objects
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    const allKeys = new Set([...keysA, ...keysB]);

    // For each key that exists in either object, compare the values
    for (const key of allKeys) {
      const valueA = a[key];
      const valueB = b[key];

      // Recursively compare values (this handles nested objects)
      if (!this._deepEqual(valueA, valueB)) {
        return false;
      }
    }

    return true;
  }

  // private functions

  /**
   * Get or create a cached SpotPreviewData object for the given spot.
   *
   * This method maintains object reference stability across zoom transitions by:
   * 1. Returning existing cached objects when spot data hasn't changed
   * 2. Only creating new objects when relevant display properties change
   * 3. Automatically caching new/updated preview data
   *
   * This optimization prevents unnecessary re-renders in Angular components
   * and ensures stable track-by-id behavior in @for loops.
   *
   * @param spot - The full Spot object to create/retrieve preview data for
   * @returns Cached or newly created SpotPreviewData
   */

  private _spotMatchesFilter(spot: Spot, mode: SpotFilterMode): boolean {
    const config = SPOT_FILTER_CONFIGS.get(mode);
    return config?.matchesSpot(spot) ?? false;
  }

  /**
   * Set the spots and markers behavior subjects to the cached data we have
   * loaded.
   * @param tiles
   */
  private _showCachedSpotsAndMarkersForTiles(tiles: TilesObject) {
    // assume the zoom is larger or equal to 16
    if (tiles.zoom < this.spotZoom) {
      console.warn(
        "the zoom is less than 16, this function should not be called"
      );
      return;
    }

    // get the tiles object for the spot zoom
    const tiles16 = this._transformTilesObjectToZoom(tiles, this.spotZoom);

    // get the spots for these tiles
    const spots: Spot[] = [];
    tiles16.tiles.forEach((tile) => {
      const key = getClusterTileKey(tiles16.zoom, tile.x, tile.y);
      if (this._spots.has(key)) {
        const tileSpots = this._spots.get(key)!;
        spots.push(...tileSpots);
      }
    });

    // sort the spots
    spots.sort((a, b) => {
      // sort rating in descending order
      if (
        (b.rating ?? this.defaultRating) !== (a.rating ?? this.defaultRating)
      ) {
        return (
          (b.rating ?? this.defaultRating) - (a.rating ?? this.defaultRating)
        );
      }
      // if same rating, spots with an image go first
      if (a.hasMedia() && !b.hasMedia()) {
        return -1;
      }
      if (!a.hasMedia() && b.hasMedia()) {
        return 1;
      }
      return 0;
    });

    // Extract highlighted spots (rated or iconic) at zoom 16+
    // Build highlighted or filtered spots depending on active filter mode
    const activeFilter = this.spotFilterMode
      ? this.spotFilterMode()
      : SpotFilterMode.None;

    if (activeFilter !== SpotFilterMode.None) {
      if (this.currentSearchRequestId) {
        clearTimeout(this.currentSearchRequestId);
      }

      this.currentSearchRequestId = setTimeout(() => {
        // ... search logic ...
        // Ensure we search for "Everything" or just "Spots" based on filter
        // If Filter is None, use a default "Top Rated" search to get highlights?

        let promisedResult;
        // Use _currentViewport which is stored in the class
        const visibleViewport = this._currentViewport;
        if (!visibleViewport) {
          console.warn("No visible viewport to search within.");
          return;
        }

        const bounds = new google.maps.LatLngBounds(
          { lat: visibleViewport.bbox.south, lng: visibleViewport.bbox.west },
          { lat: visibleViewport.bbox.north, lng: visibleViewport.bbox.east }
        );

        // Pass the filter mode correctly
        promisedResult = this._searchService.searchSpotsInBoundsWithFilter(
          bounds,
          activeFilter,
          20
        );

        promisedResult
          .then((searchResult) => {
            // Use SearchService to map hits to previews
            const searchHighlights = searchResult.hits.map((hit) =>
              this._searchService.getSpotPreviewFromHit(hit)
            );
            this._visibleHighlightedSpots.set(searchHighlights);
          })
          .catch((err) => {
            console.error("Search for highlights failed:", err);
          });

        this.currentSearchRequestId = undefined;
      }, 300); // Debounce search requests
    }

    let highlightedSpots: SpotPreviewData[] = [];

    if (activeFilter === SpotFilterMode.None) {
      highlightedSpots = spots
        .filter((spot) => (spot.rating ?? 0) > 0 || spot.isIconic)
        .map((spot) => this._getOrCreateSpotPreview(spot));
    } else {
      // When a filter is active, replace highlights with the filter pins only
      highlightedSpots = spots
        .filter((spot) => this._spotMatchesFilter(spot, activeFilter))
        .map((spot) => this._getOrCreateSpotPreview(spot));
    }

    // Only show amenity markers at zoom >= 16 (amenityMarkerDisplayZoom) to maintain performance
    const markers: MarkerSchema[] = [];
    if (tiles.zoom >= this.amenityMarkerDisplayZoom) {
      tiles16.tiles.forEach((tile) => {
        const key = getClusterTileKey(tiles16.zoom, tile.x, tile.y);
        if (this._markers.has(key)) {
          const tileMarkers = this._markers.get(key)!;
          markers.push(...tileMarkers);
        }
      });
    }

    this._visibleDots.set([]);

    if (activeFilter === SpotFilterMode.None) {
      this._visibleHighlightedSpots.set(highlightedSpots);
      this._visibleSpots.set(spots);
    }

    this._visibleAmenityMarkers.set(markers);
  }

  /**
   * Helper to map a Spot object to SpotPreviewData, using cache to maintain references.
   */
  private _getOrCreateSpotPreview(spot: Spot): SpotPreviewData {
    if (this._spotPreviewCache.has(spot.id)) {
      return this._spotPreviewCache.get(spot.id)!;
    }

    const preview = spot.makePreviewData();
    this._spotPreviewCache.set(spot.id, preview);
    return preview;
  }

  private _showCachedSpotClustersForTiles(
    tiles: TilesObject,
    forceRender: boolean = false
  ): boolean {
    // assume the zoom is smaller than 16
    if (tiles.zoom > this.spotZoom) {
      console.error(
        "the zoom is larger than 16, this function should not be called"
      );
      return false;
    }

    // Get the tiles object for the cluster zoom. Choose the closest cluster zoom
    // at or below the current zoom; if none exists (zoom < min cluster zoom)
    // fall back to the minimum cluster zoom.
    const tilesZ =
      this.clusterZooms
        .filter((z) => z <= tiles.zoom)
        .sort((a, b) => b - a)[0] ?? this.clusterZooms[0];

    // For zooms below the minimum cluster zoom (e.g., 2 or 3), we must *transform*
    // the tile coordinates from the current zoom to the minimum cluster zoom so
    // x/y coordinates match the declared zoom. Previously we only replaced the
    // zoom number while leaving tile x/y untouched which produced invalid keys.
    const effectiveZoom = Math.max(tiles.zoom, this.clusterZooms[0]);
    const tilesForClusters =
      effectiveZoom === tiles.zoom
        ? tiles
        : this._transformTilesObjectToZoom(tiles, this.clusterZooms[0]);

    const tilesZObj = this._transformTilesObjectToZoom(
      tilesForClusters,
      tilesZ
    );

    // Optimize: Check if the set of tiles to render is effectively the same as last time
    // This prevents re-calculating and re-emitting signals during smooth zooming
    // when the effective cluster tiles haven't changed.
    const currentKeys = new Set<string>();
    tilesZObj.tiles.forEach((t) => {
      currentKeys.add(getClusterTileKey(tilesZObj.zoom, t.x, t.y));
    });

    if (
      !forceRender &&
      this._areKeySetsEqual(this._lastRenderedClusterKeys, currentKeys)
    ) {
      return false;
    }
    this._lastRenderedClusterKeys = currentKeys;

    // Collect spot clusters for visible tiles at cluster zoom level
    const dots: SpotClusterDotSchema[] = [];
    const spots: SpotPreviewData[] = [];
    const missingTileKeys: MapTileKey[] = [];

    const clusterLoopStart = Date.now();
    tilesZObj.tiles.forEach((tile) => {
      const key = getClusterTileKey(tilesZObj.zoom, tile.x, tile.y);
      const spotCluster = this._spotClusterTiles.get(key);
      if (spotCluster) {
        dots.push(...spotCluster.dots);
        // Use cache to reuse existing preview objects when available
        spotCluster.spots?.forEach((spotPreview) => {
          const cached = this._spotPreviewCache.get(spotPreview.id);
          if (cached) {
            spots.push(cached);
          } else {
            this._spotPreviewCache.set(spotPreview.id, spotPreview);
            spots.push(spotPreview);
          }
        });
      } else {
        missingTileKeys.push(key);
      }
    });

    // console.log(`[${Date.now()}] DataManager: cluster loop time=${Date.now() - clusterLoopStart}ms tiles=${tilesZObj.tiles.length} dots=${dots.length}`);

    // When none of the requested tiles are available yet, keep the previous state
    // But return TRUE to signal that we processed a change and the caller should check for missing loads.
    if (dots.length === 0 && missingTileKeys.length > 0) {
      return true;
    }

    // sort the spots by rating, and if they have media
    const sortStart = Date.now();
    spots.sort((a, b) => {
      // sort rating in descending order
      if (
        (b.rating ?? this.defaultRating) !== (a.rating ?? this.defaultRating)
      ) {
        return (
          (b.rating ?? this.defaultRating) - (a.rating ?? this.defaultRating)
        );
      }
      // if same rating, spots with an image go first
      if (a.imageSrc && !b.imageSrc) {
        return -1;
      }
      if (!a.imageSrc && b.imageSrc) {
        return 1;
      }
      return 0;
    });
    // console.log(`[${Date.now()}] DataManager: sort time=${Date.now() - sortStart}ms spots=${spots.length}`);

    // Don't show amenity markers in cluster view (zoom < 16) for performance
    // Amenity markers are only displayed at amenityMarkerDisplayZoom (16) and above
    this._visibleAmenityMarkers.set([]);

    const signalStart = Date.now();
    this._visibleSpots.set([]);
    this._visibleDots.set(dots);
    // console.log(`[${Date.now()}] DataManager: signal update time=${Date.now() - signalStart}ms`);
    // Disable legacy highlight setting from clusters to avoid conflict with Typesense highlights
    // Only set highlights if no filter is active (preserve filtered results)
    // if (this.spotFilterMode() === SpotFilterMode.None) {
    //   this._visibleHighlightedSpots.set(spots);
    // }

    return true;
  }

  private _areKeySetsEqual(
    setA: Set<string> | null,
    setB: Set<string>
  ): boolean {
    if (!setA) return false;
    if (setA.size !== setB.size) return false;
    for (const key of setA) {
      if (!setB.has(key)) return false;
    }
    return true;
  }

  private _loadSpotsForTiles(tilesToLoad: Set<MapTileKey>) {
    if (tilesToLoad.size === 0) return;

    // Only load spots if consent is granted
    if (!this._consentService.hasConsent()) {
      console.debug("Spot loading blocked - waiting for consent");
      return;
    }

    // add an empty array for the tiles that spots will be loaded for
    tilesToLoad.forEach((key) => this._tilesLoading.add(key));

    console.log(
      "[SpotMapDataManager] _loadSpotsForTiles loading:",
      tilesToLoad.size
    );

    // load the spots and add them
    firstValueFrom(
      this._spotsService.getSpotsForTileKeys(
        Array.from(tilesToLoad),
        this.locale
      )
    )
      .then((spots) => this._addLoadedSpots(spots))
      .catch((err) => {
        console.error("[SpotMapDataManager] Load Error:", err);
        // Clear loading state on error so we can retry
        tilesToLoad.forEach((key) => this._tilesLoading.delete(key));
      });
  }

  private _getMarkerTilesToLoad(visibleTilesObj: TilesObject): Set<MapTileKey> {
    // console.debug("Getting marker tiles to load");

    const visibleTilesObj16 = this._transformTilesObjectToZoom(
      visibleTilesObj,
      16
    );

    if (visibleTilesObj16.tiles.length === 0) return new Set();

    // make 12 tiles from the 16 tiles
    const tiles = new Set<MapTileKey>();
    visibleTilesObj16.tiles.forEach((tile16) => {
      const tile16key = getClusterTileKey(16, tile16.x, tile16.y);
      if (!this._markers.has(tile16key)) {
        tiles.add(tile16key);
      }
    });

    return tiles;
  }

  private _loadMarkersForTiles(tiles16: Set<MapTileKey>) {
    if (!tiles16 || tiles16.size === 0) return;

    // first we transform the 16 tiles to 12 tiles to load the markers
    const tiles12 = new Set<MapTileKey>();

    tiles16.forEach((tile16) => {
      const { zoom, x, y } = getDataFromClusterTileKey(tile16);
      const tile12 = getClusterTileKey(zoom - 4, x >> 4, y >> 4);
      if (!tiles12.has(tile12)) tiles12.add(tile12);
    });

    // add an empty array for the tiles that water markers will be loaded for
    tiles12.forEach((tileKey) => {
      if (!this._markers.has(tileKey)) {
        this._markers.set(tileKey, []);
        // get the bounds for the tile
        const { zoom, x, y } = getDataFromClusterTileKey(tileKey);

        const bounds = MapHelpers.getBoundsForTile(zoom, x, y);
        // load the water markers and add them
        // load the water markers and add them
        this._ngZone.runOutsideAngular(() => {
          firstValueFrom(this._osmDataService.getAmenityMarkers(bounds))
            .then((markers) => {
              this._ngZone.run(() => {
                markers.forEach((marker) => {
                  const tileCoords16 =
                    MapHelpers.getTileCoordinatesForLocationAndZoom(
                      marker.location,
                      16
                    );
                  const key = getClusterTileKey(
                    16,
                    tileCoords16.x,
                    tileCoords16.y
                  );
                  if (!this._markers.has(key)) {
                    this._markers.set(key, []);
                  }
                  this._markers.get(key)!.push(marker);
                });

                const _lastVisibleTiles = this._lastVisibleTiles();
                if (_lastVisibleTiles) {
                  this._showCachedSpotsAndMarkersForTiles(_lastVisibleTiles);
                }
              });
            })
            .catch((err) => {
              if (err.name === "TimeoutError") {
                console.warn(
                  "[SpotMapDataManager] Overpass API timed out - skipping amenities"
                );
              } else {
                console.error(err);
              }
            });
        });
      }
    });
  }

  /*
   * From the visible tiles given and the information on which tiles are cached
   * and which are already loading, this function returns the tiles that need to
   * be loaded from the visible tiles.
   * @param visibleTiles
   */
  _getSpotTilesToLoad(
    visibleTilesObj: TilesObject,
    markAsLoading: boolean = true
  ): Set<MapTileKey> {
    let zoom = visibleTilesObj.zoom;

    if (zoom > 16) {
      visibleTilesObj = this._transformTilesObjectToZoom(visibleTilesObj, 16);
    } else if (zoom < 16) {
      console.warn(
        "The zoom level is less than 16, this function should not be called"
      );
      return new Set();
    }

    const missingTiles = [...visibleTilesObj.tiles]
      .map((tile) => getClusterTileKey(visibleTilesObj.zoom, tile.x, tile.y))
      .filter((tileKey) => !this._spots.has(tileKey));

    const tilesToLoad = new Set(
      missingTiles.filter((tileKey: MapTileKey) => !this.isTileLoading(tileKey))
    );

    if (markAsLoading) {
      this.markTilesAsLoading(tilesToLoad);
    }

    return tilesToLoad;
  }

  _getSpotClusterTilesToLoad(
    visibleTilesObj: TilesObject,
    markAsLoading: boolean = true
  ): Set<MapTileKey> {
    let zoom = visibleTilesObj.zoom;

    // Transform the visible tiles to the zoom level of the spot clusters.
    // Choose the nearest cluster zoom at or below the current zoom; if the
    // current zoom is below the minimum cluster zoom, transform the tile
    // coordinates to the minimum cluster zoom so x/y match the zoom value.
    const tilesZ =
      this.clusterZooms
        .filter((z) => z <= visibleTilesObj.zoom)
        .sort((a, b) => b - a)[0] ?? this.clusterZooms[0];

    const effectiveZoom = Math.max(visibleTilesObj.zoom, this.clusterZooms[0]);
    const tilesForClusters =
      effectiveZoom === visibleTilesObj.zoom
        ? visibleTilesObj
        : this._transformTilesObjectToZoom(
            visibleTilesObj,
            this.clusterZooms[0]
          );

    const transformedTiles = this._transformTilesObjectToZoom(
      tilesForClusters,
      tilesZ
    );

    const missingTiles = [...transformedTiles.tiles]
      .map((tile) => getClusterTileKey(transformedTiles.zoom, tile.x, tile.y))
      .filter((tileKey) => !this._spotClusterTiles.has(tileKey));

    const tilesToLoad = new Set(
      missingTiles.filter((tileKey: MapTileKey) => !this.isTileLoading(tileKey))
    );

    if (markAsLoading) {
      this.markTilesAsLoading(tilesToLoad);
    }

    return tilesToLoad;
  }

  _getAllLoadedSpots(): Spot[] {
    const allSpots: Spot[] = [];
    for (const key of this._spots.keys()) {
      if (!key.includes("z16")) continue;

      const loadedSpots = this._spots.get(key);
      if (!loadedSpots) continue;

      allSpots.push(...loadedSpots);
    }

    return allSpots;
  }

  private _loadSpotClustersForTiles(tilesToLoad: Set<MapTileKey>) {
    if (tilesToLoad.size === 0) return;

    console.log(
      "[SpotMapDataManager] _loadSpotClustersForTiles loading:",
      tilesToLoad.size
    );

    // Only load spot clusters if consent is granted
    if (!this._consentService.hasConsent()) {
      console.debug("Spot cluster loading blocked - waiting for consent");
      return;
    }

    // mark the cluster tiles as loading
    this.markTilesAsLoading(tilesToLoad);

    // load the spot clusters and add them
    firstValueFrom(
      this._spotsService.getSpotClusterTiles(Array.from(tilesToLoad))
    )
      .then((spotClusters) => this._addLoadedSpotClusters(spotClusters))
      .catch((err) => {
        console.error("[SpotMapDataManager] Cluster Load Error:", err);
        tilesToLoad.forEach((key) => this._tilesLoading.delete(key));
      });
  }

  /**
   * Helper to map a Search Hit to SpotPreviewData, using cache to maintain references.
   */
  private _getOrCreateSpotPreviewFromHit(hit: any): SpotPreviewData {
    const id = hit.document?.id || hit.id;
    if (this._spotPreviewCache.has(id)) {
      return this._spotPreviewCache.get(id)!;
    }

    const preview = this._searchService.getSpotPreviewFromHit(hit);
    if (preview && preview.id) {
      this._spotPreviewCache.set(preview.id, preview);
    }
    return preview;
  }

  private _loadHighlightsForTiles(visibleTilesObj: TilesObject) {
    // Calculate bounds from tilesObj
    const neBounds = MapHelpers.getBoundsForTile(
      visibleTilesObj.zoom,
      visibleTilesObj.ne.x,
      visibleTilesObj.ne.y
    );
    // We use a strip-based approach to strict query only the visible tiles.
    // This avoids all ambiguity with global bounding boxes and wrapping.

    // Simplified Strict Viewport Query
    // We strictly query the visible viewport bounds, splitting at the IDL if necessary.
    // This avoids querying buffer tiles (off-screen) and prevents global inversions.

    const queries: Promise<{ hits: any[] }>[] = [];

    if (visibleTilesObj.viewportBounds) {
      const { north, south, east, west } = visibleTilesObj.viewportBounds;

      // If zoom is less than 10, only show/highlight spots that have images.
      // If zoom is 10 or greater, show all highlights regardless of image presence.
      const onlyWithImages = visibleTilesObj.zoom < 10;

      if (west > east) {
        // Viewport crosses IDL (e.g. West=170, East=-170)
        // Split into two clean queries: [West, 180] and [-180, East]

        // Query 1: West side (Pacific towards 180)
        const span1 = 180 - west;
        if (span1 > 179) {
          const mid1 = (west + 180) / 2;
          queries.push(
            this._searchService.searchSpotsInRawBounds(
              north,
              south,
              mid1,
              west,
              10,
              undefined,
              undefined,
              undefined,
              undefined,
              onlyWithImages
            )
          );
          queries.push(
            this._searchService.searchSpotsInRawBounds(
              north,
              south,
              180,
              mid1,
              10,
              undefined,
              undefined,
              undefined,
              undefined,
              onlyWithImages
            )
          );
        } else {
          queries.push(
            this._searchService.searchSpotsInRawBounds(
              north,
              south,
              180,
              west,
              10,
              undefined,
              undefined,
              undefined,
              undefined,
              onlyWithImages
            )
          );
        }

        // Query 2: East side (-180 towards East)
        const span2 = east - -180;
        if (span2 > 179) {
          const mid2 = (-180 + east) / 2;
          queries.push(
            this._searchService.searchSpotsInRawBounds(
              north,
              south,
              mid2,
              -180,
              10,
              undefined,
              undefined,
              undefined,
              undefined,
              onlyWithImages
            )
          );
          queries.push(
            this._searchService.searchSpotsInRawBounds(
              north,
              south,
              east,
              mid2,
              10,
              undefined,
              undefined,
              undefined,
              undefined,
              onlyWithImages
            )
          );
        } else {
          queries.push(
            this._searchService.searchSpotsInRawBounds(
              north,
              south,
              east,
              -180,
              10,
              undefined,
              undefined,
              undefined,
              undefined,
              onlyWithImages
            )
          );
        }
      } else {
        // Standard Linear Viewport
        // Check for Large Span > 179 degrees (Typesense might invert large polygons)
        const span = east - west;
        if (span > 179) {
          const mid = (west + east) / 2;

          queries.push(
            this._searchService.searchSpotsInRawBounds(
              north,
              south,
              mid,
              west,
              10,
              undefined,
              undefined,
              undefined,
              undefined,
              onlyWithImages
            )
          );
          queries.push(
            this._searchService.searchSpotsInRawBounds(
              north,
              south,
              east,
              mid,
              10,
              undefined,
              undefined,
              undefined,
              undefined,
              onlyWithImages
            )
          );
        } else {
          queries.push(
            this._searchService.searchSpotsInRawBounds(
              north,
              south,
              east,
              west,
              20,
              undefined,
              undefined,
              undefined,
              undefined,
              onlyWithImages
            )
          );
        }
      }
    } else {
      // Fallback (Should rarely happen if configured correctly)
      console.warn("[Highlights] No Viewport Bounds available.");
    }

    Promise.all(queries)
      .then((results) => {
        const allHits: any[] = [];
        results.forEach((res) => {
          if (res && res.hits) {
            allHits.push(...res.hits);
          }
        });

        // Deduplicate hits (just in case)
        const uniqueHits = new Map();
        allHits.forEach((hit) => {
          const id = hit.document?.id || hit.id;
          if (!uniqueHits.has(id)) {
            uniqueHits.set(id, hit);
          }
        });

        const previews = Array.from(uniqueHits.values()).map((hit) =>
          this._getOrCreateSpotPreviewFromHit(hit)
        );

        // Check for equality to prevent unnecessary signal updates
        const currentSpots = this._visibleHighlightedSpots();
        if (currentSpots.length === previews.length) {
          let hasChanged = false;
          // Since we recycle object references, reliable strict equality check is possible if order is preserved
          // But search results might change order slightly. Set checking ID is safer.
          const currentIds = new Set(currentSpots.map((s) => s.id));
          for (const p of previews) {
            if (!currentIds.has(p.id)) {
              hasChanged = true;
              break;
            }
          }

          if (!hasChanged) {
            // console.log(`[${Date.now()}] DataManager: highlights update skipped (identical content) count=${previews.length}`);
            return;
          }
        }

        // console.log(`[${Date.now()}] DataManager: highlights updated count=${previews.length}`);
        this._visibleHighlightedSpots.set(previews);
      })
      .catch((err) => {
        console.error("Typesense highlight search failed:", err);
        // Only clear if we actually had spots
        if (this._visibleHighlightedSpots().length > 0) {
          this._visibleHighlightedSpots.set([]);
        }
      });
  }

  isTileLoading(tileKey: MapTileKey): boolean {
    return this._tilesLoading.has(tileKey);
  }

  private _enumerateXRange(start: number, end: number, zoom: number): number[] {
    const tileCount = 1 << zoom;
    const normalize = (value: number) => {
      const mod = value % tileCount;
      return mod < 0 ? mod + tileCount : mod;
    };

    const from = normalize(start);
    const to = normalize(end);
    const range: number[] = [from];

    let current = from;
    const safetyLimit = tileCount + 1;
    while (current !== to && range.length <= safetyLimit) {
      current = (current + 1) % tileCount;
      range.push(current);
    }

    return range;
  }

  /**
   * Transform a TilesObject from its current zoom to a target zoom by either
   * grouping (when zooming out) or expanding (when zooming in) tiles.
   */
  private _transformTilesObjectToZoom(
    tilesObj: TilesObject,
    targetZoom: number
  ): TilesObject {
    if (!tilesObj) return tilesObj;
    const shift = targetZoom - tilesObj.zoom;
    if (shift === 0) return tilesObj;

    const normalizeX = (x: number, zoom: number) => {
      const tileCount = 1 << zoom;
      const mod = x % tileCount;
      return mod < 0 ? mod + tileCount : mod;
    };

    const clampY = (y: number, zoom: number) => {
      const max = (1 << zoom) - 1;
      if (y < 0) return 0;
      if (y > max) return max;
      return y;
    };

    const tilesMap = new Map<string, { x: number; y: number }>();

    const addTile = (x: number, y: number) => {
      const nx = normalizeX(x, targetZoom);
      const ny = clampY(y, targetZoom);
      const k = `${nx},${ny}`;
      if (!tilesMap.has(k)) tilesMap.set(k, { x: nx, y: ny });
    };

    let tileSw = tilesObj.sw;
    let tileNe = tilesObj.ne;

    if (shift < 0) {
      // Zooming OUT: group child tiles into parent tiles
      const factor = 1 << -shift;
      tilesObj.tiles.forEach((tile) => {
        addTile(Math.floor(tile.x / factor), Math.floor(tile.y / factor));
      });

      tileSw = {
        x: Math.floor(tileSw.x / (1 << -shift)),
        y: Math.floor(tileSw.y / (1 << -shift)),
      };
      tileNe = {
        x: Math.floor(tileNe.x / (1 << -shift)),
        y: Math.floor(tileNe.y / (1 << -shift)),
      };
    } else {
      // Zooming IN: expand each tile into `factor`^2 child tiles
      const factor = 1 << shift;
      const tileCountTarget = 1 << targetZoom;
      tilesObj.tiles.forEach((tile) => {
        const baseX = (tile.x << shift) % tileCountTarget;
        const baseY = tile.y << shift;
        for (let dx = 0; dx < factor; dx++) {
          for (let dy = 0; dy < factor; dy++) {
            addTile(baseX + dx, baseY + dy);
          }
        }
      });

      tileSw = {
        x: (tileSw.x << shift) % tileCountTarget,
        y: tileSw.y << shift,
      };
      tileNe = {
        x: ((tileNe.x << shift) + (factor - 1)) % tileCountTarget,
        y: (tileNe.y << shift) + (factor - 1),
      };
    }

    const tiles = Array.from(tilesMap.values());
    tiles.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

    const newTilesObj: TilesObject = {
      zoom: targetZoom,
      sw: {
        x: normalizeX(tileSw.x, targetZoom),
        y: clampY(tileSw.y, targetZoom),
      },
      ne: {
        x: normalizeX(tileNe.x, targetZoom),
        y: clampY(tileNe.y, targetZoom),
      },
      tiles,
    };

    return newTilesObj;
  }

  markTilesAsLoading(tileKeys: MapTileKey[] | Set<MapTileKey>) {
    tileKeys.forEach((tileKey) => {
      this._tilesLoading.add(tileKey);
    });
  }

  /**
   * Add loaded Spot objects into the internal cache keyed by their z16 tile.
   */
  private _addLoadedSpots(spots: Spot[]) {
    if (!spots || spots.length === 0) {
      return;
    }

    spots.forEach((spot: Spot) => {
      let spotTile = spot.tileCoordinates?.z16;

      if (!spotTile) {
        // If tile coordinates are missing (e.g. new spot), compute them client-side
        const calculatedTileCoords = MapHelpers.getTileCoordinates(
          spot.location()
        );

        if (calculatedTileCoords) {
          spot.tileCoordinates = calculatedTileCoords;
          spotTile = calculatedTileCoords.z16;
        }
      }

      if (!spotTile) return;

      const key: MapTileKey = getClusterTileKey(16, spotTile.x, spotTile.y);
      if (!this._spots.has(key)) {
        this._spots.set(key, []);
      }

      const spotsInTile = this._spots.get(key)!;
      const existingSpotIndex = spotsInTile.findIndex((s) => s.id === spot.id);
      if (existingSpotIndex !== -1) {
        // Update existing spot
        spotsInTile[existingSpotIndex].applyFromSchema(spot.data());
      } else {
        // Add new spot
        spotsInTile.push(spot);
      }
    });

    const _lastVisibleTiles = this._lastVisibleTiles();
    if (_lastVisibleTiles) {
      this._showCachedSpotsAndMarkersForTiles(_lastVisibleTiles);
    }
  }

  /////////////////////

  getReferenceToLoadedSpotById(spotId: string): LoadedSpotReference | null {
    const allSpots = this._getAllLoadedSpots();

    // find the spot with no id
    const spot: Spot | undefined = allSpots.find((spot) => {
      return spot.id === spotId;
    });

    if (spot) {
      const tile = spot?.tileCoordinates?.z16!;

      const indexInTileArray = this._spots
        .get(getClusterTileKey(16, tile.x, tile.y))
        ?.indexOf(spot)!;

      const loadedSpotRef: LoadedSpotReference = {
        spot: spot,
        tile: tile,
        indexInTileArray: indexInTileArray,
        indexInTotalArray: spot ? allSpots.indexOf(spot) : -1,
      };

      return loadedSpotRef;
    } else {
      return null;
    }
  }

  private _addLoadedSpotClusters(spotClusters: SpotClusterTileSchema[]) {
    if (!spotClusters || spotClusters.length === 0) {
      return;
    }

    spotClusters.forEach((spotCluster) => {
      const key: MapTileKey = getClusterTileKey(
        spotCluster.zoom,
        spotCluster.x,
        spotCluster.y
      );
      this._spotClusterTiles.set(key, spotCluster);
    });

    const _lastVisibleTiles = this._lastVisibleTiles();
    if (_lastVisibleTiles) {
      this._showCachedSpotClustersForTiles(_lastVisibleTiles, true);
    }
  }

  /**
   * Add a newly created spot (before first save) to the loaded spots for nice display. It can be identified by having its ID set to empty string
   * @param newSpot The newly created spot class.
   */
  addOrUpdateNewSpotToLoadedSpotsAndUpdate(newSpot: Spot) {
    // First, try to find the spot by ID if it has one
    const ref = this.getReferenceToLoadedSpotById(newSpot.id);

    if (ref?.spot && ref.indexInTileArray >= 0 && ref.tile) {
      // The spot exists and should be updated
      // Update the spot
      this._spots.get(getClusterTileKey(16, ref.tile.x, ref.tile.y))![
        ref.indexInTileArray
      ] = newSpot;
    } else {
      // The spot doesn't exist by ID, check if there's a LocalSpot at the same location that needs to be replaced
      const tile = MapHelpers.getTileCoordinatesForLocationAndZoom(
        newSpot.location(),
        16
      );
      const tileKey = getClusterTileKey(16, tile.x, tile.y);
      let spots = this._spots.get(tileKey);

      if (spots && spots.length > 0) {
        // Check if there's an existing spot at the same location (for LocalSpot -> Spot conversion)
        // Use a more precise comparison to find spots at the exact same location
        const newSpotLocation = newSpot.location();
        const existingSpotIndex = spots.findIndex((spot) => {
          const spotLocation = spot.location();
          // Use a smaller threshold for more precise matching (about 1cm accuracy)
          const latDiff = Math.abs(spotLocation.lat - newSpotLocation.lat);
          const lngDiff = Math.abs(spotLocation.lng - newSpotLocation.lng);
          return latDiff < 0.0000001 && lngDiff < 0.0000001;
        });

        if (existingSpotIndex >= 0) {
          // Replace the existing spot (likely a LocalSpot that just got saved)
          console.debug(
            "Replacing existing spot at same location",
            spots[existingSpotIndex],
            "with",
            newSpot
          );
          spots[existingSpotIndex] = newSpot;
        } else {
          // Check if this spot ID already exists anywhere (to prevent duplicates after location changes)
          const allLoadedSpots = this._getAllLoadedSpots();
          const duplicateSpot = allLoadedSpots.find(
            (spot) => spot.id === newSpot.id
          );

          if (duplicateSpot) {
            console.debug(
              "Spot with this ID already exists, not adding duplicate",
              newSpot.id
            );
            // Update the existing spot instead
            const duplicateRef = this.getReferenceToLoadedSpotById(newSpot.id);
            if (
              duplicateRef &&
              duplicateRef.indexInTileArray >= 0 &&
              duplicateRef.tile
            ) {
              this._spots.get(
                getClusterTileKey(16, duplicateRef.tile.x, duplicateRef.tile.y)
              )![duplicateRef.indexInTileArray] = newSpot;
            }
          } else {
            // Add as a new spot
            spots.push(newSpot);
            console.debug("Added new spot to loaded spots", newSpot);
          }
        }
      } else {
        // There are no spots loaded for this 16 tile, add it to the loaded spots
        spots = [newSpot];
        this._spots.set(tileKey, spots);
        console.debug("Added new spot to empty tile", newSpot);
      }
    }

    // update the map to show the new spot on the loaded spots array.
    const lastVisibleTiles = this._lastVisibleTiles();
    if (lastVisibleTiles && lastVisibleTiles?.zoom >= this.spotZoom) {
      this._showCachedSpotsAndMarkersForTiles(lastVisibleTiles);
    }
  }

  /**
   * Remove any LocalSpots from loaded spots that might have been added before saving.
   * This helps prevent duplicates when a LocalSpot gets converted to a Spot.
   * @param location The location to check for LocalSpots
   */
  private _removeLocalSpotsAtLocation(location: google.maps.LatLngLiteral) {
    const tile = MapHelpers.getTileCoordinatesForLocationAndZoom(location, 16);
    const tileKey = getClusterTileKey(16, tile.x, tile.y);
    const spots = this._spots.get(tileKey);

    if (spots && spots.length > 0) {
      const initialLength = spots.length;
      // Remove any spots that are LocalSpots (don't have proper IDs) at the same location
      const filteredSpots = spots.filter((spot) => {
        const spotLocation = spot.location();
        const latDiff = Math.abs(spotLocation.lat - location.lat);
        const lngDiff = Math.abs(spotLocation.lng - location.lng);
        const isSameLocation = latDiff < 0.0000001 && lngDiff < 0.0000001;

        // Keep spots that are not at the same location, or that have proper IDs
        return !isSameLocation || (spot.id && spot.id.length > 0);
      });

      if (filteredSpots.length !== initialLength) {
        console.debug(
          `Removed ${
            initialLength - filteredSpots.length
          } LocalSpots at location`,
          location
        );
        this._spots.set(tileKey, filteredSpots);
      }
    }
  }

  /**
   * This function is used if the new spot was saved and now has an id. It replaces the first spot it finds with no ID with the newSaveSpot
   * @param newSavedSpot The new spot that replaces the unsaved new spot
   */
  // updateNewSpotIdOnLoadedSpotsAndUpdate(newSavedSpot: Spot) {
  //   if (newSavedSpot.id) {
  //     // TODO
  //   } else {
  //     console.error(
  //       "The newly saved spot doesn't have an ID attached to it. Something is wrong"
  //     );
  //   }
  // }
}
