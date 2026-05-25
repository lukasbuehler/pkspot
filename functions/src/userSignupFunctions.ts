import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

/**
 * Assign a permanent signup number once the public user profile is created.
 * This replaces the old Auth onCreate trigger with a gen 2 Firestore trigger,
 * matching the app's actual account flow where every provider creates
 * `users/{userId}` as the profile source of truth.
 */
export const assignSignupNumberOnCreate = onDocumentCreated(
  "users/{userId}",
  async (event) => {
    const userId = event.params.userId;
    const userData = event.data?.data();

    if (!userData || typeof userData["signup_number"] === "number") {
      return;
    }

    const db = admin.firestore();
    const counterRef = db.doc("counters/users");
    const userRef = db.doc(`users/${userId}`);

    try {
      const signupNumber = await db.runTransaction(async (transaction) => {
        const freshUserDoc = await transaction.get(userRef);
        if (typeof freshUserDoc.data()?.["signup_number"] === "number") {
          return freshUserDoc.data()?.["signup_number"] as number;
        }

        const counterDoc = await transaction.get(counterRef);
        const currentCount = counterDoc.data()?.["signup_count"] || 0;
        const nextNumber = currentCount + 1;

        transaction.set(
          counterRef,
          { signup_count: nextNumber },
          { merge: true }
        );
        transaction.set(userRef, { signup_number: nextNumber }, { merge: true });
        return nextNumber;
      });

      console.log(`Assigned signup number ${signupNumber} to user ${userId}`);
    } catch (error) {
      console.error(`Error assigning signup number to user ${userId}:`, error);
    }
  }
);
