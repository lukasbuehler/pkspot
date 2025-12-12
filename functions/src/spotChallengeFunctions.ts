import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { SpotChallengeSchema } from "../../src/db/schemas/SpotChallengeSchema";

export const setTopChallengesForSpotOnWrite = onDocumentWritten(
  "spots/{spotId}/challenges/{challengeId}",
  async (event) => {
    const spotId = event.params.spotId;

    const spotRef = admin.firestore().collection("spots").doc(spotId);

    return spotRef
      .collection("challenges")
      .get()
      .then((snapshot) => {
        const topChallenges = snapshot.docs
          .filter((doc) => {
            // only keep if the release date is in the past if it has one
            const data = doc.data() as SpotChallengeSchema;
            const releaseDate: Timestamp | null = data.release_date ?? null;
            const isReleased =
              !releaseDate || Date.now() >= releaseDate.toDate().getTime();
            const hasMedia = !!data["media"];

            return isReleased && hasMedia;
          })
          .sort((docA, docB) => {
            const a = docA.data() as SpotChallengeSchema;
            const b = docB.data() as SpotChallengeSchema;
            return (b.num_posts ?? 0) - (a.num_posts ?? 0);
          })
          .sort((docA, docB) => {
            const a = docA.data() as SpotChallengeSchema;
            const b = docB.data() as SpotChallengeSchema;
            if (a.is_completed && !b.is_completed) {
              return -1;
            } else if (!a["is_completed"] && b["is_completed"]) {
              return 1;
            }
            return 0;
          })
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              name: data["name"],
              media: data["media"],
              location: data["location"] ?? undefined,
            };
          })
          .slice(0, 3); // Get top 3 challenges

        // filter out all key-value pairs where value is undefined
        topChallenges.forEach((challenge) => {
          for (const key of Object.keys(
            challenge
          ) as (keyof typeof challenge)[]) {
            if (challenge[key] === undefined) {
              delete challenge[key];
            }
          }
        });

        return spotRef.update({
          top_challenges: topChallenges,
          num_challenges: snapshot.size,
        });
      });
  }
);
