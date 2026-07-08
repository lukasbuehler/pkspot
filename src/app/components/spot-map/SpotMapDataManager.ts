import { firstValueFrom } from "rxjs";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { SpotId, SpotSchema } from "../../../db/schemas/SpotSchema";
import {
  MapTileKey,
  getClusterTileKey,
  getDataFromClusterTileKey,
} from "../../../db/schemas/SpotClusterTile";
import { TilesObject } from "../google-map-2d/google-map-2d.component";
import { VisibleViewport } from "../maps/map-base";
import { MarkerSchema } from "../map/markers/map-marker.model";
import { Injector, signal, computed, NgZone } from "@angular/core";
import { SpotTypes } from "../../../db/schemas/SpotTypeAndAccess";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { LocaleCode, MediaType } from "../../../db/models/Interfaces";
import { OsmDataService } from "../../services/osm-data.service";
import { MapHelpers } from "../../../scripts/MapHelpers";
import { createUserReference } from "../../../scripts/Helpers";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { UserReferenceSchema } from "../../../db/schemas/UserSchema";
import { getBestLocale } from "../../../scripts/LanguageHelpers";
import { SpotFilterMode } from "./spot-filter-config";
import { getSpotMarkerPriority } from "../map/markers/spot-marker-priority";

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

interface SpotSearchHit {
  id?: string;
  document?: {
    id?: string;
  };
}

interface SpotPreviewSearchOptions {
  limit: number;
  onlyWithImages: boolean;
  viewportZoom: number;
}

/**
 *
 *
 */
export class SpotMapDataManager {
  private _spotsService: SpotsService;
  private _spotEditsService: SpotEditsService;
  private _usersService: UsersService;
  private _osmDataService: OsmDataService;
  private _authService: AuthenticationService;
  private _searchService: SearchService;
  private _ngZone: NgZone;

  private _spots: Map<MapTileKey, Spot[]>;
  private _markers: Map<MapTileKey, MarkerSchema[]>;

  /**
   * Cache for SpotPreviewData objects to maintain reference stability.
   */
  private _spotPreviewCache: Map<SpotId, SpotPreviewData> = new Map();
  private _spotPreviewLocalOverrideExpiresAt: Map<SpotId, number> = new Map();

  private _visibleSpots = signal<Spot[]>([]);
  private _visibleAmenityMarkers = signal<MarkerSchema[]>([]);
  private _visibleHighlightedSpots = signal<SpotPreviewData[]>([]);

  private _manualHighlightedSpots = signal<SpotPreviewData[]>([]);
  private _filteredSpotsCache: Map<SpotId, SpotPreviewData> = new Map();

  // Single-select filter mode for showing special filter pins on the map.
  public spotFilterMode = signal<SpotFilterMode>(SpotFilterMode.None);

  public visibleSpots = this._visibleSpots.asReadonly();
  public visibleAmenityMarkers = this._visibleAmenityMarkers.asReadonly();
  public visibleHighlightedSpots = this._visibleHighlightedSpots.asReadonly();

  private _lastVisibleTiles = signal<TilesObject | null>(null);

  readonly spotZoom = 16;
  readonly amenityMarkerZoom = 14;
  readonly amenityMarkerDisplayZoom = 16;
  readonly defaultRating = 1.5;

  private _clusterDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly CLUSTER_DEBOUNCE_MS = 200;
  private readonly HIGHLIGHT_THROTTLE_MS = 500;
  /**
   * Load a broad candidate pool and let Advanced Marker collision handling
   * decide what is visible. Higher-rated markers already get higher z-indexes,
   * so overlapping lower-rated candidates naturally drop out on the map.
   */
  private readonly HIGHLIGHT_MAX_COUNT = 24;
  private readonly SPOT_PREVIEW_MAX_COUNT = 250;
  private readonly SPOT_PREVIEW_LOCAL_OVERRIDE_TTL_MS = 120_000;
  private _lastHighlightFetchTime: number = 0;
  private _spotPreviewRequestId = 0;

