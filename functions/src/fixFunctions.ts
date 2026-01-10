import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { GeoPoint } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { SpotSchema } from "./spotHelpers";
import { LocaleCode, LocaleMap } from "../../src/db/models/Interfaces";

/**
 * Fix all spots with the location field that is a map to be a GeoPoint again.
 */
export const fixSpotLocations = onDocumentCreated(
  { document: "spots/run-fix-locations" },
  async (event) => {
    const spots = await admin
      .firestore()
      .collection("spots")
      .where("location", "!=", null)
      .get();

    const batch = admin.firestore().batch();

    spots.docs.forEach((spot) => {
      const location = (spot.data() as SpotSchema).location;
      if (
        location &&
        location.latitude !== undefined &&
        location.longitude !== undefined
      ) {
        const geoPoint = new GeoPoint(location.latitude, location.longitude);
        batch.update(spot.ref, { location: geoPoint });
        console.log("Fixed location for spot", spot.id);
      }
    });

    // commit the batch
    await batch.commit();

    // delete the run document
    return event.data?.ref.delete();
  }
);

function _fixLocaleMaps(
  localeMapObj: any,
  spotIdForWarnings: string
): LocaleMap {
  const fixedLocaleMap: LocaleMap = {};

  if (typeof localeMapObj === "string") {
    fixedLocaleMap["en"] = { text: localeMapObj, provider: "user" };
    console.log("Fixed description for spot:", spotIdForWarnings);
  } else if (typeof localeMapObj === "object") {
    if (Object.keys(localeMapObj).length === 0) {
      console.warn("Empty description for spot:", spotIdForWarnings);
    } else {
      // there are some translations
      // loop over all of them
      for (const [key, value] of Object.entries(localeMapObj) as [
        string,
        any
      ][]) {
        const code: LocaleCode = key as LocaleCode;
        if (!code) {
          console.warn(
            "Invalid locale code on spot description",
            key,
            "spot:",
            spotIdForWarnings
          );
          continue;
        }
        if (typeof value === "string") {
          fixedLocaleMap[code] = { text: value, provider: "user" };
        } else if (typeof value === "object") {
          if (typeof value.text === "string") {
            fixedLocaleMap[code] = {
              text: value.text,
              provider: value.provider || "user",
            };
          } else {
            console.warn(
              "Invalid locale value on spot",
              spotIdForWarnings,
              "locale:",
              code,
              "value:",
              value
            );
          }
        }
      }
    }
  }

  return fixedLocaleMap;
}

export const fixLocaleMaps = onDocumentCreated(
  { document: "spots/run-fix-locale-maps" },
  async (event) => {
    const spots = await admin
      .firestore()
      .collection("spots")
      .where("description", "!=", null)
      .get();

    const batch = admin.firestore().batch();

    spots.docs.forEach((spot) => {
      const spotData: any = spot.data();
      const description = spotData.description;
      const name = spotData.name;

      const newDescription: SpotSchema["description"] = _fixLocaleMaps(
        description,
        spot.id
      );
      const newName: SpotSchema["name"] = _fixLocaleMaps(name, spot.id);

      console.log("Fixed locale maps for spot", spot.id);

      batch.update(spot.ref, { description: newDescription, name: newName });
    });
    try {
      await batch.commit();
    } catch (err) {
      console.error("Error committing batch", err);
      return Promise.reject(err);
    }

    console.log("Done fixing locale maps for all spots");

    return event.data?.ref.delete();
  }
);

/**
 * One-time migration: Backfill signup_number for all existing users.
 * Assigns numbers based on Firebase Auth creation date (earliest = 1).
 * Also sets the counter to the total count so new users get the next number.
 *
 * Trigger by creating a document: db.doc("users/run-backfill-signup-numbers").set({})
 */
export const backfillSignupNumbers = onDocumentCreated(
  { document: "users/run-backfill-signup-numbers" },
  async (event) => {
    const db = admin.firestore();

    try {
      // List all users from Firebase Auth
      const listUsersResult = await admin.auth().listUsers();
      const users = listUsersResult.users;

      console.log(`Found ${users.length} users to backfill`);

      // Sort by creation time (oldest first)
      users.sort((a, b) => {
        const aTime = new Date(a.metadata.creationTime || 0).getTime();
        const bTime = new Date(b.metadata.creationTime || 0).getTime();
        return aTime - bTime;
      });

      // Assign signup numbers
      const batch = db.batch();
      let signupNumber = 1;

      for (const user of users) {
        const userRef = db.doc(`users/${user.uid}`);
        batch.set(userRef, { signup_number: signupNumber }, { merge: true });
        console.log(
          `Assigning signup_number ${signupNumber} to ${
            user.email || user.uid
          } (created: ${user.metadata.creationTime})`
        );
        signupNumber++;
      }

      // Also set the counter so new users start from the right number
      const counterRef = db.doc("counters/users");
      batch.set(counterRef, { signup_count: users.length }, { merge: true });

      await batch.commit();
      console.log(
        `Successfully backfilled ${users.length} users and set counter to ${users.length}`
      );
    } catch (error) {
      console.error("Error backfilling signup numbers:", error);
      throw error;
    }

    // Delete the trigger document
    return event.data?.ref.delete();
  }
);

/**
 * Recalculate user edit stats by counting actual edit documents.
 * Counts: spot_creates_count, spot_edits_count, media_added_count
 * Can be run periodically (monthly) to ensure accuracy.
 *
 * Trigger by creating: db.doc("users/run-recalculate-edit-stats").set({})
 */
export const recalculateUserEditStats = onDocumentCreated(
  { document: "users/run-recalculate-edit-stats" },
  async (event) => {
    const db = admin.firestore();

    try {
      // Query all edits via collection group
      const editsSnapshot = await db.collectionGroup("edits").get();

      console.log(`Found ${editsSnapshot.size} total edits to process`);

      // Aggregate stats per user
      const userStats: Record<
        string,
        { creates: number; edits: number; media: number }
      > = {};

      for (const doc of editsSnapshot.docs) {
        const data = doc.data();
        const userId = data["user"]?.uid;

        if (!userId) {
          console.warn(`Edit ${doc.id} has no user.uid`);
          continue;
        }

        if (!userStats[userId]) {
          userStats[userId] = { creates: 0, edits: 0, media: 0 };
        }

        // Count all edits
        userStats[userId].edits++;

        // Count creates
        if (data["type"] === "CREATE") {
          userStats[userId].creates++;
        }

        // Count media items
        const editData = data["data"];
        if (Array.isArray(editData?.media)) {
          userStats[userId].media += editData.media.length;
        }
      }

      console.log(
        `Aggregated stats for ${Object.keys(userStats).length} users`
      );

      // Write stats to user profiles in batches
      const userIds = Object.keys(userStats);
      const BATCH_SIZE = 450;

      for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const chunk = userIds.slice(i, i + BATCH_SIZE);

        for (const userId of chunk) {
          const stats = userStats[userId];
          const userRef = db.doc(`users/${userId}`);
          batch.set(
            userRef,
            {
              spot_creates_count: stats.creates,
              spot_edits_count: stats.edits,
              media_added_count: stats.media,
            },
            { merge: true }
          );
          console.log(
            `User ${userId}: creates=${stats.creates}, edits=${stats.edits}, media=${stats.media}`
          );
        }

        await batch.commit();
        console.log(`Committed batch ${i / BATCH_SIZE + 1}`);
      }

      console.log("Successfully recalculated edit stats for all users");
    } catch (error) {
      console.error("Error recalculating edit stats:", error);
      throw error;
    }

    // Delete the trigger document
    return event.data?.ref.delete();
  }
);
