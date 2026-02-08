import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

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
