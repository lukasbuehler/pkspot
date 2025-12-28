import {
  Injectable,
  inject,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import {
  Firestore,
  doc,
  addDoc,
  getDoc,
  collection,
  collectionData,
  docData,
  where,
  query,
  QuerySnapshot,
  DocumentData,
  limit,
  getDocs,
  deleteField,
} from "@angular/fire/firestore";
import { Observable, forkJoin, of, from } from "rxjs";
import { map, take, timeout, catchError } from "rxjs/operators";
import { Spot } from "../../../../db/models/Spot";
import { SpotId } from "../../../../db/schemas/SpotSchema";
import {
  MapTileKey,
  getDataFromClusterTileKey,
  SpotClusterTileSchema,
} from "../../../../db/schemas/SpotClusterTile";
import { SpotSchema } from "../../../../db/schemas/SpotSchema";
import { LocaleCode } from "../../../../db/models/Interfaces";
import {
  transformFirestoreData,
  cleanDataForFirestore,
} from "../../../../scripts/Helpers";
import { GeoPoint } from "firebase/firestore";
import { StorageService } from "../storage.service";
import {
  AnyMedia,
  StorageImage,
  StorageVideo,
} from "../../../../db/models/Media";
import { MediaSchema } from "../../../../db/schemas/Media";
import { ConsentAwareService } from "../../consent-aware.service";
import { SpotEditsService } from "./spot-edits.service";
import { UserReferenceSchema } from "../../../../db/schemas/UserSchema";
import { PlatformService } from "../../platform.service";
import {
  FirestoreAdapterService,
  QueryFilter,
} from "../firestore-adapter.service";

@Injectable({
  providedIn: "root",
})
export class SpotsService extends ConsentAwareService {
  private _injector = inject(Injector);
  private _platformService = inject(PlatformService);
  private _firestoreAdapter = inject(FirestoreAdapterService);
  private get storageService(): StorageService {
    // Lazily resolve to avoid circular DI during construction
    return this._injector.get(StorageService);
  }

  // Firestore REST API base URL for HTTP fallback (legacy, can be removed later)
  private readonly FIRESTORE_REST_URL =
    "https://firestore.googleapis.com/v1/projects/parkour-base-project/databases/(default)/documents";

  constructor(private firestore: Firestore) {
    super();
  }

  docRef(path: string) {
    return doc(this.firestore, path);
  }

  getSpotById(spotId: SpotId, locale: LocaleCode): Promise<Spot> {
    console.log(spotId);

    // Use adapter for platform-agnostic access
    return this._firestoreAdapter
      .getDocument<SpotSchema & { id: string }>(`spots/${spotId}`)
      .then((data) => {
        if (data) {
          return new Spot(data.id as SpotId, data as SpotSchema, locale);
        } else {
          throw new Error("Error! This Spot does not exist.");
        }
      });
  }

  getSpotByIdHttp(spotId: SpotId, locale: LocaleCode): Promise<Spot> {
    return fetch(
      `https://firestore.googleapis.com/v1/projects/parkour-base-project/databases/(default)/documents/spots/${spotId}`
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json();
      })
      .then((data) => {
        if (!data.fields) {
          throw new Error("No 'fields' property in JSON response");
        }

        const spotData = transformFirestoreData(data.fields) as SpotSchema;

        return new Spot(spotId, spotData, locale);
      })
      .catch((error) => {
        console.error("There was a problem with the fetch operation:", error);
        throw error;
      });
  }

  getSpotById$(spotId: SpotId, locale: LocaleCode): Observable<Spot> {
    console.debug("Getting spot with id: ", spotId);
    // Use adapter for platform-agnostic real-time access
    return this._firestoreAdapter
      .documentSnapshots<SpotSchema & { id: string }>(`spots/${spotId}`)
      .pipe(
        map((d) => {
          if (!d) throw new Error("Error! This Spot does not exist.");
          return new Spot(d.id as SpotId, d as SpotSchema, locale);
        })
      );
  }

  getSpotsForTileKeys(
    tileKeys: MapTileKey[],
    locale: LocaleCode
  ): Observable<Spot[]> {
    const tiles = tileKeys.map((key) => getDataFromClusterTileKey(key));
    return this.getSpotsForTiles(tiles, locale);
  }

  getSpotsForTiles(
    tiles: { x: number; y: number }[],
    locale: LocaleCode
  ): Observable<Spot[]> {
    // Use adapter - it handles platform detection internally
    // On native: uses native Capacitor Firebase SDK
    // On web: uses @angular/fire
    const observables = tiles.map((tile) => {
      const filters: QueryFilter[] = [
        { fieldPath: "tile_coordinates.z16.x", opStr: "==", value: tile.x },
        { fieldPath: "tile_coordinates.z16.y", opStr: "==", value: tile.y },
      ];

      return from(
        this._firestoreAdapter.getCollection<SpotSchema & { id: string }>(
          "spots",
          filters
        )
      ).pipe(
        map((arr) => {
          console.log(
            `[SpotsService] Tile ${tile.x},${tile.y} returned ${arr.length} spots`
          );
          return arr.map(
            (docObj) =>
              new Spot(docObj.id as SpotId, docObj as SpotSchema, locale)
          );
        }),
        catchError((err) => {
          console.error(`[SpotsService] Tile ${tile.x},${tile.y} FAILED:`, err);
          return of([]);
        })
      );
    });

    return forkJoin(observables).pipe(
      map((arrays: Spot[][]) => {
        let allSpots = new Map<string, Spot>();
        arrays.forEach((spots: Spot[]) => {
          spots.forEach((spot: Spot) => {
            allSpots.set(spot.id, spot);
          });
        });
        return Array.from(allSpots.values());
      })
    );
  }

  /**
   * HTTP-based alternative for getSpotsForTiles that uses the Firestore REST API.
   * This is used on native platforms where the Firebase JS SDK has connection issues.
   */
  private getSpotsForTilesHttp(
    tiles: { x: number; y: number }[],
    locale: LocaleCode
  ): Observable<Spot[]> {
    const promises = tiles.map((tile) =>
      this.getSpotsForTileHttp(tile, locale)
    );
    return from(
      Promise.all(promises).then((arrays) => {
        const allSpots = new Map<string, Spot>();
        arrays.forEach((spots) => {
          spots.forEach((spot) => {
            allSpots.set(spot.id, spot);
          });
        });
        return Array.from(allSpots.values());
      })
    );
  }

  /**
   * Fetch spots for a single tile using the Firestore REST API.
   */
  private async getSpotsForTileHttp(
    tile: { x: number; y: number },
    locale: LocaleCode
  ): Promise<Spot[]> {
    try {
      // Build the structured query for the REST API
      const queryBody = {
        structuredQuery: {
          from: [{ collectionId: "spots" }],
          where: {
            compositeFilter: {
              op: "AND",
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: "tile_coordinates.z16.x" },
                    op: "EQUAL",
                    value: { integerValue: tile.x.toString() },
                  },
                },
                {
                  fieldFilter: {
                    field: { fieldPath: "tile_coordinates.z16.y" },
                    op: "EQUAL",
                    value: { integerValue: tile.y.toString() },
                  },
                },
              ],
            },
          },
        },
      };

      const response = await fetch(`${this.FIRESTORE_REST_URL}:runQuery`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(queryBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const spots: Spot[] = [];

      // Parse the REST API response
      for (const result of data) {
        if (result.document) {
          // Extract document ID from the name field (format: projects/{project}/databases/{db}/documents/{collection}/{id})
          const nameParts = result.document.name.split("/");
          const spotId = nameParts[nameParts.length - 1] as SpotId;

          // Transform the Firestore REST format to normal objects
          const spotData = transformFirestoreData(
            result.document.fields
          ) as SpotSchema;
          spots.push(new Spot(spotId, spotData, locale));
        }
      }

      console.log(
        `[SpotsService HTTP] Tile ${tile.x},${tile.y} returned ${spots.length} spots`
      );

      return spots;
    } catch (error) {
      console.error(
        `[SpotsService HTTP] Tile ${tile.x},${tile.y} FAILED:`,
        error
      );
      return [];
    }
  }

  getSpotClusterTiles(
    tiles: MapTileKey[]
  ): Observable<SpotClusterTileSchema[]> {
    // Use adapter for platform-agnostic document access
    const observables = tiles.map((tile) => {
      console.debug("Getting spot cluster tile for tile: ", tile);

      return from(
        this._firestoreAdapter.getDocument<
          SpotClusterTileSchema & { id: string }
        >(`spot_clusters/${tile}`)
      ).pipe(
        map((d) => {
          if (!d) {
            console.log(
              `[SpotsService] Cluster Tile ${tile} returned NULL/Empty`
            );
            return [] as SpotClusterTileSchema[];
          }
          // Convert to the expected array shape
          console.log(`[SpotsService] Cluster Tile ${tile} returned DATA`);

          const tileData = d as SpotClusterTileSchema;

          // Normalize dots
          if (tileData.dots) {
            tileData.dots.forEach((dot) => {
              if (!dot.location && dot.location_raw) {
                dot.location = new GeoPoint(
                  dot.location_raw.lat,
                  dot.location_raw.lng
                );
              }
            });
          }

          // Normalize highlighted spots
          if (tileData.spots) {
            tileData.spots.forEach((spot) => {
              if (!spot.location && spot.location_raw) {
                spot.location = new GeoPoint(
                  spot.location_raw.lat,
                  spot.location_raw.lng
                );
              }
            });
          }

          return [tileData];
        }),
        catchError((err) => {
          console.error(`[SpotsService] Cluster Tile ${tile} FAILED:`, err);
          return of([]);
        })
      );
    });

    return forkJoin(observables).pipe(
      map((arrays: SpotClusterTileSchema[][]) => {
        let allTiles = new Array<SpotClusterTileSchema>();
        arrays.forEach((tiles: SpotClusterTileSchema[]) => {
          tiles.forEach((tile: SpotClusterTileSchema) => {
            allTiles.push(tile);
          });
        });
        return allTiles;
      })
    );
  }

  private _parseSpots(
    snapshot: QuerySnapshot<DocumentData>,
    locale: LocaleCode
  ): Spot[] {
    let newSpots: Spot[] = [];
    snapshot.forEach((doc) => {
      const data: any = doc.data();
      const spotData: SpotSchema = data as SpotSchema;
      if (spotData) {
        let newSpot: Spot = new Spot(doc.id as SpotId, spotData, locale);
        newSpots.push(newSpot);
      } else {
        console.error("Spot could not be cast to Spot.Schema!");
      }
    });
    return newSpots;
  }

  _checkMediaDiffAndDeleteFromStorageIfNecessary(
    oldMedia: SpotSchema["media"],
    newMedia: SpotSchema["media"]
  ) {
    console.log("oldSpotMedia", oldMedia);
    console.log("newSpotMedia", newMedia);

    oldMedia?.forEach((oldMediaItem) => {
      if (
        !newMedia ||
        !newMedia.find((newMediaItem) => newMediaItem.src === oldMediaItem.src)
      ) {
        // delete oldMediaItem from storage
        console.log("Deleting media item: ", oldMediaItem);
        const storageImage = new StorageImage(oldMediaItem.src);
        this.storageService.delete(storageImage);
      }
    });
  }
}
