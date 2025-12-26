import { Injectable, runInInjectionContext } from "@angular/core";
import {
  Firestore,
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
} from "@angular/fire/firestore";
import { SpotReviewSchema } from "../../../../db/schemas/SpotReviewSchema";
import { ConsentAwareService } from "../../consent-aware.service";

@Injectable({
  providedIn: "root",
})
export class SpotReviewsService extends ConsentAwareService {
  constructor(private firestore: Firestore) {
    super();
  }

  getSpotReviewById(
    spotId: string,
    reviewId: string
  ): Promise<SpotReviewSchema> {
    return runInInjectionContext(this.injector, () => {
      return getDoc(
        doc(this.firestore, "spots", spotId, "reviews", reviewId)
      ).then((snap) => {
        if (!snap.exists()) {
          return Promise.reject("No review found for this review id.");
        }
        return snap.data() as SpotReviewSchema;
      });
    });
  }

  getSpotReviewsBySpotId(spotId: string): Promise<SpotReviewSchema[]> {
    console.log("getting all reviews for a spot");
    return runInInjectionContext(this.injector, () => {
      return getDocs(
        query(collection(this.firestore, "spots", spotId, "reviews"))
      ).then((snap) => {
        if (snap.size == 0) {
          return [];
        }
        return snap.docs.map((data) => data.data() as SpotReviewSchema);
      });
    });
  }

  getSpotReviewsByUserId(userId: string): Promise<SpotReviewSchema> {
    console.log("getting all reviews for a user");
    return runInInjectionContext(this.injector, () => {
      return getDocs(
        query(
          collection(this.firestore, "reviews"),
          where("userId", "==", userId)
        )
      );
    }).then((snap) => {
      if (snap.size == 0) {
        return Promise.reject("No reviews found for this user id.");
      }
      return snap.docs[0].data() as SpotReviewSchema;
    });
  }

  updateSpotReview(review: SpotReviewSchema) {
    const spot_id: string = review.spot.id;
    const user_id: string = review.user.uid;

    this.trackEventWithConsent("Add/update Spot Review", {
      props: { spotId: spot_id },
    });

    return runInInjectionContext(this.injector, () => {
      return setDoc(
        doc(this.firestore, "spots", spot_id, "reviews", user_id),
        review
      );
    });
  }
}
