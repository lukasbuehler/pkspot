import admin from "firebase-admin";
import { GeoPoint } from "firebase-admin/firestore";
import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Initialize Firebase Admin
const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(require(serviceAccountPath)),
    });
  } catch (error) {
    console.error("Error initializing Firebase Admin SDK:", error);
    process.exit(1);
  }
}

const db = admin.firestore();

async function backfillLocationRaw() {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes("--force");

  if (isDryRun) {
    console.log(
      "Running in DRY RUN mode. Use --force to apply changes to the database."
    );
  } else {
    console.warn(
      "WARNING: Running in LIVE mode. Changes WILL be applied to the database."
    );
    console.log("Starting in 5 seconds...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  console.log("Starting backfill of location_raw...");

  const spotsRef = db.collection("spots");
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let processedCount = 0;
  let updatedCount = 0;

  while (true) {
    let query = spotsRef.limit(500);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      // Fix TS4111 by using bracket notation
      const location = data["location"];
      const location_raw = data["location_raw"];

      // Check if we need to update
      if (location && !location_raw) {
        // Location is a GeoPoint
        let lat: number | undefined;
        let lng: number | undefined;

        if (
          location instanceof GeoPoint ||
          (location._latitude !== undefined &&
            location._longitude !== undefined)
        ) {
          lat = location.latitude ?? location._latitude;
          lng = location.longitude ?? location._longitude;
        } else if (
          typeof location.latitude === "number" &&
          typeof location.longitude === "number"
        ) {
          // It might be a plain object looking like geopoint
          lat = location.latitude;
          lng = location.longitude;
        }

        if (lat !== undefined && lng !== undefined) {
          batch.update(doc.ref, {
            location_raw: { lat, lng },
          });
          batchCount++;
          updatedCount++;
        } else {
          console.warn(
            `[WARNING] Spot ${doc.id} has location field but could not extract lat/lng:`,
            JSON.stringify(location)
          );
        }
      } else if (!location) {
        console.warn(`[WARNING] Spot ${doc.id} is missing 'location' field.`);
      }

      lastDoc = doc;
      processedCount++;
    }

    if (batchCount > 0) {
      if (!isDryRun) {
        await batch.commit();
        console.log(
          `Processed ${processedCount} spots, updated ${updatedCount} so far...`
        );
      } else {
        console.log(
          `[DRY RUN] Would update ${batchCount} docs in this batch. Total processed: ${processedCount}`
        );
      }
    } else {
      console.log(
        `Processed ${processedCount} spots, no updates needed in this batch...`
      );
    }
  }

  console.log("Backfill complete.");
  console.log(`Total processed: ${processedCount}`);
  console.log(`Total updated: ${updatedCount}`);

  if (isDryRun) {
    console.log("NOTE: This was a DRY RUN. No changes were applied.");
    console.log("Run with --force to apply changes.");
  }
}

backfillLocationRaw().catch(console.error);
