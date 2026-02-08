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
  const boundsOnly = args.includes("--bounds-only");

  console.log(
    `🚀 Starting Force Sync (All Spots)${mediaOnly ? " [Media Only]" : ""}${
      boundsOnly ? " [Bounds Only]" : ""
    }...`
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
          !data["media"] ||
          !Array.isArray(data["media"]) ||
          data["media"].length === 0
        ) {
          return;
        }
      }

      // If bounds-only mode is on, skip spots without bounds
      if (boundsOnly) {
        if (
          !data["bounds"] ||
          !Array.isArray(data["bounds"]) ||
          data["bounds"].length < 3
        ) {
          return;
        }
      }

      const updateData: any = {
        _force_sync: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Check and fix bounds if they exist
      // Some spots have bounds stored as plain objects instead of GeoPoints
      if (data["bounds"] && Array.isArray(data["bounds"])) {
        let boundsModified = false;
        const fixedBounds = data["bounds"].map((point: any) => {
          // Check if it's already a proper GeoPoint
          if (point instanceof admin.firestore.GeoPoint) {
            return point;
          }

          // Try to extract lat/lng from various formats
          const lat = point.latitude ?? point._latitude ?? point.lat;
          const lng = point.longitude ?? point._longitude ?? point.lng;

          if (typeof lat === "number" && typeof lng === "number") {
            // It's a plain object looking like a geopoint, convert it
            boundsModified = true;
            return new admin.firestore.GeoPoint(lat, lng);
          }

          return point; // Keep original if we can't parse (unlikely for valid data)
        });

        if (boundsModified) {
          console.log(`🔧 Fixing bounds for spot ${doc.id}`);
          updateData["bounds"] = fixedBounds;
        }
      }

      batch.update(doc.ref, updateData);
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
