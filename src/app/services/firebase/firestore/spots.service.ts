import { Injectable, inject, Injector } from "@angular/core";
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
import {
  transformFirestoreData,
  cleanDataForFirestore,
} from "../../../../scripts/Helpers";
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
    return docData(doc(this.firestore, "spots", spotId), {
      idField: "id",
    }).pipe(
      map((d: any) => {
        if (!d) throw new Error("Error! This Spot does not exist.");
        return new Spot(spotId, d as SpotSchema, locale);
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
    const observables = tiles.map((tile) => {
      // console.debug("Getting spots for tile: ", tile);

      return collectionData(
        query(
          collection(this.firestore, "spots"),
          where("tile_coordinates.z16.x", "==", tile.x),
          where("tile_coordinates.z16.y", "==", tile.y)
        ),
        { idField: "id" }
      ).pipe(
        take(1),
        map((arr: any[]) =>
          arr.map(
            (docObj) =>
              new Spot(
                (docObj as any).id as SpotId,
                docObj as SpotSchema,
                locale
              )
          )
        )
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

  getSpotClusterTiles(
    tiles: MapTileKey[]
  ): Observable<SpotClusterTileSchema[]> {
    const observables = tiles.map((tile) => {
      // Use AngularFire docData to get typed doc observable and take one emission
      console.debug("Getting spot cluster tile for tile: ", tile);
      return docData(doc(this.firestore, "spot_clusters", tile), {
        idField: "id",
      }).pipe(
        take(1),
        map((d: any) => {
          if (!d) return [] as SpotClusterTileSchema[];
          // docData returns the document data — convert to the expected array shape
          return [d as SpotClusterTileSchema];
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
