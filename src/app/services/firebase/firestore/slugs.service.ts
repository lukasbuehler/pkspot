import { Injectable } from "@angular/core";
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
import { SpotSlug } from "../../../../db/models/Interfaces";
import { SpotId } from "../../../../db/schemas/SpotSchema";

@Injectable({
  providedIn: "root",
})
export class SlugsService {
  constructor(private firestore: Firestore) {}

  addSpotSlug(spotId: string, slug: string): Promise<void> {
    // validate that the slug only contains alphanumeric characters and hyphens
    if (!slug.match(/^[a-z0-9-]+$/))
      return Promise.reject(
        "The slug must only contain lowercase alphanumeric characters and hyphens."
      );

    const data: SpotSlug = {
      spotId: spotId,
    };

    return setDoc(doc(this.firestore, "spot_slugs", slug), data);
  }

  getAllSlugsForASpot(spotId: string): Promise<string[]> {
    console.log("getting all slugs for a spot");
    return getDocs(
      query(
        collection(this.firestore, "spot_slugs"),
        where("spotId", "==", spotId)
      )
    ).then((snap) => {
      if (snap.size == 0) {
        return [];
      }
      return snap.docs.map((data) => data.id);
    });
  }

  getSpotIdFromSpotSlug(slug: SpotSlug): Promise<SpotId> {
    const slugString: string = slug.toString();

    return getDoc(doc(this.firestore, "spot_slugs", slugString))
      .then((snap) => {
        if (!snap.exists()) {
          return Promise.reject("No spot found for this slug.");
        }
        return snap.data() as SpotSlug;
      })
      .then((data) => data.spotId as SpotId);
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
        return data.fields.spotId.stringValue as SpotId;
      });
  }
}
