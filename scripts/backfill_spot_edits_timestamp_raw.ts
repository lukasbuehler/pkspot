import admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
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

async function backfillSpotEditsTimestampRaw() {
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

  console.log(
    "Starting backfill of timestamp_raw_ms in spot edits (collection group)..."
  );

  // Use collection group query to find ALL "edits" subcollections
  const editsGroupRef = db.collectionGroup("edits");

  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let processedCount = 0;
  let updatedCount = 0;

  while (true) {
    // Pagination for collection group queries
    let query = editsGroupRef.limit(500);
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
      const timestamp = data["timestamp"]; // Timestamp
      const timestampRaw = data["timestamp_raw_ms"];

      // Check if we need to update
      if (timestamp && typeof timestampRaw === "undefined") {
        let ms: number | undefined;

        // Determine milliseconds
        if (timestamp instanceof Timestamp) {
          ms = timestamp.toMillis();
        } else if (timestamp && typeof timestamp.seconds === "number") {
          // Handle if it's already a plain object
          ms = timestamp.seconds * 1000;
        }

        if (ms !== undefined) {
          batch.update(doc.ref, {
            timestamp_raw_ms: ms,
          });
          batchCount++;
          updatedCount++;
        } else {
          console.warn(
            `Could not parse timestamp for edit ${doc.id} (path: ${doc.ref.path}):`,
            timestamp
          );
        }
      }

      lastDoc = doc;
      processedCount++;
    }

    if (batchCount > 0) {
      if (!isDryRun) {
        await batch.commit();
        console.log(
          `Processed ${processedCount} edits, updated ${updatedCount} so far...`
        );
      } else {
        console.log(
          `[DRY RUN] Would update ${batchCount} docs in this batch. Total processed: ${processedCount}`
        );
      }
    } else {
      console.log(
        `Processed ${processedCount} edits, no updates needed in this batch...`
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

backfillSpotEditsTimestampRaw().catch(console.error);
