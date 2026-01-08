import { Injectable, inject } from "@angular/core";
import { SpotReviewSchema } from "../../../../db/schemas/SpotReviewSchema";
import { ConsentAwareService } from "../../consent-aware.service";
import {
  FirestoreAdapterService,
  QueryFilter,
} from "../firestore-adapter.service";

@Injectable({
  providedIn: "root",
})
export class SpotReviewsService extends ConsentAwareService {
  private _firestoreAdapter = inject(FirestoreAdapterService);

  constructor() {
    super();
  }

  getSpotReviewById(
    spotId: string,
    reviewId: string
  ): Promise<SpotReviewSchema> {
    return this._firestoreAdapter
      .getDocument<SpotReviewSchema & { id: string }>(
        `spots/${spotId}/reviews/${reviewId}`
      )
      .then((data) => {
        if (!data) {
          return Promise.reject("No review found for this review id.");
        }
        return data as SpotReviewSchema;
      });
  }

  getSpotReviewsBySpotId(spotId: string): Promise<SpotReviewSchema[]> {
    console.log("getting all reviews for a spot");
    return this._firestoreAdapter
      .getCollection<SpotReviewSchema & { id: string }>(
        `spots/${spotId}/reviews`
      )
      .then((docs) => {
        if (docs.length === 0) {
          return [];
        }
        return docs as SpotReviewSchema[];
      });
  }

  getSpotReviewsByUserId(userId: string): Promise<SpotReviewSchema> {
    console.log("getting all reviews for a user");
    const filters: QueryFilter[] = [
      { fieldPath: "userId", opStr: "==", value: userId },
    ];

    return this._firestoreAdapter
      .getCollection<SpotReviewSchema & { id: string }>("reviews", filters)
      .then((docs) => {
        if (docs.length === 0) {
          return Promise.reject("No reviews found for this user id.");
        }
        return docs[0] as SpotReviewSchema;
      });
  }

  updateSpotReview(review: SpotReviewSchema) {
    const spot_id: string = review.spot.id;
    const user_id: string = review.user.uid;

    this.trackEventWithConsent("Add/update Spot Review", {
      props: { spotId: spot_id },
    });

    return this._firestoreAdapter.setDocument(
      `spots/${spot_id}/reviews/${user_id}`,
      review
    );
  }
}
