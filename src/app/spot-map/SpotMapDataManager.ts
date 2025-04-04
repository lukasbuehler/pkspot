import { BehaviorSubject, firstValueFrom } from "rxjs";
import { LocalSpot, Spot } from "../../db/models/Spot";
import { SpotId } from "../../db/schemas/SpotSchema";
import {
  MapTileKey,
  getClusterTileKey,
  getDataFromClusterTileKey,
  SpotClusterDotSchema,
  SpotClusterTileSchema,
} from "../../db/schemas/SpotClusterTile";
import { TilesObject } from "../map/map.component";
import { MarkerSchema } from "../marker/marker.component";
import { inject, signal } from "@angular/core";
import { SpotsService } from "../services/firebase/firestore/spots.service";
import { LocaleCode } from "../../db/models/Interfaces";
import { OsmDataService } from "../services/osm-data.service";
import { MapHelpers } from "../../scripts/MapHelpers";
import { SpotPreviewData } from "../../db/schemas/SpotPreviewData";

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
  _spotsService = inject(SpotsService);
  _osmDataService = inject(OsmDataService);

  private _spotClusterTiles: Map<MapTileKey, SpotClusterTileSchema>;
  // private _spotClusterKeysByZoom: Map<number, Map<string, MapTileKey>>;
  private _spots: Map<MapTileKey, Spot[]>;
  private _markers: Map<MapTileKey, MarkerSchema[]>;
  private _tilesLoading: Set<MapTileKey>;

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
  readonly markerZoom = 12;
  readonly clusterZooms = [4, 8, 12];
  readonly divisor = 4;
  readonly defaultRating = 1.5;

  constructor(readonly locale: LocaleCode, readonly debugMode: boolean = true) {
    this._spotClusterTiles = new Map<MapTileKey, SpotClusterTileSchema>();
    // this._spotClusterKeysByZoom = new Map<number, Map<string, MapTileKey>>();
    this._spots = new Map<MapTileKey, Spot[]>();
    this._markers = new Map<MapTileKey, MarkerSchema[]>();
    this._tilesLoading = new Set<MapTileKey>();
  }

  // public functions

  setVisibleTiles(visibleTilesObj: TilesObject) {
    // update the visible tiles
    this._lastVisibleTiles.set(visibleTilesObj);

    const zoom = visibleTilesObj.zoom;

    if (zoom >= this.spotZoom) {
      // show spots and markers
      this._showCachedSpotsAndMarkersForTiles(visibleTilesObj);

      // now determine the missing information and load spots and markers for it
      const spotTilesToLoad16: Set<MapTileKey> =
        this._getSpotTilesToLoad(visibleTilesObj);
      const markerTilesToLoad16: Set<MapTileKey> =
        this._getMarkerTilesToLoad(visibleTilesObj);

      // load spots for missing tiles
      this._loadSpotsForTiles(spotTilesToLoad16);

      // load markers for missing tiles
      this._loadMarkersForTiles(markerTilesToLoad16);
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

    let saveSpotPromise: Promise<void>;
    if (spot instanceof Spot) {
      // this spot already exists in the database
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

    // get the spots and markers for these tiles
    const spots: Spot[] = [];
    const markers: MarkerSchema[] = [];
    tiles16.tiles.forEach((tile) => {
      const key = getClusterTileKey(tiles16.zoom, tile.x, tile.y);
      if (this._spots.has(key)) {
        const tileSpots = this._spots.get(key)!;
        spots.push(...tileSpots);
      }
      if (this._markers.has(key)) {
        const tileMarkers = this._markers.get(key)!;
        markers.push(...tileMarkers);
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

    this._visibleDotsBehaviorSubject.next([]);
    this._visibleHighlightedSpotsBehaviorSubject.next([]);
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

    // get the tiles object for the cluster zoom
    const tilesZ =
      this.clusterZooms
        .filter((zoom) => zoom <= tiles.zoom)
        .sort((a, b) => b - a)[0] ?? this.clusterZooms[0];

    const tilesZObj = this._transformTilesObjectToZoom(tiles, tilesZ);

    // get the spot clusters for these tiles
    const dots: SpotClusterDotSchema[] = [];
    const spots: SpotPreviewData[] = [];
    tilesZObj.tiles.forEach((tile) => {
      const key = getClusterTileKey(tilesZObj.zoom, tile.x, tile.y);
      if (this._spotClusterTiles.has(key)) {
        const spotCluster = this._spotClusterTiles.get(key)!;
        dots.push(...spotCluster.dots);
        spots.push(...spotCluster.spots);
      }
    });

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

    this._visibleSpotsBehaviorSubject.next([]);
    this._visibleMarkersBehaviorSubject.next([]);
    this._visibleDotsBehaviorSubject.next(dots);
    this._visibleHighlightedSpotsBehaviorSubject.next(spots);
  }

  private _loadSpotsForTiles(tilesToLoad: Set<MapTileKey>) {
    if (tilesToLoad.size === 0) return;

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

    // console.debug("Loading markers for tiles", tiles12);

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
                    icons: ["local_drink"], // water_drop
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
                        ? ["local_drink"]
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
                  const marker: MarkerSchema = {
                    location: {
                      lat: element.lat,
                      lng: element.lon,
                    },
                    icons:
                      element.tags.fee === "yes"
                        ? ["wc", "paid"]
                        : element.tags.fee === "no"
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

    // transform the visible tiles to the zoom level of the spot clusters
    // get the tiles object for the cluster zoom
    const tilesZ =
      this.clusterZooms
        .filter((zoom) => zoom <= visibleTilesObj.zoom)
        .sort((a, b) => b - a)[0] ?? this.clusterZooms[0];

    visibleTilesObj = this._transformTilesObjectToZoom(visibleTilesObj, tilesZ);

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

  _getAllLoadedSpots(): Spot[] {
    const allSpots: Spot[] = [];
    for (const key of this._spots.keys()) {
      if (!key.includes("z16")) continue;

      const loadedSpots = this._spots.get(key);
      if (!loadedSpots) continue;

      allSpots.concat(loadedSpots);
    }

    return allSpots;
  }

  private _loadSpotClustersForTiles(tilesToLoad: Set<MapTileKey>) {
    if (tilesToLoad.size === 0) return;

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

    const tiles: { x: number; y: number }[] = [];
    let tileSw = tilesObj.sw;
    let tileNe = tilesObj.ne;

    if (shift < 0) {
      shift = -shift;
      tileSw = {
        x: tileSw.x >> shift, // divide shift times by 2
        y: tileSw.y >> shift,
      };
      tileNe = {
        x: tileNe.x >> shift,
        y: tileNe.y >> shift,
      };

      tilesObj.tiles.forEach((tile) => {
        tile = {
          x: tile.x >> shift,
          y: tile.y >> shift,
        };

        if (
          !tiles.some(
            (existingTile) =>
              existingTile.x === tile.x && existingTile.y === tile.y
          )
        ) {
          tiles.push(tile);
        }
      });
    } else {
      // shift > 0

      tileSw = {
        x: tileSw.x << shift, // multiply shift times by 2
        y: tileSw.y << shift,
      };
      tileNe = {
        x: tileNe.x << shift,
        y: tileNe.y << shift,
      };

      // since we are zooming out here we need to add all the tiles that are in the new zoom level
      for (let x = tileSw.x; x <= tileNe.x; x++) {
        for (let y = tileNe.y; y <= tileSw.y; y++) {
          tiles.push({ x: x, y: y });
        }
      }
    }

    const newTilesObj: TilesObject = {
      zoom: targetZoom,
      sw: tileSw,
      ne: tileNe,
      tiles: tiles,
    };

    return newTilesObj;
  }

  isTileLoading(tileKey: MapTileKey): boolean {
    return this._tilesLoading.has(tileKey);
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
    //Get the tile coordinates to save in loaded spots
    const ref = this.getReferenceToLoadedSpotById(newSpot.id);

    console.log("spot to update ref", ref);
    if (ref?.spot && ref.indexInTileArray >= 0 && ref.tile) {
      // The spot exists and should be updated
      // Update the spot
      this._spots.get(getClusterTileKey(16, ref.tile.x, ref.tile.y))![
        ref.indexInTileArray
      ] = newSpot;
    } else {
      // the spot does not exist

      // get the tile coordinates for the location of the new spot
      let tile = MapHelpers.getTileCoordinatesForLocationAndZoom(
        newSpot.location(),
        16
      );
      let spots = this._spots.get(getClusterTileKey(16, tile.x, tile.y));

      if (spots && spots.length > 0) {
        // There are spots loaded for this 16 tile, add the new spot to the loaded spots array
        spots.push(newSpot);
      } else {
        // There are no spots loaded for this 16 tile, add it to the loaded spots
        spots = [newSpot];
      }
      this._spots.set(getClusterTileKey(16, tile.x, tile.y), spots);
    }

    // update the map to show the new spot on the loaded spots array.
    const lastVisibleTiles = this._lastVisibleTiles();
    if (lastVisibleTiles && lastVisibleTiles?.zoom >= this.spotZoom) {
      this._showCachedSpotsAndMarkersForTiles(lastVisibleTiles);
    }
  }

  // /**
  //  * This function is used if the new spot was saved and now has an id. It replaces the first spot it finds with no ID with the newSaveSpot
  //  * @param newSavedSpot The new spot that replaces the unsaved new spot
  //  */
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
