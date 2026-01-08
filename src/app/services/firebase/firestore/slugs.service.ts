import { Injectable, inject } from "@angular/core";
import { SpotSlugSchema } from "../../../../db/schemas/SpotSlugSchema";
import { SpotId } from "../../../../db/schemas/SpotSchema";
import { ConsentAwareService } from "../../consent-aware.service";
import {
  FirestoreAdapterService,
  QueryFilter,
} from "../firestore-adapter.service";

@Injectable({
  providedIn: "root",
})
export class SlugsService extends ConsentAwareService {
  private _firestoreAdapter = inject(FirestoreAdapterService);

  constructor() {
    super();
  }

  addSpotSlug(spotId: string, slug: string): Promise<void> {
    // validate that the slug only contains alphanumeric characters and hyphens
    if (!slug.match(/^[a-z0-9-]+$/))
      return Promise.reject(
        "The slug must only contain lowercase alphanumeric characters and hyphens."
      );

    // Ensure this spot doesn't already have a slug
    const filters: QueryFilter[] = [
      { fieldPath: "spot_id", opStr: "==", value: spotId },
    ];

    return this._firestoreAdapter
      .getCollection<SpotSlugSchema & { id: string }>("spot_slugs", filters)
      .then((existingSlugs) => {
        if (existingSlugs.length > 0) {
          return Promise.reject("A custom URL already exists for this spot.");
        }
      })
      .then(() =>
        this._firestoreAdapter.getDocument<SpotSlugSchema & { id: string }>(
          `spot_slugs/${slug}`
        )
      )
      .then((existingDoc) => {
        if (existingDoc) {
          // If already mapped to same spot, treat as success; otherwise reject to avoid overwrite
          const existingSpotId: string | undefined = existingDoc.spot_id;
          if (existingSpotId === spotId) return; // no-op
          return Promise.reject(
            "This URL is already taken. Please choose another."
          );
        }
        const data: SpotSlugSchema = {
          spot_id: spotId,
        };
        return this._firestoreAdapter.setDocument(`spot_slugs/${slug}`, data);
      });
  }

  getAllSlugsForASpot(spotId: string): Promise<string[]> {
    const filters: QueryFilter[] = [
      { fieldPath: "spot_id", opStr: "==", value: spotId },
    ];

    return this._firestoreAdapter
      .getCollection<SpotSlugSchema & { id: string }>("spot_slugs", filters)
      .then((docs) => {
        if (!docs || docs.length === 0) return [];
        return docs.map((d) => d.id);
      });
  }

  getSpotIdFromSpotSlug(slug: string): Promise<SpotId> {
    const slugString: string = slug.toString();

    return this._firestoreAdapter
      .getDocument<SpotSlugSchema & { id: string }>(`spot_slugs/${slugString}`)
      .then((data) => {
        if (!data) {
          return Promise.reject("No spot found for this slug.");
        }
        return data.spot_id as SpotId;
      });
  }

  getSpotIdFromSpotSlugHttp(slug: string): Promise<SpotId> {
    return fetch(
      `https://firestore.googleapis.com/v1/projects/parkour-base-project/databases/(default)/documents/spot_slugs/${slug}`
    )
      .then((response) => response.json())
      .then((data) => {
        if (!data.fields) {
          return Promise.reject("No spot found for this slug.");
        }
        const fields: any = data.fields;
        return fields.spot_id.stringValue as SpotId;
      });
  }
}
