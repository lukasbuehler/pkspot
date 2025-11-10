import { Injectable, inject, Injector } from "@angular/core";
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
  Timestamp,
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
import { GeoPoint } from "firebase/firestore";
import { deleteField } from "firebase/firestore";
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

@Injectable({
  providedIn: "root",
})
export class SpotsService extends ConsentAwareService {
  private _injector = inject(Injector);
  private get storageService(): StorageService {
    // Lazily resolve to avoid circular DI during construction
    return this._injector.get(StorageService);
  }

  constructor(private firestore: Firestore) {
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

    // Ensure types are correct via consistent imports

    console.debug("Creating spot with data: ", JSON.stringify(spotData));
    return addDoc(collection(this.firestore, "spots"), spotData).then(
      (data) => {
        return data.id as SpotId;
      }
    );
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

  // No normalization needed when all code uses firebase/firestore types consistently

  /**
   * Update spot media via a spot edit (UPDATE type).
   * This creates an edit that will be processed by the cloud function.
   *
   * @param spotId - The ID of the spot
   * @param media - The new media array
   * @param userReference - The user making the edit
   * @returns Promise<string> - The ID of the created edit
   */
  updateSpotMediaEdit(
    spotId: SpotId,
    media: AnyMedia[],
    userReference: UserReferenceSchema
  ): Promise<string> {
    const spotEditsService = this._injector.get(SpotEditsService);

    // Convert AnyMedia to MediaSchema using the getData() method
    const mediaSchema: MediaSchema[] = media.map((mediaObj) =>
      mediaObj.getData()
    );

    const editData = {
      type: "UPDATE" as const,
      timestamp: Timestamp.now(),
      likes: 0,
      approved: false,
      user: userReference,
      data: { media: mediaSchema },
    };
    return spotEditsService.addSpotEdit(spotId, editData);
  }

  /**
   * Update spot external references (e.g., Google Maps Place ID) via a spot edit.
   *
   * @param spotId - The ID of the spot
   * @param externalReferences - The external references to update
   * @param userReference - The user making the edit
   * @returns Promise<string> - The ID of the created edit
   */
  updateSpotExternalReferenceEdit(
    spotId: SpotId,
    externalReferences: Partial<SpotSchema["external_references"]>,
    userReference: UserReferenceSchema
  ): Promise<string> {
    const spotEditsService = this._injector.get(SpotEditsService);
    const editData = {
      type: "UPDATE" as const,
      timestamp: Timestamp.now(),
      likes: 0,
      approved: false,
      user: userReference,
      data: { external_references: externalReferences },
    };
    return spotEditsService.addSpotEdit(spotId, editData);
  }

  /**
   * Append a media item to a spot via a spot edit.
   *
   * @param spotId - The ID of the spot
   * @param mediaItem - The media item to append
   * @param userReference - The user making the edit
   * @returns Promise<string> - The ID of the created edit
   */
  appendSpotMediaEdit(
    spotId: SpotId,
    mediaItem: MediaSchema,
    userReference: UserReferenceSchema
  ): Promise<string> {
    const spotEditsService = this._injector.get(SpotEditsService);
    const editData = {
      type: "UPDATE" as const,
      timestamp: Timestamp.now(),
      likes: 0,
      approved: false,
      user: userReference,
      data: { media: [mediaItem] }, // Note: Cloud function will need to handle appending
    };
    return spotEditsService.addSpotEdit(spotId, editData);
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

  /**
   * Create a new spot with a CREATE edit.
   * This is the proper flow for new spot creation:
   * 1. Create the spot document (let Firestore generate the ID)
   * 2. Create a CREATE edit subcollection entry
   * 3. The cloud function processes the edit and applies the data to the spot
   *
   * @param spotData - The data for the new spot
   * @param userReference - The user creating the spot
   * @returns Promise<SpotId> - The ID of the created spot
   */
  async createSpotWithEdit(
    spotData: Partial<SpotSchema>,
    userReference: UserReferenceSchema
  ): Promise<SpotId> {
    // First, create an empty spot document (let Firestore generate the ID)
    // No metadata is sent from client - cloud function will set it from the edit
    spotData = this._removeForbiddenFieldsFromSpotData(spotData);

    console.debug("Creating new spot with edit:", JSON.stringify(spotData));

    const newSpotRef = await addDoc(collection(this.firestore, "spots"), {});

    const spotId = newSpotRef.id as SpotId;
    console.log("Created spot document with ID:", spotId);

    // Now create the CREATE edit
    await this.createSpotEdit(spotId, spotData, userReference);
    console.log("Created spot edit for ID:", spotId);

    return spotId;
  }

  /**
   * Create a new spot edit for a new spot (CREATE type).
   * The spot edit will be processed by the cloud function and create the actual spot.
   *
   * @param spotId - The ID for the new spot (can be generated)
   * @param spotData - The data for the new spot
   * @param userReference - The user creating the spot
   * @returns Promise<string> - The ID of the created edit
   */
  createSpotEdit(
    spotId: SpotId,
    spotData: Partial<SpotSchema>,
    userReference: UserReferenceSchema
  ): Promise<string> {
    const spotEditsService = this._injector.get(SpotEditsService);
    const editData = {
      type: "CREATE" as const,
      timestamp: Timestamp.now(),
      user: userReference,
      data: spotData,
    };
    return spotEditsService.addSpotEdit(spotId, editData);
  }

  /**
   * Create a spot edit for an existing spot (UPDATE type).
   * The spot edit will be processed by the cloud function and update the actual spot.
   *
   * @param spotId - The ID of the spot to update
   * @param spotUpdateData - The partial data to update
   * @param userReference - The user making the edit
   * @param prevData - Optional: the previous data before the change
   * @returns Promise<string> - The ID of the created edit
   */
  updateSpotEdit(
    spotId: SpotId,
    spotUpdateData: Partial<SpotSchema>,
    userReference: UserReferenceSchema,
    prevData?: Partial<SpotSchema>
  ): Promise<string> {
    const spotEditsService = this._injector.get(SpotEditsService);
    spotUpdateData = this._removeForbiddenFieldsFromSpotData(spotUpdateData);

    const editData = {
      type: "UPDATE" as const,
      timestamp: Timestamp.now(),
      user: userReference,
      data: spotUpdateData,
      prevData: prevData,
    };
    return spotEditsService.addSpotEdit(spotId, editData);
  }
}
