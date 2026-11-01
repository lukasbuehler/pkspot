import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

// Keep the callable name for older admin clients, but fail closed. The former
// exact-path comparison treated resized derivatives as unreferenced, and could
// delete approved uploads whose Spot attachment had been lost to a write race.
// The read-only audit separates those recovery candidates from deliberate
// removals; absence from a current gallery alone must never authorize deletion.
export const cleanupAllOrphanedMedia = onCall(
  { region: "europe-west1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    const user = await getFirestore().doc(`users/${uid}`).get();
    if (user.get("is_admin") !== true) {
      throw new HttpsError("permission-denied", "Admin access required.");
    }
    throw new HttpsError(
      "failed-precondition",
      "Automatic media deletion is disabled. Review the read-only media reference audit first."
    );
  }
);
