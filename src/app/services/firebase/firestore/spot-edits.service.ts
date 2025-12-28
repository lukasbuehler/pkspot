import { inject, Injectable, runInInjectionContext } from "@angular/core";
import {
  Firestore,
  doc,
  addDoc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  collectionGroup,
  updateDoc,
  collectionData,
  docData,
  Timestamp,
} from "@angular/fire/firestore";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { SpotEditSchema } from "../../../../db/schemas/SpotEditSchema";
import { ConsentAwareService } from "../../consent-aware.service";
import {
  removeUndefinedProperties,
  cleanDataForFirestore,
} from "../../../../scripts/Helpers";
import { SpotId, SpotSchema } from "../../../../db/schemas/SpotSchema";
import { UserReferenceSchema } from "../../../../db/schemas/UserSchema";
import { AnyMedia } from "../../../../db/models/Media";
import { MediaSchema } from "../../../../db/schemas/Media";

@Injectable({
  providedIn: "root",
})
export class SpotEditsService extends ConsentAwareService {
  private firestore: Firestore = inject(Firestore);

  constructor() {
    super();
  }

  getSpotEditById(spotId: string, editId: string): Promise<SpotEditSchema> {
    return getDoc(doc(this.firestore, "spots", spotId, "edits", editId)).then(
      (snap) => {
        if (!snap.exists()) {
          return Promise.reject("No edit found for this edit id.");
        }
        return snap.data() as SpotEditSchema;
      }
    );
  }

  getSpotEditsBySpotId(spotId: string): Promise<SpotEditSchema[]> {
    console.log("getting all edits for a spot");
    return getDocs(
      query(collection(this.firestore, "spots", spotId, "edits"))
    ).then((snap) => {
      if (snap.size == 0) {
        return [];
      }
      return snap.docs.map((data) => data.data() as SpotEditSchema);
    });
  }

  getSpotEditsByUserId(userId: string): Promise<SpotEditSchema[]> {
    console.log("getting all edits for a user");
    return getDocs(
      query(
        collectionGroup(this.firestore, "edits"),
        where("user.uid", "==", userId)
      )
    ).then((snap) => {
      if (snap.size == 0) {
        return [];
      }
      return snap.docs.map((data) => data.data() as SpotEditSchema);
    });
  }

  getSpotEditById$(spotId: string, editId: string): Observable<SpotEditSchema> {
    console.debug("Getting edit with id: ", editId);
    return runInInjectionContext(this.injector, () => {
      return docData(doc(this.firestore, "spots", spotId, "edits", editId), {
        idField: "id",
      }).pipe(
        map((d: any) => {
          if (!d) throw new Error("No edit found for this edit id.");
          return d as SpotEditSchema;
        })
      );
    });
  }

  getSpotEditsBySpotId$(
    spotId: string
  ): Observable<Array<{ id: string; schema: SpotEditSchema }>> {
    console.debug("Getting all edits for spot: ", spotId);

    return collectionData(
      query(collection(this.firestore, "spots", spotId, "edits")),
      { idField: "id" }
    ).pipe(
      map((arr: any[]) =>
        arr.map((d) => ({
          id: (d as any).id,
          schema: d as any as SpotEditSchema,
        }))
      )
    );
  }

  getSpotEditsByUserId$(userId: string): Observable<SpotEditSchema[]> {
    console.debug("Getting all edits for user: ", userId);

    return collectionData(
      query(
        collectionGroup(this.firestore, "edits"),
        where("user.uid", "==", userId)
      ),
      { idField: "id" }
    ).pipe(map((arr: any[]) => arr.map((d) => d as SpotEditSchema)));
  }

  addSpotEdit(spotId: string, edit: SpotEditSchema): Promise<string> {
    const cleanEdit = removeUndefinedProperties(edit) as SpotEditSchema;

    // Check if the edit data is empty - if so, don't create an edit
    if (!cleanEdit.data || Object.keys(cleanEdit.data).length === 0) {
      console.warn("Skipping empty edit for spot", spotId);
      return Promise.reject(
        new Error("Cannot create an edit with no data changes")
      );
    }

    this.trackEventWithConsent("Add Spot Edit", {
      props: { spotId: spotId },
    });

    return addDoc(
      collection(this.firestore, "spots", spotId, "edits"),
      cleanEdit
    ).then((docRef) => {
      return docRef.id;
    });
  }

  updateSpotEdit(
    spotId: string,
    editId: string,
    editData: Partial<SpotEditSchema>
  ): Promise<void> {
    const cleanEditData = removeUndefinedProperties(editData);

    console.log("updating edit", editId);

    return updateDoc(
      doc(this.firestore, "spots", spotId, "edits", editId),
      cleanEditData
    );
  }

  approveSpotEdit(spotId: string, editId: string): Promise<void> {
    console.log("approving edit", editId);

    return updateDoc(doc(this.firestore, "spots", spotId, "edits", editId), {
      approved: true,
    });
  }

  rejectSpotEdit(spotId: string, editId: string): Promise<void> {
    console.log("rejecting edit", editId);

    return updateDoc(doc(this.firestore, "spots", spotId, "edits", editId), {
      approved: false,
    });
  }