  private _updateRequestId = 0;

  private _hasUserProvidedImage(spot: Spot): boolean {
    return spot
      .userMedia()
      .some((media) => media.type === MediaType.Image && !media.isReported);
  }

  private _sortByRatingThenImage(a: Spot, b: Spot): number {
    const ratingDifference =
      (b.rating ?? this.defaultRating) - (a.rating ?? this.defaultRating);
    if (ratingDifference !== 0) {
      return ratingDifference;
    }

    const aHasImage = this._hasUserProvidedImage(a);
    const bHasImage = this._hasUserProvidedImage(b);
    if (aHasImage === bHasImage) {
      return 0;
    }
    return aHasImage ? -1 : 1;
  }

  private _sortPreviewsByRatingThenImage(
    a: SpotPreviewData,
    b: SpotPreviewData
  ): number {
    const priorityDifference =
      getSpotMarkerPriority({
        rating: b.rating,
        access: b.access,
        isIconic: b.isIconic,
        isReported: b.isReported,
      }) -
      getSpotMarkerPriority({
        rating: a.rating,
        access: a.access,
        isIconic: a.isIconic,
        isReported: a.isReported,
      });

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const aHasImage = !!a.imageSrc;
    const bHasImage = !!b.imageSrc;
    if (aHasImage === bHasImage) {
      return 0;
    }
    return aHasImage ? -1 : 1;
  }

  private _getSpotPreviewSearchOptions(zoom: number): SpotPreviewSearchOptions {
    if (zoom < 10) {
      return {
        limit: this.HIGHLIGHT_MAX_COUNT,
        onlyWithImages: true,
        viewportZoom: zoom,
      };
    }

    if (zoom < 12) {
      return { limit: 48, onlyWithImages: false, viewportZoom: zoom };
    }

    if (zoom < 14) {
      return { limit: 96, onlyWithImages: false, viewportZoom: zoom };
    }

    return {
      limit: this.SPOT_PREVIEW_MAX_COUNT,
      onlyWithImages: false,
      viewportZoom: zoom,
    };
  }

  constructor(
    readonly locale: LocaleCode,
    injector: Injector,
    readonly debugMode: boolean = false
  ) {
    this._spotsService = injector.get(SpotsService);
    this._spotEditsService = injector.get(SpotEditsService);
    this._usersService = injector.get(UsersService);
    this._osmDataService = injector.get(OsmDataService);
    this._authService = injector.get(AuthenticationService);
    this._searchService = injector.get(SearchService);
    this._ngZone = injector.get(NgZone);

    this._spots = new Map<MapTileKey, Spot[]>();
    this._markers = new Map<MapTileKey, MarkerSchema[]>();
  }

  // public functions

  /**
   * Clear the SpotPreviewData cache.
   * Useful for memory management or when you need to force refresh of all preview data.
   */
  clearPreviewCache(): void {
    this._spotPreviewCache.clear();
  }

