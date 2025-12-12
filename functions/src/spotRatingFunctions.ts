import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

import { SpotReviewSchema } from "../../src/db/schemas/SpotReviewSchema";

export const computeRatingOnWrite = onDocumentWritten(
  "spots/{spotId}/reviews/{reviewId}",
  async (event) => {
    const spotId = event.params.spotId;

    const spotRef = admin.firestore().collection("spots").doc(spotId);

    return spotRef
      .collection("reviews")
      .get()
      .then((snapshot) => {
        let ratingSum = 0;
        let ratingHistogram = {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0,
        };

        snapshot.forEach((doc) => {
          const rating: 1 | 2 | 3 | 4 | 5 = (doc.data() as SpotReviewSchema)
            .rating as 1 | 2 | 3 | 4 | 5;
          ratingSum += rating;
          ratingHistogram[rating]++;
        });

        const rating = ratingSum / snapshot.size;

        return spotRef.update({
          rating: rating, // value between 1 and 5
          num_reviews: snapshot.size,
          rating_histogram: ratingHistogram,
        });
      });
  }
);
