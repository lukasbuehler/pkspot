import { Injectable, inject, Injector } from "@angular/core";
import type { QuerySnapshot, DocumentData } from "@angular/fire/firestore";
import { Observable, forkJoin, of, from, throwError } from "rxjs";
import { map, take, timeout, catchError } from "rxjs/operators";
import { Spot } from "../../../../db/models/Spot";
import { SpotId } from "../../../../db/schemas/SpotSchema";
import { SpotSchema } from "../../../../db/schemas/SpotSchema";
import { LocaleCode } from "../../../../db/models/Interfaces";
import { parseFirestoreGeoPoint } from "../../../../scripts/Helpers";
import { StorageService } from "../storage.service";
import { StorageImage } from "../../../../db/models/Media";
import { ConsentAwareService } from "../../consent-aware.service";
import { SpotSlugSchema } from "../../../../db/schemas/SpotSlugSchema";
import {
  FirestoreAdapterService,
  QueryFilter,
} from "../firestore-adapter.service";

@Injectable({
  providedIn: "root",
})
export class SpotsService extends ConsentAwareService {
  private _injector = inject(Injector);
  private _firestoreAdapter = inject(FirestoreAdapterService);
  private get storageService(): StorageService {
    // Lazily resolve to avoid circular DI during construction
    return this._injector.get(StorageService);
  }

  constructor() {
    super();
  }

  docRef(path: string) {
    return this._firestoreAdapter.documentReference(path);
  }

  getSpotById(spotId: SpotId, locale: LocaleCode): Promise<Spot> {
    // Use adapter for platform-agnostic access
    return this._firestoreAdapter
      .getDocument<SpotSchema & { id: string }>(`spots/${spotId}`)
      .then((data) => {
        if (data) {
          return this.hydrateSpot(data.id as SpotId, data, locale);
        } else {
          throw new Error("Error! This Spot does not exist.");
        }
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
          return this.hydrateSpot(d.id as SpotId, d, locale);
        })
      );
  }

  async deleteSpotCascade(spotId: SpotId): Promise<void> {
    await this.deleteSpotNestedCollection(`spots/${spotId}/reviews`);
    await this.deleteSpotNestedCollection(`spots/${spotId}/reports`);
    await this.deleteSpotNestedCollection(`spots/${spotId}/challenges`);

    const edits = await this._firestoreAdapter.getCollection<{ id: string }>(
      `spots/${spotId}/edits`
    );
    for (const edit of edits) {
      await this.deleteSpotNestedCollection(
        `spots/${spotId}/edits/${edit.id}/votes`
      );
      await this.deleteSpotDocument(`spots/${spotId}/edits/${edit.id}`);
    }

    await this.deleteSpotSlugAliases(spotId);
    await this.deleteSpotDocument(`spots/${spotId}`);
  }

  private async deleteSpotNestedCollection(
    collectionPath: string
  ): Promise<void> {
    const docs = await this._firestoreAdapter.getCollection<{ id: string }>(
      collectionPath
    );

    for (const doc of docs) {
      await this.deleteSpotDocument(`${collectionPath}/${doc.id}`);
    }
  }

  private async deleteSpotSlugAliases(spotId: SpotId): Promise<void> {
    const slugs = await this._firestoreAdapter.getCollection<
      SpotSlugSchema & { id: string }
    >("spot_slugs", [{ fieldPath: "spot_id", opStr: "==", value: spotId }]);

    for (const slug of slugs) {
      await this.deleteSpotDocument(`spot_slugs/${slug.id}`);
    }
  }

  private async deleteSpotDocument(path: string): Promise<void> {
    try {
      await this._firestoreAdapter.deleteDocument(path);
    } catch (error) {
      console.error(`[SpotsService] Failed to delete ${path}`, error);
      throw error;
    }
  }

  getSpotBySlug(slug: string, locale: LocaleCode): Promise<Spot | null> {
    const filters: QueryFilter[] = [
      { fieldPath: "slug", opStr: "==", value: slug },
    ];
    return this._firestoreAdapter
      .getCollection<SpotSchema & { id: string }>("spots", filters)
      .then((docs) => {
        if (docs && docs.length > 0) {
          for (const spotDoc of docs) {
            try {
              return this.hydrateSpot(
                spotDoc.id as SpotId,
                spotDoc as SpotSchema,
                locale
              );
            } catch (error) {
              console.warn(
                `[SpotsService] Ignoring incomplete spot slug match ${spotDoc.id}`,
                error
              );
            }
          }
        }
        return null;
      });
  }

  getSpotsForTiles(
    tiles: { x: number; y: number }[],
    locale: LocaleCode,
    options?: { suppressTileErrors?: boolean }
  ): Observable<Spot[]> {
    if (tiles.length === 0) {
      return of([]);
    }

    const suppressTileErrors = options?.suppressTileErrors ?? true;

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
          const spots: Spot[] = [];
          arr.forEach((docObj) => {
            try {
              spots.push(this.hydrateSpot(docObj.id as SpotId, docObj, locale));
            } catch (error) {
              console.error(
                `[SpotsService] Failed to hydrate spot ${docObj.id}`,
                error
              );
            }
          });
          return spots;
        }),
        catchError((err) => {
          console.error(
            `[SpotsService] Tile ${tile.x},${tile.y} FAILED:`,
            JSON.stringify(err, Object.getOwnPropertyNames(err))
          );
          console.error(err);
          if (suppressTileErrors) {
            return of([]);
          }
          return throwError(() => err);
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

  private _parseSpots(
    snapshot: QuerySnapshot<DocumentData>,
    locale: LocaleCode
  ): Spot[] {
    let newSpots: Spot[] = [];
    snapshot.forEach((doc) => {
      const data: any = doc.data();
      const spotData: SpotSchema = data as SpotSchema;
      if (spotData) {
        try {
          let newSpot: Spot = this.hydrateSpot(
            doc.id as SpotId,
            spotData,
            locale
          );
          newSpots.push(newSpot);
        } catch (error) {
          console.error(
            `[SpotsService] Failed to parse spot snapshot ${doc.id}`,
            error
          );
        }
      } else {
        console.error("Spot could not be cast to Spot.Schema!");
      }
    });
    return newSpots;
  }

  private hydrateSpot(
    spotId: SpotId,
    spotData: SpotSchema,
    locale: LocaleCode
  ): Spot {
    if (!parseFirestoreGeoPoint(spotData.location, spotData.location_raw)) {
      throw new Error(
        `Spot ${spotId} does not have a usable location yet.`
      );
    }

    return new Spot(spotId, spotData, locale);
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
