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

@Injectable({
  providedIn: "root",
})
export class SpotsService extends ConsentAwareService {
  private _injector = inject(Injector);
  private _platformService = inject(PlatformService);
  private get storageService(): StorageService {
    // Lazily resolve to avoid circular DI during construction
    return this._injector.get(StorageService);
  }

  // Firestore REST API base URL for HTTP fallback
  private readonly FIRESTORE_REST_URL =
    "https://firestore.googleapis.com/v1/projects/parkour-base-project/databases/(default)/documents";

  constructor(private firestore: Firestore) {
    super();
  }

  // DIAGNOSTIC - Test different query types to isolate the issue
  async diagnosticTest() {
    console.warn(
      "[DIAGNOSTIC] ========== STARTING FIRESTORE DIAGNOSTIC =========="
    );
    console.warn(
      "[DIAGNOSTIC] Testing connection at:",
      new Date().toISOString()
    );

    // Helper function to add timeout to promises
    const withTimeout = <T>(
      promise: Promise<T>,
      ms: number,
      name: string
    ): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(
            () => reject(new Error(`${name} timed out after ${ms}ms`)),
            ms
          )
        ),
      ]);
    };

    const TIMEOUT_MS = 10000; // 10 second timeout for each test

    // Test 1: Single document fetch (getDoc) - this typically works
    console.warn("[DIAGNOSTIC] Test 1: Single document fetch (getDoc)...");
    const startGetDoc = Date.now();
    try {
      // Use a known document ID or first one from a collection
      const singleDocRef = doc(this.firestore, "spots", "test-doc-id"); // This may not exist, but should still return quickly
      const singleSnap = await withTimeout(
        getDoc(singleDocRef),
        TIMEOUT_MS,
        "getDoc"
      );
      console.warn(
        `[DIAGNOSTIC] Test 1 SUCCESS in ${
          Date.now() - startGetDoc
        }ms - exists: ${singleSnap.exists()}`
      );
    } catch (e) {
      console.error(
        `[DIAGNOSTIC] Test 1 FAILURE in ${Date.now() - startGetDoc}ms:`,
        e
      );
    }

    // Test 2: Simple query with limit (getDocs) - this is what's failing
    console.warn("[DIAGNOSTIC] Test 2: Simple query with limit(1)...");
    const startQuery = Date.now();
    try {
      const ref = collection(this.firestore, "spots");
      const q = query(ref, limit(1));
      const snap = await withTimeout(getDocs(q), TIMEOUT_MS, "getDocs(limit)");
      console.warn(
        `[DIAGNOSTIC] Test 2 SUCCESS in ${Date.now() - startQuery}ms - found ${
          snap.size
        } docs`
      );
      snap.forEach((d) => console.warn(`[DIAGNOSTIC] Doc ID: ${d.id}`));
    } catch (e) {
      console.error(
        `[DIAGNOSTIC] Test 2 FAILURE in ${Date.now() - startQuery}ms:`,
        e
      );
    }

    // Test 3: Query with where clause (like the tile queries)
    console.warn("[DIAGNOSTIC] Test 3: Query with where clause...");
    const startWhere = Date.now();
    try {
      const ref = collection(this.firestore, "spots");
      const q = query(ref, where("tile_coordinates.z16.x", "==", 0), limit(1)); // Use 0 to get empty result quickly
      const snap = await withTimeout(getDocs(q), TIMEOUT_MS, "getDocs(where)");
      console.warn(
        `[DIAGNOSTIC] Test 3 SUCCESS in ${Date.now() - startWhere}ms - found ${
          snap.size
        } docs`
      );
    } catch (e) {
      console.error(
        `[DIAGNOSTIC] Test 3 FAILURE in ${Date.now() - startWhere}ms:`,
        e
      );
    }

    // Test 4: Raw fetch API to bypass SDK entirely - tests basic network connectivity
    console.warn("[DIAGNOSTIC] Test 4: Raw fetch to Firestore REST API...");
    const startFetch = Date.now();
    try {
      const response = await withTimeout(
        fetch(
          "https://firestore.googleapis.com/v1/projects/parkour-base-project/databases/(default)/documents/spots?pageSize=1",
          { method: "GET" }
        ),
        TIMEOUT_MS,
        "fetch"
      );
      const data = await response.json();
      console.warn(
        `[DIAGNOSTIC] Test 4 SUCCESS in ${
          Date.now() - startFetch
        }ms - status: ${response.status}, has documents: ${!!data.documents}`
      );
    } catch (e) {
      console.error(
        `[DIAGNOSTIC] Test 4 FAILURE in ${Date.now() - startFetch}ms:`,
        e
      );
    }

    console.warn("[DIAGNOSTIC] ========== DIAGNOSTIC COMPLETE ==========");
  }

  docRef(path: string) {
    return doc(this.firestore, path);
  }

  getSpotById(spotId: SpotId, locale: LocaleCode): Promise<Spot> {
    console.log(spotId);
    const spotIdString: string = spotId as string;

    return getDoc(doc(this.firestore, "spots", spotIdString)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data() as SpotSchema;
        return new Spot(snap.id as SpotId, data, locale);
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
    return runInInjectionContext(this.injector, () => {
      return docData(doc(this.firestore, "spots", spotId), {
        idField: "id",
      }).pipe(
        map((d: any) => {
          if (!d) throw new Error("Error! This Spot does not exist.");
          return new Spot(spotId, d as SpotSchema, locale);
        })
      );
    });
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
    // On native platforms (iOS/Android), the Firebase JS SDK has connection issues.
    // Use REST API fallback instead.
    if (this._platformService.isNative()) {
      console.log("[SpotsService] Using HTTP fallback for native platform");
      return this.getSpotsForTilesHttp(tiles, locale);
    }

    // On web, use the standard Firebase SDK
    const observables = tiles.map((tile) => {
      return runInInjectionContext(this.injector, () => {
        return collectionData(
          query(
            collection(this.firestore, "spots"),
            where("tile_coordinates.z16.x", "==", tile.x),
            where("tile_coordinates.z16.y", "==", tile.y)
          ),
          { idField: "id" }
        );
      }).pipe(
        take(1),
        timeout(15000),
        map((arr: any[]) => {
          console.log(
            `[SpotsService] Tile ${tile.x},${tile.y} returned ${arr.length} spots`
          );
          return arr.map(
            (docObj) =>
              new Spot(
                (docObj as any).id as SpotId,
                docObj as SpotSchema,
                locale
              )
          );
        }),
        catchError((err) => {
          console.error(
            `[SpotsService] Tile ${tile.x},${tile.y} FAILED (likely missing index):`,
            err
          );
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
    const observables = tiles.map((tile) => {
      // Use AngularFire docData to get typed doc observable and take one emission
      console.debug("Getting spot cluster tile for tile: ", tile);
      return runInInjectionContext(this.injector, () => {
        return docData(doc(this.firestore, "spot_clusters", tile), {
          idField: "id",
        }).pipe(
          take(1),
          map((d: any) => {
            if (!d) {
              console.log(
                `[SpotsService] Cluster Tile ${tile} returned NULL/Empty`
              );
              return [] as SpotClusterTileSchema[];
            }
            // docData returns the document data — convert to the expected array shape
            console.log(`[SpotsService] Cluster Tile ${tile} returned DATA`);
            return [d as SpotClusterTileSchema];
          }),
          timeout(15000),
          catchError((err) => {
            console.error(`[SpotsService] Cluster Tile ${tile} FAILED:`, err);
            return of([]);
          })
        );
      });
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