  /**
   * Remove forbidden fields from spot data that should not be in edits.
   * These are metadata, computed, and system fields that should only be set by cloud functions.
   */
  private _removeForbiddenFieldsFromSpotData(
    spotData: Partial<SpotSchema>
  ): Partial<SpotSchema> {
    // Only these fields are allowed in spot edits according to SpotEditDataSchema
    const fieldsToRemove: (keyof SpotSchema)[] = [
      // Metadata fields (should not be in edits)
      "rating",
      "num_reviews",
      "rating_histogram",
      "highlighted_reviews",
      // Computed fields (calculated server-side)
      "tile_coordinates",
      "is_iconic",
      "address",
      "top_challenges",
      "num_challenges",
      // System fields
      "isMiniSpot",
      "time_created",
      "time_updated",
      "isReported",
      "reportReason",
    ];
    return cleanDataForFirestore(
      spotData,
      fieldsToRemove as string[]
    ) as Partial<SpotSchema>;
  }

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
    // Convert AnyMedia to MediaSchema using the getData() method
    const mediaSchema: SpotSchema["media"] = media.map((mediaObj) =>
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
    return this.addSpotEdit(spotId, editData);
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
    const editData = {
      type: "UPDATE" as const,
      timestamp: Timestamp.now(),
      likes: 0,
      approved: false,
      user: userReference,
      data: { external_references: externalReferences },
    };
    return this.addSpotEdit(spotId, editData);
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
    const editData = {
      type: "UPDATE" as const,
      timestamp: Timestamp.now(),
      likes: 0,
      approved: false,
      user: userReference,
      data: { media: [mediaItem] }, // Note: Cloud function will need to handle appending
    };
    return this.addSpotEdit(spotId, editData);
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
    // Clean and filter the data before creating the edit
    spotData = this._removeForbiddenFieldsFromSpotData(spotData);
    spotData = cleanDataForFirestore(spotData) as Partial<SpotSchema>;

    console.debug("Creating new spot with edit:", JSON.stringify(spotData));

    // Create an empty spot document (let Firestore generate the ID)
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
    // Convert GeoPoint to plain object for native compatibility
    if (spotData.location) {
      spotData.location = this._convertGeoPointToPlainObject(
        spotData.location
      ) as any;
    }

    const editData = {
      type: "CREATE" as const,
      timestamp: Timestamp.now(),
      user: userReference,
      data: spotData,
    };
    return this.addSpotEdit(spotId, editData);
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
  createSpotUpdateEdit(
    spotId: SpotId,
    spotUpdateData: Partial<SpotSchema>,
    userReference: UserReferenceSchema,
    prevData?: Partial<SpotSchema>
  ): Promise<string> {
    spotUpdateData = this._removeForbiddenFieldsFromSpotData(spotUpdateData);
    // Clean the data to remove undefined values and convert class instances
    spotUpdateData = cleanDataForFirestore(
      spotUpdateData
    ) as Partial<SpotSchema>;
    if (prevData) {
      prevData = cleanDataForFirestore(prevData) as Partial<SpotSchema>;
    }

    // Convert GeoPoint to plain object for native compatibility
    if (spotUpdateData.location) {
      spotUpdateData.location = this._convertGeoPointToPlainObject(
        spotUpdateData.location
      ) as any;
    }
    if (prevData && prevData.location) {
      prevData.location = this._convertGeoPointToPlainObject(
        prevData.location
      ) as any;
    }

    const editData = {
      type: "UPDATE" as const,
      timestamp: Timestamp.now(),
      user: userReference,
      data: spotUpdateData,
      prevData: prevData,
    };
    return this.addSpotEdit(spotId, editData);
  }

  /**
   * Helper to convert a GeoPoint (or similar object) to a plain JSON object { latitude, longitude }.
   * This ensures safe serialization on native devices where GeoPoint might fail.
   */
  private _convertGeoPointToPlainObject(location: any): {
    latitude: number;
    longitude: number;
  } {
    // If it's already a plain object with the right keys, return it
    if (
      typeof location.latitude === "number" &&
      typeof location.longitude === "number" &&
      !location.toJSON // GeoPoint usually has methods
    ) {
      return { latitude: location.latitude, longitude: location.longitude };
    }

    // Attempt to extract latitude/longitude
    let lat: number | undefined;
    let lng: number | undefined;

    if (typeof location.latitude === "number") lat = location.latitude;
    else if (typeof location._lat === "number") lat = location._lat;
    else if (typeof location.lat === "number") lat = location.lat;
    else if (typeof location.lat === "function") lat = location.lat();

    if (typeof location.longitude === "number") lng = location.longitude;
    else if (typeof location._long === "number") lng = location._long;
    else if (typeof location.lng === "number") lng = location.lng;
    else if (typeof location.lng === "function") lng = location.lng();

    if (lat !== undefined && lng !== undefined) {
      return { latitude: lat, longitude: lng };
    }

    // Fallback: return as is (might be null or unknown format)
    return location;
  }
}
