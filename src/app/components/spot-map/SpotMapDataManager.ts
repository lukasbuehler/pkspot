import { BehaviorSubject, firstValueFrom } from "rxjs";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { SpotId } from "../../../db/schemas/SpotSchema";
import {
  MapTileKey,
  getClusterTileKey,
  getDataFromClusterTileKey,
  SpotClusterDotSchema,
  SpotClusterTileSchema,
} from "../../../db/schemas/SpotClusterTile";
import { TilesObject } from "../map/map.component";
import { MarkerSchema } from "../marker/marker.component";
import { Injector, signal } from "@angular/core";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { LocaleCode } from "../../../db/models/Interfaces";
import { OsmDataService } from "../../services/osm-data.service";
import { MapHelpers } from "../../../scripts/MapHelpers";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { ConsentService } from "../../services/consent.service";

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
  private _osmDataService: OsmDataService;
  private _consentService: ConsentService;

  private _spotClusterTiles: Map<MapTileKey, SpotClusterTileSchema>;
  // private _spotClusterKeysByZoom: Map<number, Map<string, MapTileKey>>;
  private _spots: Map<MapTileKey, Spot[]>;
  private _markers: Map<MapTileKey, MarkerSchema[]>;
  private _tilesLoading: Set<MapTileKey>;

  /**
   * Cache for SpotPreviewData objects to maintain reference stability.
   *
   * This prevents unnecessary object recreation when transitioning between zoom levels,
   * which improves performance and ensures Angular's change detection works efficiently
   * with track-by-id in @for loops.
   */
  private _spotPreviewCache: Map<SpotId, SpotPreviewData> = new Map();

  private _visibleSpotsBehaviorSubject = new BehaviorSubject<Spot[]>([]);
  private _visibleDotsBehaviorSubject = new BehaviorSubject<
    SpotClusterDotSchema[]
  >([]);
  private _visibleMarkersBehaviorSubject = new BehaviorSubject<MarkerSchema[]>(
    []
  );
  private _visibleHighlightedSpotsBehaviorSubject = new BehaviorSubject<
    SpotPreviewData[]
  >([]);

  public visibleSpots$ = this._visibleSpotsBehaviorSubject.asObservable();
  public visibleDots$ = this._visibleDotsBehaviorSubject.asObservable();
  public visibleAmenityMarkers$ =
    this._visibleMarkersBehaviorSubject.asObservable();
  public visibleHighlightedSpots$ =
    this._visibleHighlightedSpotsBehaviorSubject.asObservable();

  private _lastVisibleTiles = signal<TilesObject | null>(null);

  readonly spotZoom = 16;
  readonly amenityMarkerZoom = 14; // Load amenity markers at zoom 14 for efficient caching
  readonly amenityMarkerDisplayZoom = 16; // Display amenity markers at zoom 16+
  readonly clusterZooms = [4, 8, 12];
  readonly divisor = 4;
  readonly defaultRating = 1.5;

  constructor(
    readonly locale: LocaleCode,
    injector: Injector,
    readonly debugMode: boolean = false
  ) {
    // Resolve dependencies via the provided Injector to avoid using inject() outside DI context
    this._spotsService = injector.get(SpotsService);
    this._osmDataService = injector.get(OsmDataService);
    this._consentService = injector.get(ConsentService);
    this._spotClusterTiles = new Map<MapTileKey, SpotClusterTileSchema>();
    // this._spotClusterKeysByZoom = new Map<number, Map<string, MapTileKey>>();
    this._spots = new Map<MapTileKey, Spot[]>();
    this._markers = new Map<MapTileKey, MarkerSchema[]>();
    this._tilesLoading = new Set<MapTileKey>();

    // TODO is this needed?
    // Listen for consent changes and reload data when granted
    // this._consentService.consentGranted$.subscribe((hasConsent) => {
    //   if (hasConsent && this._lastVisibleTiles()) {
    //     console.debug('Consent granted - reloading map data');
    //     this.setVisibleTiles(this._lastVisibleTiles()!);
    //   }
    // });
  }

  // public functions

  /**
   * Clear the SpotPreviewData cache.
   * Useful for memory management or when you need to force refresh of all preview data.
   */
  clearPreviewCache(): void {
    this._spotPreviewCache.clear();
  }

  // public functions

  setVisibleTiles(visibleTilesObj: TilesObject) {
    // update the visible tiles
    this._lastVisibleTiles.set(visibleTilesObj);

    const zoom = visibleTilesObj.zoom;

    // Load amenity markers at zoom >= 14 (amenityMarkerZoom) for efficient caching
    // But they will only be displayed at zoom >= 16 (amenityMarkerDisplayZoom)
    if (zoom >= this.amenityMarkerZoom) {
      const markerTilesToLoad: Set<MapTileKey> =
        this._getMarkerTilesToLoad(visibleTilesObj);
      this._loadMarkersForTiles(markerTilesToLoad);
    }

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
      this._showCachedSpotClustersForTiles(visibleTilesObj);

      // now determine missing information and load spot clusters for that
      const spotClusterTilesToLoad: Set<MapTileKey> =
        this._getSpotClusterTilesToLoad(visibleTilesObj);

      this._loadSpotClustersForTiles(spotClusterTilesToLoad);
    }
  }

  saveSpot(spot: Spot | LocalSpot): Promise<void> {
    if (!spot) return Promise.reject("No spot provided");

    console.debug("Saving spot", spot);

    // If this is a LocalSpot being saved, remove any existing LocalSpots at the same location
    // to prevent duplicates when it gets converted to a Spot
    if (!(spot instanceof Spot)) {
      this._removeLocalSpotsAtLocation(spot.location());
    }

    let saveSpotPromise: Promise<void | SpotId>;

    if (spot instanceof Spot) {
      // Invalidate cache entry for this spot since data is changing
      this._spotPreviewCache.delete(spot.id);

      saveSpotPromise = this._spotsService.updateSpot(
        spot.id,
        spot.data(),
        this.locale
      );
    } else {
      // this is a new (client / local) spot
      saveSpotPromise = this._spotsService
        .createSpot(spot.data())
        .then((id: SpotId) => {
          // replace the LocalSpot with a Spot
          spot = new Spot(id, spot.data(), this.locale);
          return;
        });
    }

    return saveSpotPromise.then(() => {
      this.addOrUpdateNewSpotToLoadedSpotsAndUpdate(spot as Spot);
      return Promise.resolve();
    });
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
  private _getOrCreateSpotPreview(spot: Spot): SpotPreviewData {
    const existingPreview = this._spotPreviewCache.get(spot.id);

    // Create preview data structure
    const previewData: SpotPreviewData = {
      name: spot.name(),
      id: spot.id,
      slug: spot.slug ?? undefined,
      location: spot.data().location,
      type: spot.type(),
      access: spot.access(),
      locality: spot.localityString(),
      imageSrc: spot.previewImageSrc(),
      isIconic: spot.isIconic,
      rating: spot.rating ?? undefined,
      amenities: spot.amenities(),
    };

    // If we have an existing cached version, check if it needs updating
    if (existingPreview) {
      // Check if any relevant properties have changed
      const hasChanged =
        existingPreview.name !== previewData.name ||
        existingPreview.rating !== previewData.rating ||
        existingPreview.imageSrc !== previewData.imageSrc ||
        existingPreview.locality !== previewData.locality ||
        JSON.stringify(existingPreview.amenities) !==
          JSON.stringify(previewData.amenities);

      if (!hasChanged) {
        return existingPreview; // Return cached version
      }
    }

    // Cache and return the new preview data
    this._spotPreviewCache.set(spot.id, previewData);
    return previewData;
  }

  /**
   * Set the spots and markers behavior subjects to the cached data we have
   * loaded.
   * @param tiles
   */
  private _showCachedSpotsAndMarkersForTiles(tiles: TilesObject) {
    // assume the zoom is larger or equal to 16
    if (tiles.zoom < this.spotZoom) {
      console.error(
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
    // Use cache to maintain object reference stability for Angular's change detection
    const highlightedSpots: SpotPreviewData[] = spots
      .filter((spot) => (spot.rating ?? 0) > 0 || spot.isIconic)
      .map((spot) => this._getOrCreateSpotPreview(spot));

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

    this._visibleDotsBehaviorSubject.next([]);
    this._visibleHighlightedSpotsBehaviorSubject.next(highlightedSpots);
    this._visibleSpotsBehaviorSubject.next(spots);
    this._visibleMarkersBehaviorSubject.next(markers);
  }

  private _showCachedSpotClustersForTiles(tiles: TilesObject) {
    // assume the zoom is smaller than 16
    if (tiles.zoom > this.spotZoom) {
      console.error(
        "the zoom is larger than 16, this function should not be called"
      );
      return;
    }

    // Get the tiles object for the cluster zoom
    // If zoom is below the minimum cluster zoom (4), clamp it to the minimum
    const tilesZ =
      this.clusterZooms
        .filter((zoom) => zoom <= tiles.zoom)
        .sort((a, b) => b - a)[0] ?? this.clusterZooms[0];

    // For zooms below the minimum cluster zoom (e.g., 2 or 3), we still want to use
    // the minimum cluster zoom data (4) but keep the actual zoom for viewport calculations
    const effectiveZoom = Math.max(tiles.zoom, this.clusterZooms[0]);
    const tilesForClusters =
      effectiveZoom === tiles.zoom
        ? tiles
        : { ...tiles, zoom: this.clusterZooms[0] };

    const tilesZObj = this._transformTilesObjectToZoom(
      tilesForClusters,
      tilesZ
    );

    // Collect spot clusters for visible tiles at cluster zoom level
    const dots: SpotClusterDotSchema[] = [];
    const spots: SpotPreviewData[] = [];
    const missingTileKeys: MapTileKey[] = [];
    tilesZObj.tiles.forEach((tile) => {
      const key = getClusterTileKey(tilesZObj.zoom, tile.x, tile.y);
      const spotCluster = this._spotClusterTiles.get(key);
      if (spotCluster) {
        dots.push(...spotCluster.dots);
        // Use cache to reuse existing preview objects when available
        spotCluster.spots.forEach((spotPreview) => {
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

    // When none of the requested tiles are available yet, keep the previous state
    if (dots.length === 0 && missingTileKeys.length > 0) {
      return;
    }

    // sort the spots by rating, and if they have media
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

    // Don't show amenity markers in cluster view (zoom < 16) for performance
    // Amenity markers are only displayed at amenityMarkerDisplayZoom (16) and above
    this._visibleMarkersBehaviorSubject.next([]);

    this._visibleSpotsBehaviorSubject.next([]);
    this._visibleDotsBehaviorSubject.next(dots);
    this._visibleHighlightedSpotsBehaviorSubject.next(spots);
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

    // load the spots and add them
    firstValueFrom(
      this._spotsService.getSpotsForTileKeys(
        Array.from(tilesToLoad),
        this.locale
      )
    )
      .then((spots) => this._addLoadedSpots(spots))
      .catch((err) => console.error(err));
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
        firstValueFrom(this._osmDataService.getDrinkingWaterAndToilets(bounds))
          .then((data) => {
            const markers: {
              marker: MarkerSchema;
              tile: { x: number; y: number };
            }[] = data.elements
              .map((element) => {
                if (element.tags.amenity === "drinking_water") {
                  const marker: MarkerSchema = {
                    location: {
                      lat: element.lat,
                      lng: element.lon,
                    },
                    icons: ["water_full"], // local_drink, water_drop
                    name:
                      element.tags.name +
                      (element.tags.operator
                        ? ` (${element.tags.operator})`
                        : ""),
                    color: "secondary",
                  };
                  const tileCoords16 =
                    MapHelpers.getTileCoordinatesForLocationAndZoom(
                      marker.location,
                      16
                    );
                  return { marker: marker, tile: tileCoords16 };
                } else if (element.tags.amenity === "fountain") {
                  if (element.tags.drinking_water === "no") {
                    return;
                  }
                  const marker: MarkerSchema = {
                    location: {
                      lat: element.lat,
                      lng: element.lon,
                    },
                    icons:
                      element.tags.drinking_water === "yes"
                        ? ["water_full"]
                        : ["water_drop"],
                    name:
                      element.tags.name +
                      (element.tags.operator
                        ? ` (${element.tags.operator})`
                        : ""),
                    color: "secondary",
                  };
                  const tileCoords16 =
                    MapHelpers.getTileCoordinatesForLocationAndZoom(
                      marker.location,
                      16
                    );
                  return { marker: marker, tile: tileCoords16 };
                } else if (element.tags.amenity === "toilets") {
                  const isFree = element.tags.fee === "no";
                  const isPaid = element.tags.fee === "yes";

                  const marker: MarkerSchema = {
                    location: {
                      lat: element.lat,
                      lng: element.lon,
                    },
                    icons: isPaid
                      ? ["wc", "paid"]
                      : isFree
                      ? ["wc", "money_off"]
                      : ["wc"],
                    name:
                      element.tags.name +
                      (element.tags.fee ? ` Fee: ${element.tags.charge}` : "") +
                      (element.tags.operator
                        ? ` (${element.tags.operator})`
                        : "") +
                      (element.tags.opening_hours
                        ? `Opening hours: ${element.tags.opening_hours}`
                        : ""),
                    color: "tertiary",
                    priority: isFree ? 350 : isPaid ? 250 : 300, // Free toilets > unknown > paid
                  };
                  const tileCoords16 =
                    MapHelpers.getTileCoordinatesForLocationAndZoom(
                      marker.location,
                      16
                    );
                  return { marker: marker, tile: tileCoords16 };
                }
              })
              .filter((marker) => marker !== undefined);

            markers.forEach((markerObj) => {
              const key = getClusterTileKey(
                16,
                markerObj.tile.x,
                markerObj.tile.y
              );
              if (!this._markers.has(key)) {
                this._markers.set(key, []);
              }
              this._markers.get(key)!.push(markerObj.marker);
            });

            const _lastVisibleTiles = this._lastVisibleTiles();
            if (_lastVisibleTiles) {
              this._showCachedSpotsAndMarkersForTiles(_lastVisibleTiles);
            }
          })
          .catch((err) => console.error(err));
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
      .filter((tileKey) => !this._spotClusterTiles.has(tileKey));

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

    // Transform the visible tiles to the zoom level of the spot clusters
    // Get the tiles object for the cluster zoom
    const tilesZ =
      this.clusterZooms
        .filter((zoom) => zoom <= visibleTilesObj.zoom)
        .sort((a, b) => b - a)[0] ?? this.clusterZooms[0];

    // For zooms below the minimum cluster zoom (e.g., 2 or 3), clamp to minimum
    const effectiveZoom = Math.max(visibleTilesObj.zoom, this.clusterZooms[0]);
    const tilesForClusters =
      effectiveZoom === visibleTilesObj.zoom
        ? visibleTilesObj
        : { ...visibleTilesObj, zoom: this.clusterZooms[0] };

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
      .catch((err) => console.error(err));
  }

  private _addLoadedSpots(spots: Spot[]) {
    if (!spots || spots.length === 0) {
      return;
    }

    spots.forEach((spot: Spot) => {
      if (!spot.tileCoordinates) return;

      const spotTile = spot.tileCoordinates.z16;
      const key: MapTileKey = getClusterTileKey(16, spotTile.x, spotTile.y);
      if (!this._spots.has(key)) {
        this._spots.set(key, []);
      }
      this._spots.get(key)!.push(spot);
    });

    const _lastVisibleTiles = this._lastVisibleTiles();
    if (_lastVisibleTiles) {
      this._showCachedSpotsAndMarkersForTiles(_lastVisibleTiles);
    }
  }

  private _addLoadedMarkers(markers: MarkerSchema[]) {}

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
      this._showCachedSpotClustersForTiles(_lastVisibleTiles);
    }

    //   const { zoom, x, y } = data;
    //   if (zoom % this.divisor !== 0) {
    //     console.warn(
    //       `Zoom level is not divisible by ${this.divisor}, skipping insertion.`
    //     );
    //     return;
    //   }

    //   // 2. make the cluster key
    //   const tileKey = getClusterTileKey(zoom, x, y);

    //   // 3. insert into all clusters
    //   // make an additional check if we are re-inserting a cluster
    //   if (this.debugMode && this._spotClusters.has(tileKey)) {
    //     console.warn(`Cluster already exists for ${tileKey}`);
    //     return;
    //   }
    //   this._spotClusters.set(tileKey, data);

    //   // 4. insert the tile key into the clusters by zoom map with the zoom level
    //   if (!this._spotClusterKeysByZoom.has(zoom)) {
    //     this._spotClusterKeysByZoom.set(zoom, new Map());
    //   }
    //   this._spotClusterKeysByZoom.get(zoom).set(`${x},${y}`, tileKey);
  }

  ////////// helpers

  private _transformTilesObjectToZoom(
    tilesObj: TilesObject,
    targetZoom: number
  ): TilesObject {
    let shift = targetZoom - tilesObj.zoom;

    if (shift === 0) {
      return tilesObj;
    }

    const tileCountTarget = 1 << targetZoom;
    const normalizeX = (value: number) => {
      const mod = value % tileCountTarget;
      return mod < 0 ? mod + tileCountTarget : mod;
    };
    const clampY = (value: number) => {
      if (value < 0) return 0;
      const max = tileCountTarget - 1;
      return value > max ? max : value;
    };

    const tilesMap = new Map<string, { x: number; y: number }>();
    const addTile = (x: number, y: number) => {
      const normalizedX = normalizeX(x);
      const clampedY = clampY(y);
      const key = `${normalizedX},${clampedY}`;
      if (!tilesMap.has(key)) {
        tilesMap.set(key, { x: normalizedX, y: clampedY });
      }
    };

    let tileSw = tilesObj.sw;
    let tileNe = tilesObj.ne;

    if (shift < 0) {
      // Zooming OUT (from higher zoom to lower zoom)
      const factor = 1 << -shift;

      tilesObj.tiles.forEach((tile) => {
        addTile(Math.floor(tile.x / factor), Math.floor(tile.y / factor));
      });

      tileSw = {
        x: Math.floor(tileSw.x / factor),
        y: Math.floor(tileSw.y / factor),
      };
      tileNe = {
        x: Math.floor(tileNe.x / factor),
        y: Math.floor(tileNe.y / factor),
      };

      const xRange = this._enumerateXRange(tileSw.x, tileNe.x, targetZoom);
      const yMin = Math.min(tileSw.y, tileNe.y);
      const yMax = Math.max(tileSw.y, tileNe.y);
      xRange.forEach((x: number) => {
        for (let y = yMin; y <= yMax; y++) {
          addTile(x, y);
        }
      });
    } else {
      // Zooming IN (from lower zoom to higher zoom)
      const factor = 1 << shift;

      tilesObj.tiles.forEach((tile) => {
        const baseX = (tile.x << shift) % tileCountTarget;
        const baseY = tile.y << shift;
        for (let dx = 0; dx < factor; dx++) {
          const childX = (baseX + dx) % tileCountTarget;
          for (let dy = 0; dy < factor; dy++) {
            addTile(childX, baseY + dy);
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
        x: normalizeX(tileSw.x),
        y: clampY(tileSw.y),
      },
      ne: {
        x: normalizeX(tileNe.x),
        y: clampY(tileNe.y),
      },
      tiles,
    };

    return newTilesObj;
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

  markTilesAsLoading(tileKeys: MapTileKey[] | Set<MapTileKey>) {
    tileKeys.forEach((tileKey) => {
      this._tilesLoading.add(tileKey);
    });
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
