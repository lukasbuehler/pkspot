import { Injectable } from "@angular/core";
import {
  Firestore,
  doc,
  addDoc,
  getDoc,
  collection,
  onSnapshot,
  where,
  query,
  updateDoc,
  writeBatch,
  QuerySnapshot,
  DocumentData,
  runTransaction,
} from "@angular/fire/firestore";
import { Observable, forkJoin } from "rxjs";
import { map, take } from "rxjs/operators";
import { Spot } from "../../../../db/models/Spot";
import { SpotId } from "../../../../db/schemas/SpotSchema";
import {
  MapTileKey,
  getDataFromClusterTileKey,
  SpotClusterTileSchema,
} from "../../../../db/schemas/SpotClusterTile";
import { SpotSchema } from "../../../../db/schemas/SpotSchema";
import { LocaleCode } from "../../../../db/models/Interfaces";
import { transformFirestoreData } from "../../../../scripts/Helpers";
import { GeoPoint } from "@firebase/firestore";
import { StorageService } from "../storage.service";
import { AnyMedia, StorageImage } from "../../../../db/models/Media";
import { MediaSchema } from "../../../../db/schemas/Media";
import { ConsentAwareService } from "../../consent-aware.service";

@Injectable({
  providedIn: "root",
})
export class SpotsService extends ConsentAwareService {
  constructor(
    private firestore: Firestore,
    private storageService: StorageService
  ) {
    super();
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

    return new Observable<Spot>((observer) => {
      return onSnapshot(
        doc(this.firestore, "spots", spotId),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as SpotSchema;
            let spot = new Spot(snap.id as SpotId, data, locale);
            observer.next(spot);
          } else {
            observer.error({ msg: "Error! This Spot does not exist." });
          }
        },
        (error) => {
          observer.error({
            msg: "Error! There was a problem loading this spot.",
            debug: error,
          });
        }
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
    const observables = tiles.map((tile) => {
      // console.debug("Getting spots for tile: ", tile);

      return new Observable<Spot[]>((observer) => {
        const unsubscribe = onSnapshot(
          query(
            collection(this.firestore, "spots"),
            where("tile_coordinates.z16.x", "==", tile.x),
            where("tile_coordinates.z16.y", "==", tile.y)
          ),
          (snap) => {
            observer.next(this._parseSpots(snap, locale));
          },
          (error) => {
            observer.error(error);
          }
        );
        return () => {
          unsubscribe();
        };
      }).pipe(take(1));
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

  getSpotClusterTiles(
    tiles: MapTileKey[]
  ): Observable<SpotClusterTileSchema[]> {
    const observables = tiles.map((tile) => {
      // console.debug("Getting spot cluster tile: ", tile);

      return new Observable<SpotClusterTileSchema[]>((observer) => {
        const unsubscribe = onSnapshot(
          doc(this.firestore, "spot_clusters", tile),
          (snap) => {
            if (snap.exists()) {
              observer.next([snap.data() as SpotClusterTileSchema]);
            } else {
              observer.next([]);
            }
          },
          (error) => {
            console.error(error);
            observer.error(error);
          }
        );
        return () => {
          unsubscribe();
        };
      }).pipe(take(1));
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

  createSpot(spotData: Partial<SpotSchema>): Promise<SpotId> {
    // remove the reviews, review_histogram and review_count fields
    spotData = this._removeForbiddenFieldsFromSpotData(spotData);

    console.debug("Creating spot with data: ", JSON.stringify(spotData));
    return addDoc(collection(this.firestore, "spots"), spotData).then(
      (data) => {
        return data.id as SpotId;
      }
    );
  }

  updateSpot(
    spotId: SpotId,
    spotUpdateData: Partial<SpotSchema>,
    locale: LocaleCode,
    oldSpotData?: Partial<SpotSchema>
  ): Promise<void> {
    // remove the reviews, review_histogram and review_count fields
    spotUpdateData = this._removeForbiddenFieldsFromSpotData(spotUpdateData);

    // check if the media has changed and delete the old media from storage
    let oldSpotMediaPromise: Promise<SpotSchema["media"]>;
    if (oldSpotData && oldSpotData.media) {
      oldSpotMediaPromise = Promise.resolve(oldSpotData.media);
    } else {
      oldSpotMediaPromise = this.getSpotById(spotId, locale).then((spot) => {
        const dbMedia = spot.data().media;
        return dbMedia;
      });
    }

    oldSpotMediaPromise.then((oldSpotMedia: SpotSchema["media"]) => {
      this._checkMediaDiffAndDeleteFromStorageIfNecessary(
        oldSpotMedia,
        spotUpdateData.media
      );
    });

    console.log("Updating spot with data: ", JSON.stringify(spotUpdateData));
    return updateDoc(doc(this.firestore, "spots", spotId), spotUpdateData);
  }

  _removeForbiddenFieldsFromSpotData(
    spotData: Partial<SpotSchema>
  ): Partial<SpotSchema> {
    const fieldsToRemove: (keyof SpotSchema)[] = [
      "rating",
      "num_reviews",
      "rating_histogram",
      "highlighted_reviews",
    ];

    for (let field of fieldsToRemove) {
      if (field in spotData) {
        delete spotData[field];
      }
    }

    return spotData;
  }

  updateSpotMedia(spotId: SpotId, media: AnyMedia[]): Promise<void> {
    return updateDoc(doc(this.firestore, "spots", spotId), { media });
  }

  /**
   * Append a media item to a spot's media array using a transaction, guarding against duplicates.
   */
  appendSpotMedia(spotId: SpotId, mediaItem: MediaSchema): Promise<void> {
    const spotRef = doc(this.firestore, "spots", spotId);
    return runTransaction(this.firestore, async (tx) => {
      const snap = await tx.get(spotRef);
      if (!snap.exists()) throw new Error("Spot not found");
      const data = snap.data() as SpotSchema;
      const current = (data.media ?? []) as MediaSchema[];
      const already = current.some((m) => m.src === mediaItem.src);
      if (already) return; // idempotent
      const updated = [...current, mediaItem];
      tx.update(spotRef, { media: updated });
    });
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

  createMultipleSpots(spotData: SpotSchema[]): Promise<void> {
    const batch = writeBatch(this.firestore);
    spotData.forEach((spot) => {
      const newSpotRef = doc(collection(this.firestore, "spots"));
      batch.set(newSpotRef, spot);
    });
    return batch.commit();
  }
}
