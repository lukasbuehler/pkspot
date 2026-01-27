import admin from "firebase-admin";

// Initialize Firebase Admin SDK
// This will use GOOGLE_APPLICATION_CREDENTIALS env var or default credentials
const app = admin.initializeApp({
  projectId: "parkour-base-project",
});

async function touchAllSpots() {
  const db = admin.firestore();
  // Iterate ALL spots to ensure everything is synced.
  // Order by document ID for stable pagination.
  const spotsRef = db
    .collection("spots")
    .orderBy(admin.firestore.FieldPath.documentId());
  const batchSize = 400; // Batch limit is 500

  let lastDoc = null;
  let totalProcessed = 0;

  const args = process.argv.slice(2);
  const mediaOnly = args.includes("--media-only");

  console.log(
    `🚀 Starting Force Sync (All Spots)${mediaOnly ? " [Media Only]" : ""}...`
  );

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
    let batchCount = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();

      // If media-only mode is on, skip spots without media
      if (mediaOnly) {
        if (
          !data.media ||
          !Array.isArray(data.media) ||
          data.media.length === 0
        ) {
          return;
        }
      }

      // We update a dummy field to trigger the onWrite events
      // We can also delete it later, but keeping a 'last_synced' timestamp is useful
      batch.update(doc.ref, {
        _force_sync: admin.firestore.FieldValue.serverTimestamp(),
      });
      batchCount++;
    });

    if (batchCount > 0) {
      await batch.commit();
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    totalProcessed += snapshot.docs.length;
    console.log(`✨ Processed ${totalProcessed} spots...`);

    // Optional: Sleep a tiny bit to not kill your Typesense rate limits if you have a small cluster
    await new Promise((r) => setTimeout(r, 500));
  }
}

touchAllSpots().catch(console.error);
