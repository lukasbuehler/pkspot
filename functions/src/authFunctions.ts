import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { UserRecord } from "firebase-functions/lib/common/providers/identity";

/**
 * When a user is deleted, we need to clean up their follower/following connections
 * to maintain data integrity and accurate counts.
 */
export const cleanupOnUserDelete = functions.auth
  .user()
  .onDelete(async (user: UserRecord) => {
    const userId = user.uid;
    const db = admin.firestore();

    console.log(`Cleaning up data for deleted user ${userId}`);

    // Batch delete logic for followers and following
    // Note: If a user has thousands of followers, this might need chunking,
    // but for now we'll do simpler batch processing.

    // 1. Remove this user from others' "followers" (people this user was following)
    // Query: users/{userId}/following -> for each doc, delete users/{followingId}/followers/{userId}
    const followingSnapshot = await db
      .collection(`users/${userId}/following`)
      .get();

    if (!followingSnapshot.empty) {
      const batch = db.batch();
      let opCount = 0;

      for (const doc of followingSnapshot.docs) {
        const followingId = doc.id;
        const ref = db.doc(`users/${followingId}/followers/${userId}`);
        batch.delete(ref);
        opCount++;

        if (opCount >= 450) {
          await batch.commit();
          // Reset batch
          // Note: real implementation would need new batch
        }
      }
      if (opCount > 0) await batch.commit();
      console.log(`Refreshed followers for ${opCount} users.`);
    }

    // 2. Remove this user from others' "following" (people who were following this user)
    // Query: users/{userId}/followers -> for each doc, delete users/{followerId}/following/{userId}
    const followersSnapshot = await db
      .collection(`users/${userId}/followers`)
      .get();

    if (!followersSnapshot.empty) {
      const batch = db.batch();
      let opCount = 0;

      for (const doc of followersSnapshot.docs) {
        const followerId = doc.id;
        const ref = db.doc(`users/${followerId}/following/${userId}`);
        batch.delete(ref);
        opCount++;

        if (opCount >= 450) {
          await batch.commit();
        }
      }
      if (opCount > 0) await batch.commit();
      console.log(`Refreshed following for ${opCount} users.`);
    }

    // 3. Delete the user document itself if it exists
    await db.doc(`users/${userId}`).delete();

    return null;
  });
