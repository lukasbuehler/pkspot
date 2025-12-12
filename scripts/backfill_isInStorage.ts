import admin from "firebase-admin";

// Initialize Firebase Admin SDK
// This will use GOOGLE_APPLICATION_CREDENTIALS env var or default credentials
const app = admin.initializeApp({
  projectId: "parkour-base-project",
});

const FIREBASE_STORAGE_DOMAIN = "firebasestorage.googleapis.com";

/**
 * Checks if a media URL is from Firebase Storage
 */
function isFirebaseStorageUrl(src: string): boolean {
  return src.includes(FIREBASE_STORAGE_DOMAIN);
}

async function backfillIsInStorage() {
  const db = admin.firestore();
  const spotsRef = db.collection("spots");
  const batchSize = 400; // Batch limit is 500

  let lastDoc = null;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalMediaChecked = 0;
  let totalMediaUpdated = 0;

  console.log("🚀 Starting isInStorage Backfill...");

  while (true) {
    let query = spotsRef.limit(batchSize);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      console.log("✅ All documents processed.");
      break;
    }

    const batch = db.batch();
    let spotsInThisBatch = 0;

    snapshot.docs.forEach((doc) => {
      const spotData = doc.data();
      const media = spotData["media"] as Array<{
        src: string;
        isInStorage?: boolean;
      }>;

      if (!media || !Array.isArray(media)) {
        return; // Skip if no media array
      }

      let needsUpdate = false;
      const updatedMedia = media.map((mediaItem) => {
        totalMediaChecked++;

        // Check if this media is from Firebase Storage
        if (isFirebaseStorageUrl(mediaItem.src)) {
          // If isInStorage is not set or is false, we need to update it
          if (mediaItem.isInStorage !== true) {
            totalMediaUpdated++;
            needsUpdate = true;
            return {
              ...mediaItem,
              isInStorage: true,
            };
          }
        }

        return mediaItem;
      });

      if (needsUpdate) {
        spotsInThisBatch++;
        batch.update(doc.ref, {
          media: updatedMedia,
        });
      }
    });

    if (spotsInThisBatch > 0) {
      await batch.commit();
      totalUpdated += spotsInThisBatch;
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    totalProcessed += snapshot.docs.length;
    console.log(
      `✨ Processed ${totalProcessed} spots | Updated ${totalUpdated} spots | Checked ${totalMediaChecked} media items | Updated ${totalMediaUpdated} media items...`
    );

    // Optional: Sleep a tiny bit to not kill your rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n📊 Final Statistics:");
  console.log(`Total spots processed: ${totalProcessed}`);
  console.log(`Total spots updated: ${totalUpdated}`);
  console.log(`Total media items checked: ${totalMediaChecked}`);
  console.log(`Total media items updated: ${totalMediaUpdated}`);
}

backfillIsInStorage().catch(console.error);
