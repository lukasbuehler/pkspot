/**
 * Fix Spot Types Script
 *
 * Fixes imported spots that have hyphenated type values (e.g., "parkour-park")
 * to use space-separated values (e.g., "parkour park") matching the SpotTypes enum.
 *
 * Usage:
 *   ./scripts/fix_spot_types_runner.sh           # Run the fix
 *   ./scripts/fix_spot_types_runner.sh --dry-run # Preview changes without updating
 */

import admin from "firebase-admin";

// Initialize Firebase Admin SDK
const app = admin.initializeApp({
  projectId: "parkour-base-project",
});

/**
 * Mapping of wrong hyphenated types to correct space-separated types
 * Based on SpotTypes enum values
 */
const TYPE_FIXES: Record<string, string> = {
  "parkour-park": "parkour park",
  "parkour-gym": "parkour gym",
  "trampoline-park": "trampoline park",
  "gymnastics-gym": "gymnastics gym",
  "urban-landscape": "urban landscape",
  "natural-landscape": "natural landscape",
  "university-campus": "university campus",
  "roof-gap": "roof gap",
  "skate-park": "skate park",
};

/**
 * Mapping of wrong access values to correct ones
 * Note: "off-limits" is already correct in SpotAccess enum
 * "public" is also correct
 */
const ACCESS_FIXES: Record<string, string> = {
  // Add any access fixes here if needed
  // e.g., "off_limits": "off-limits"
};

async function fixSpotTypes(dryRun: boolean = false) {
  const db = admin.firestore();
  const spotsRef = db.collection("spots");
  const batchSize = 400; // Batch limit is 500

  let lastDoc = null;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let typeFixesApplied = 0;
  let accessFixesApplied = 0;

  console.log(
    dryRun
      ? "🔍 Starting Dry Run (no changes will be made)..."
      : "🚀 Starting Spot Types Fix..."
  );
  console.log("");

  while (true) {
    let query: FirebaseFirestore.Query = spotsRef.limit(batchSize);
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

    for (const doc of snapshot.docs) {
      const spotData = doc.data();
      const currentType = spotData["type"] as string | undefined;
      const currentAccess = spotData["access"] as string | undefined;

      const updates: Record<string, string> = {};

      // Check if type needs fixing
      if (currentType && TYPE_FIXES[currentType]) {
        updates["type"] = TYPE_FIXES[currentType];
        typeFixesApplied++;
        if (dryRun) {
          console.log(
            `  📝 [${doc.id}] type: "${currentType}" → "${TYPE_FIXES[currentType]}"`
          );
        }
      }

      // Check if access needs fixing
      if (currentAccess && ACCESS_FIXES[currentAccess]) {
        updates["access"] = ACCESS_FIXES[currentAccess];
        accessFixesApplied++;
        if (dryRun) {
          console.log(
            `  🔐 [${doc.id}] access: "${currentAccess}" → "${ACCESS_FIXES[currentAccess]}"`
          );
        }
      }

      if (Object.keys(updates).length > 0) {
        spotsInThisBatch++;
        if (!dryRun) {
          batch.update(doc.ref, updates);
        }
      }
    }

    if (spotsInThisBatch > 0 && !dryRun) {
      await batch.commit();
    }

    totalUpdated += spotsInThisBatch;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    totalProcessed += snapshot.docs.length;

    console.log(
      `✨ Processed ${totalProcessed} spots | ${
        dryRun ? "Would update" : "Updated"
      } ${totalUpdated} spots...`
    );

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log("\n📊 Final Statistics:");
  console.log(`Total spots processed: ${totalProcessed}`);
  console.log(
    `Total spots ${
      dryRun ? "that would be updated" : "updated"
    }: ${totalUpdated}`
  );
  console.log(
    `Type fixes ${dryRun ? "to apply" : "applied"}: ${typeFixesApplied}`
  );
  console.log(
    `Access fixes ${dryRun ? "to apply" : "applied"}: ${accessFixesApplied}`
  );

  if (dryRun && totalUpdated > 0) {
    console.log("\n💡 Run without --dry-run to apply these fixes.");
  }
}

// Parse command line arguments
const dryRun = process.argv.includes("--dry-run");

fixSpotTypes(dryRun).catch(console.error);