  updatePreviewFromSpot(spot: Spot): void {
    this._addOrUpdatePreviewFromSpot(spot);
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
   * Seed a full spot document into the close-zoom cache.
   * This keeps directly selected spots renderable even when older documents are
   * missing persisted tile coordinates; _addLoadedSpots computes them locally.
   */
  addLoadedSpot(spot: Spot): void {
    this._addLoadedSpots([spot]);
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
    this._visibleHighlightedSpots.set([]);
    this._filteredSpotsCache.clear();
  }

  refresh() {
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

    const zoom = visibleTilesObj.zoom;

    const activeFilter = this.spotFilterMode
      ? this.spotFilterMode()
      : SpotFilterMode.None;

    if (activeFilter === SpotFilterMode.None) {
      const now = Date.now();
      // Throttle: Allow updates while moving (at least every X ms)
      if (now - this._lastHighlightFetchTime > this.HIGHLIGHT_THROTTLE_MS) {
        this._loadHighlightsForTiles(
          visibleTilesObj,
          this._getSpotPreviewSearchOptions(zoom)
        );
        this._lastHighlightFetchTime = now;
      }

      // Debounce: Ensure we catch the final resting state (and handle small movements)
      if (this._clusterDebounceTimer) {
        clearTimeout(this._clusterDebounceTimer);
      }

      this._clusterDebounceTimer = setTimeout(() => {
        this._clusterDebounceTimer = null;
        this._loadHighlightsForTiles(
          visibleTilesObj,
          this._getSpotPreviewSearchOptions(zoom)
        );
        this._lastHighlightFetchTime = Date.now();
      }, this.CLUSTER_DEBOUNCE_MS);
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

    this._showCachedLoadedSpotsAndMarkersForTiles(visibleTilesObj);
  }

  /**
   * New API: accept a viewport (bbox + zoom) and convert to TilesObject
   * for backward compatibility with the existing tile-based loading logic.
   */
  setVisibleViewport(viewport: VisibleViewport) {
    const zoom = Math.max(0, Math.floor(viewport.zoom));

    const ne = { lat: viewport.bbox.north, lng: viewport.bbox.east };
    const sw = { lat: viewport.bbox.south, lng: viewport.bbox.west };

    const neTile = MapHelpers.getTileCoordinatesForLocationAndZoom(ne, zoom);
    const swTile = MapHelpers.getTileCoordinatesForLocationAndZoom(sw, zoom);

    const tilesObj: TilesObject = {
      zoom: zoom,
      tiles: [],
      ne: neTile,
      sw: swTile,
      center: {
        lat: (viewport.bbox.north + viewport.bbox.south) / 2,
        lng: (viewport.bbox.east + viewport.bbox.west) / 2,
      },
      viewportBounds: {
        north: viewport.bbox.north,
        south: viewport.bbox.south,
        east: viewport.bbox.east,
        west: viewport.bbox.west,
      },
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
    const authUid = this._authService.user?.uid;
    if (!this._authService.isSignedIn || !authUid) {
      throw new Error("User not authenticated");
    }

    const userReference = await this._createAuthenticatedUserReference(authUid);

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

      if (Object.keys(diffData).length === 0) {
        return spotId;
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

  private async _createAuthenticatedUserReference(
    uid: string
  ): Promise<UserReferenceSchema> {
    const profileUser = this._authService.user.data;

    if (profileUser) {
      const userReference = createUserReference(profileUser);
      if (userReference.uid !== uid) {
        console.warn("Authenticated user uid differs from profile uid", {
          authUid: uid,
          profileUid: userReference.uid,
        });
      }

      return {
        ...userReference,
        uid,
      };
    }

    try {
      const loadedProfile = await this._usersService.getUserByIdOnce(uid);
      if (loadedProfile) {
        return createUserReference(loadedProfile);
      }
    } catch (error) {
      console.warn("Could not load profile for spot edit user reference", error);
    }

    return { uid };
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

  private _getCachedSpotsForTiles(tiles: TilesObject): Spot[] {
    if (tiles.zoom < this.spotZoom) {
      return [];
    }

    const tiles16 = this._transformTilesObjectToZoom(tiles, this.spotZoom);
    const spots: Spot[] = [];

    tiles16.tiles.forEach((tile) => {
      const key = getClusterTileKey(tiles16.zoom, tile.x, tile.y);
      const tileSpots = this._spots.get(key);
      if (tileSpots) {
        spots.push(...tileSpots);
      }
    });

    return spots.sort((a, b) => this._sortByRatingThenImage(a, b));
  }

  private _getCachedAmenityMarkersForTiles(tiles: TilesObject): MarkerSchema[] {
    if (tiles.zoom < this.amenityMarkerDisplayZoom) {
      return [];
    }

    const tiles16 = this._transformTilesObjectToZoom(tiles, this.spotZoom);
    const markers: MarkerSchema[] = [];

    tiles16.tiles.forEach((tile) => {
      const key = getClusterTileKey(tiles16.zoom, tile.x, tile.y);
      const tileMarkers = this._markers.get(key);
      if (tileMarkers) {
        markers.push(...tileMarkers);
      }
    });

    return markers;
  }

  /**
   * Refresh loaded full-spot documents and amenity markers from local cache.
   * Viewport spot pins/list data is now supplied by Typesense previews; this
   * cache remains for selected spots, locally-created spots, and edit flows.
   */
  private _showCachedLoadedSpotsAndMarkersForTiles(tiles: TilesObject): void {
    this._visibleSpots.set(this._getCachedSpotsForTiles(tiles));
    this._visibleAmenityMarkers.set(this._getCachedAmenityMarkersForTiles(tiles));
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
                  this._showCachedLoadedSpotsAndMarkersForTiles(
                    _lastVisibleTiles
                  );
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

  findLoadedSpotWithinMeters(
    location: google.maps.LatLngLiteral,
    radiusMeters: number
  ): { spot: Spot; distanceMeters: number } | null {
    let nearest: { spot: Spot; distanceMeters: number } | null = null;

    for (const spot of this._getAllLoadedSpots()) {
      const distanceMeters = this._getDistanceMeters(location, spot.location());
      if (
        distanceMeters <= radiusMeters &&
        (!nearest || distanceMeters < nearest.distanceMeters)
      ) {
        nearest = { spot, distanceMeters };
      }
    }

    return nearest;
  }

  private _getDistanceMeters(
    from: google.maps.LatLngLiteral,
    to: google.maps.LatLngLiteral
  ): number {
    const earthRadiusMeters = 6371000;
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const dLat = toRadians(to.lat - from.lat);
    const dLng = toRadians(to.lng - from.lng);
    const fromLat = toRadians(from.lat);
    const toLat = toRadians(to.lat);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(fromLat) *
        Math.cos(toLat) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Helper to map a Search Hit to SpotPreviewData, using cache to maintain references.
   */
  private _getOrCreateSpotPreviewFromHit(hit: SpotSearchHit): SpotPreviewData {
    const preview = this._searchService.getSpotPreviewFromHit(hit);

    if (preview && preview.id) {
      const cachedPreview = this._spotPreviewCache.get(preview.id);
      if (
        cachedPreview &&
        this._getSpotPreviewRenderSignature(cachedPreview) ===
          this._getSpotPreviewRenderSignature(preview)
      ) {
        this._spotPreviewLocalOverrideExpiresAt.delete(preview.id);
        return cachedPreview;
      }

      const localOverrideExpiresAt =
        this._spotPreviewLocalOverrideExpiresAt.get(preview.id) ?? 0;
      if (cachedPreview && localOverrideExpiresAt > Date.now()) {
        return cachedPreview;
      }

      this._spotPreviewCache.set(preview.id, preview);
    }

    return preview;
  }

  private _getSpotPreviewRenderSignature(spot: SpotPreviewData): string {
    return JSON.stringify({
      id: spot.id,
      location: this._pointSignature(spot.location),
      locationRaw: this._pointSignature(spot.location_raw),
      bounds: spot.bounds?.map((point) => this._pointSignature(point)) ?? null,
      boundsRaw:
        spot.bounds_raw?.map((point) => this._pointSignature(point)) ?? null,
      boundsCenter: this._pointSignature(spot.bounds_center),
      boundsRadiusM: spot.bounds_radius_m ?? null,
      rating: spot.rating ?? null,
      access: spot.access ?? null,
      type: spot.type ?? null,
      imageSrc: spot.imageSrc ?? null,
      isIconic: spot.isIconic,
      isReported: spot.isReported ?? false,
    });
  }

  private _pointSignature(
    point:
      | google.maps.LatLngLiteral
      | { latitude: number; longitude: number }
      | null
      | undefined
  ): string | null {
    if (!point) {
      return null;
    }

    if ("lat" in point && "lng" in point) {
      return `${point.lat}:${point.lng}`;
    }

    return `${point.latitude}:${point.longitude}`;
  }

  private _loadHighlightsForTiles(
    visibleTilesObj: TilesObject,
    options: SpotPreviewSearchOptions
  ) {
    const requestId = ++this._spotPreviewRequestId;
    // We use a strip-based approach to strict query only the visible tiles.
    // This avoids all ambiguity with global bounding boxes and wrapping.

    // Simplified Strict Viewport Query
    // We strictly query the visible viewport bounds, splitting at the IDL if necessary.
    // This avoids querying buffer tiles (off-screen) and prevents global inversions.

    const queries: Promise<{ hits: SpotSearchHit[] }>[] = [];

    if (visibleTilesObj.viewportBounds) {
      const { north, south, east, west } = visibleTilesObj.viewportBounds;

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
              options.limit,
              undefined,
              undefined,
              undefined,
              undefined,
              options.onlyWithImages,
              options.viewportZoom
            )
          );
          queries.push(
            this._searchService.searchSpotsInRawBounds(
              north,
              south,
              180,
              mid1,
              options.limit,
              undefined,
              undefined,
              undefined,
              undefined,
              options.onlyWithImages,
              options.viewportZoom
            )
          );
        } else {
          queries.push(
            this._searchService.searchSpotsInRawBounds(
              north,
              south,
              180,
              west,
              options.limit,
              undefined,
              undefined,
              undefined,
              undefined,
              options.onlyWithImages,
              options.viewportZoom
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
              options.limit,
              undefined,
              undefined,
              undefined,
              undefined,
              options.onlyWithImages,
              options.viewportZoom
            )
          );
          queries.push(
            this._searchService.searchSpotsInRawBounds(
              north,
              south,
              east,
              mid2,
              options.limit,
              undefined,
              undefined,
              undefined,
              undefined,
              options.onlyWithImages,
              options.viewportZoom
            )
          );
        } else {
          queries.push(
            this._searchService.searchSpotsInRawBounds(
              north,
              south,
              east,
              -180,
              options.limit,
              undefined,
              undefined,
              undefined,
              undefined,
              options.onlyWithImages,
              options.viewportZoom
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
              options.limit,
              undefined,
              undefined,
              undefined,
              undefined,
              options.onlyWithImages,
              options.viewportZoom
            )
          );
          queries.push(
            this._searchService.searchSpotsInRawBounds(
              north,
              south,
              east,
              mid,
              options.limit,
              undefined,
              undefined,
              undefined,
              undefined,
              options.onlyWithImages,
              options.viewportZoom
            )
          );
        } else {
          queries.push(
            this._searchService.searchSpotsInRawBounds(
              north,
              south,
              east,
              west,
              options.limit,
              undefined,
              undefined,
              undefined,
              undefined,
              options.onlyWithImages,
              options.viewportZoom
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
        if (requestId !== this._spotPreviewRequestId) {
          return;
        }

        const allHits: SpotSearchHit[] = [];
        results.forEach((res) => {
          if (res && res.hits) {
            allHits.push(...res.hits);
          }
        });

        // Deduplicate hits (just in case)
        const uniqueHits = new Map<string, SpotSearchHit>();
        allHits.forEach((hit) => {
          const id = hit.document?.id || hit.id;
          if (!id) {
            return;
          }
          if (!uniqueHits.has(id)) {
            uniqueHits.set(id, hit);
          }
        });

        const previews = Array.from(uniqueHits.values())
          .map((hit) => this._getOrCreateSpotPreviewFromHit(hit))
          .sort((a, b) => this._sortPreviewsByRatingThenImage(a, b))
          .slice(0, options.limit);

        if (this._hasSameHighlightedPreviewRenderData(previews)) {
          return;
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

  private _hasSameHighlightedPreviewRenderData(
    previews: SpotPreviewData[]
  ): boolean {
    const currentSpots = this._visibleHighlightedSpots();
    if (currentSpots.length !== previews.length) {
      return false;
    }

    const currentById = new Map(currentSpots.map((spot) => [spot.id, spot]));
    return previews.every((preview) => {
      const current = currentById.get(preview.id);
      return (
        current !== undefined &&
        this._getSpotPreviewRenderSignature(current) ===
          this._getSpotPreviewRenderSignature(preview)
      );
    });
  }

  private _addOrUpdatePreviewFromSpot(spot: Spot): void {
    if (!spot.id) {
      return;
    }

    const preview = spot.makePreviewData();
    this._spotPreviewCache.set(preview.id, preview);
    this._spotPreviewLocalOverrideExpiresAt.set(
      preview.id,
      Date.now() + this.SPOT_PREVIEW_LOCAL_OVERRIDE_TTL_MS
    );

    const currentSpots = this._visibleHighlightedSpots();
    const currentIndex = currentSpots.findIndex(
      (currentSpot) => currentSpot.id === preview.id
    );
    if (currentIndex < 0) {
      return;
    }

    const updatedSpots = [...currentSpots];
    updatedSpots[currentIndex] = preview;
    this._visibleHighlightedSpots.set(updatedSpots);
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

  /**
   * Add loaded Spot objects into the internal cache keyed by their z16 tile.
   */
  private _addLoadedSpots(spots: Spot[]) {
    if (!spots || spots.length === 0) {
      const _lastVisibleTiles = this._lastVisibleTiles();
      if (_lastVisibleTiles) {
        this._showCachedLoadedSpotsAndMarkersForTiles(_lastVisibleTiles);
      }
      return;
    }

    spots.forEach((spot: Spot) => {
      const calculatedTileCoords = MapHelpers.getTileCoordinates(
        spot.location()
      );
      if (calculatedTileCoords) {
        spot.tileCoordinates = calculatedTileCoords;
      }
      const spotTile = calculatedTileCoords?.z16 ?? spot.tileCoordinates?.z16;

      if (!spotTile) return;

      const key: MapTileKey = getClusterTileKey(16, spotTile.x, spotTile.y);
      this._removeLoadedSpotFromOtherTiles(spot.id, key);
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

      this._addOrUpdatePreviewFromSpot(spot);
    });

    const _lastVisibleTiles = this._lastVisibleTiles();
    if (_lastVisibleTiles) {
      this._showCachedLoadedSpotsAndMarkersForTiles(_lastVisibleTiles);
    }
  }

  private _removeLoadedSpotFromOtherTiles(
    spotId: string,
    targetTileKey: MapTileKey
  ): void {
    for (const [tileKey, spots] of this._spots.entries()) {
      if (tileKey === targetTileKey) {
        continue;
      }

      const filteredSpots = spots.filter((spot) => spot.id !== spotId);
      if (filteredSpots.length !== spots.length) {
        this._spots.set(tileKey, filteredSpots);
      }
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


  /**
   * Add a newly created spot (before first save) to the loaded spots for nice display. It can be identified by having its ID set to empty string
   * @param newSpot The newly created spot class.
   */
  addOrUpdateNewSpotToLoadedSpotsAndUpdate(newSpot: Spot) {
    // First, try to find the spot by ID if it has one
    const ref = this.getReferenceToLoadedSpotById(newSpot.id);
    const tile = MapHelpers.getTileCoordinatesForLocationAndZoom(
      newSpot.location(),
      16
    );
    const tileKey = getClusterTileKey(16, tile.x, tile.y);
    this._removeLoadedSpotFromOtherTiles(newSpot.id, tileKey);

    if (
      ref?.spot &&
      ref.indexInTileArray >= 0 &&
      ref.tile &&
      getClusterTileKey(16, ref.tile.x, ref.tile.y) === tileKey
    ) {
      // The spot exists and should be updated
      // Update the spot
      this._spots.get(tileKey)![ref.indexInTileArray] = newSpot;
    } else {
      // The spot doesn't exist by ID, check if there's a LocalSpot at the same location that needs to be replaced
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

    this._addOrUpdatePreviewFromSpot(newSpot);

    // update the map to show the new spot on the loaded spots array.
    const lastVisibleTiles = this._lastVisibleTiles();
    if (lastVisibleTiles && lastVisibleTiles?.zoom >= this.spotZoom) {
      this._showCachedLoadedSpotsAndMarkersForTiles(lastVisibleTiles);
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
