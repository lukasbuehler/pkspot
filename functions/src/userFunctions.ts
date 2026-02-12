import * as admin from "firebase-admin";
import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";

export const onCheckInCreate = onDocumentCreated(
  "users/{userId}/check_ins/{checkInId}",
  async (event) => {
    const userId = event.params.userId;
    const snapshot = event.data;

    if (!snapshot) {
      console.error("No data associated with the event");
      return;
    }

    const checkInData = snapshot.data();
    const spotId = checkInData["spot_id"];

    if (!spotId) {
      console.error(`Check-in ${event.params.checkInId} missing spot_id`);
      return;
    }

    // Write to private_data subcollection instead of the public user document
    const privateDataRef = admin
      .firestore()
      .collection("users")
      .doc(userId)
      .collection("private_data")
      .doc("main");

    try {
      await privateDataRef.set(
        {
          visited_spots: admin.firestore.FieldValue.arrayUnion(spotId),
        },
        { merge: true }
      );
      console.log(`Added spot ${spotId} to visited_spots for user ${userId}`);
    } catch (error) {
      console.error(`Error updating visited_spots for user ${userId}:`, error);
    }
  }
);

export const syncVisitedSpotsCountOnPrivateDataWrite = onDocumentWritten(
  "users/{userId}/private_data/main",
  async (event) => {
    const userId = event.params.userId;
    const afterData = event.data?.after?.data() as
      | { visited_spots?: unknown }
      | undefined;

    const visitedSpotsRaw = Array.isArray(afterData?.visited_spots)
      ? afterData.visited_spots
      : [];
    const visitedSpotsCount = new Set(
      visitedSpotsRaw.filter(
        (spotId): spotId is string =>
          typeof spotId === "string" && spotId.trim().length > 0
      )
    ).size;

    const userRef = admin.firestore().collection("users").doc(userId);
    try {
      await userRef.update({
        visited_spots_count: visitedSpotsCount,
      });
      console.log(
        `Updated visited_spots_count for user ${userId} to ${visitedSpotsCount}`
      );
    } catch (error) {
      console.error(
        `Failed to update visited_spots_count for user ${userId}:`,
        error
      );
    }
  }
);
