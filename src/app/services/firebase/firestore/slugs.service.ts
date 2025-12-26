import { Injectable, runInInjectionContext } from "@angular/core";
import {
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "@angular/fire/firestore";
import { SpotSlugSchema } from "../../../../db/schemas/SpotSlugSchema";
import { SpotId } from "../../../../db/schemas/SpotSchema";
import { ConsentAwareService } from "../../consent-aware.service";

@Injectable({
  providedIn: "root",
})
export class SlugsService extends ConsentAwareService {
  constructor(private firestore: Firestore) {
    super();
  }

  addSpotSlug(spotId: string, slug: string): Promise<void> {
    // validate that the slug only contains alphanumeric characters and hyphens
    if (!slug.match(/^[a-z0-9-]+$/))
      return Promise.reject(
        "The slug must only contain lowercase alphanumeric characters and hyphens."
      );
    const slugDocRef = doc(this.firestore, "spot_slugs", slug);
    // Ensure this spot doesn't already have a slug
    const q = query(
      collection(this.firestore, "spot_slugs"),
      where("spot_id", "==", spotId)
    );

    return runInInjectionContext(this.injector, () => {
      return getDocs(q)
        .then((snap) => {
          if ((snap?.size ?? 0) > 0) {
            return Promise.reject("A custom URL already exists for this spot.");
          }
        })
        .then(() => getDoc(slugDocRef))
        .then((snap) => {
          if (snap.exists()) {
            // If already mapped to same spot, treat as success; otherwise reject to avoid overwrite
            const existing = snap.data() as any;
            const existingSpotId: string | undefined = existing.spot_id;
            if (existingSpotId === spotId) return; // no-op
            return Promise.reject(
              "This URL is already taken. Please choose another."
            );
          }
          const data: SpotSlugSchema = {
            spot_id: spotId,
          };
          return setDoc(slugDocRef, data);
        });
    });
  }

  getAllSlugsForASpot(spotId: string): Promise<string[]> {
    return runInInjectionContext(this.injector, () => {
      return getDocs(
        query(
          collection(this.firestore, "spot_slugs"),
          where("spot_id", "==", spotId)
        )
      ).then((snap) => {
        if (!snap || snap.size === 0) return [];
        return snap.docs.map((d) => d.id);
      });
    });
  }

  getSpotIdFromSpotSlug(slug: string): Promise<SpotId> {
    const slugString: string = slug.toString();

    return runInInjectionContext(this.injector, () => {
      return getDoc(doc(this.firestore, "spot_slugs", slugString))
        .then((snap) => {
          if (!snap.exists()) {
            return Promise.reject("No spot found for this slug.");
          }
          return snap.data() as any;
        })
        .then((data) => data.spot_id as SpotId);
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
