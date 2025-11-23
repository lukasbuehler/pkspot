/**
 * Import Engine
 *
 * Core orchestration logic for importing Horizn spots to Firestore.
 * Handles batch processing, error handling, and progress reporting.
 */

import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { SpotSchema, SpotId } from "../../src/db/schemas/SpotSchema";
import { MediaSchema } from "../../src/db/schemas/Media";
import {
  HoriznSpotData,
  ImportConfig,
  ImportResult,
  ImportStatus,
  SpotIdMappingEntry,
  SpotIdMappingFile,
} from "./types";
import { transformHoriznSpot } from "./spotTransformer";
import { checkForDuplicate } from "./duplicateChecker";
import { SpotServiceAdapter } from "./spotService";

/**
 * Imports a single Horizn spot to Firestore
 *
 * Process:
 * 1. Check for duplicates (by location + name)
 * 2. Transform Horizn data to SpotSchema
 * 3. Upload images to Storage
 * 4. Add media to spot document
 * 5. Write to Firestore (or skip if dry run)
 *
 * @param horiznSpot - Raw Horizn spot data
 * @param spotService - Strongly-typed spot service
 * @param bucket - Storage bucket
 * @param config - Import configuration
 * @returns ImportResult with success/failure details
 */
async function importSingleSpot(
  spotIndex: number,
  horiznSpot: HoriznSpotData,
  spotService: SpotServiceAdapter,
  config: ImportConfig
): Promise<ImportResult> {
  const spotName = horiznSpot.name || "Unknown";

  try {
    // Check for duplicate spots
    const duplicateCheck = await checkForDuplicate(
      spotService,
      spotName,
      horiznSpot.latitude,
      horiznSpot.longitude
    );

    if (duplicateCheck.isDuplicate) {
      return {
        success: true,
        spotName,
        skipped: true,
        skipReason: `Duplicate found (ID: ${duplicateCheck.duplicateId}, ${duplicateCheck.distance}m away)`,
        duplicateId: duplicateCheck.duplicateId,
        spotIndex,
      };
    }

    // Transform to SpotSchema format
    const spotDoc = transformHoriznSpot(horiznSpot, config);

    // Create spot document with empty media array (copyright issue - no media import)
    const completeSpotDoc: SpotSchema = { ...spotDoc, media: [] };

    // Write to Firestore (unless dry run)
    if (config.dryRun) {
      console.log(`  ✓ [DRY RUN] Would create spot`);
      return {
        success: true,
        spotName,
        spotIndex,
      };
    }

    const spotId = await spotService.addSpot(completeSpotDoc);
    console.log(`  ✓ Created spot ID: ${spotId}`);

    return {
      success: true,
      spotName,
      spotId: spotId as string,
      spotIndex,
    };
  } catch (error: any) {
    console.error(`  ✗ Error: ${error.message}`);
    return {
      success: false,
      spotName,
      error: error.message,
      spotIndex,
    };
  }
}

function writeSpotIdMapping(
  config: ImportConfig,
  spots: HoriznSpotData[],
  results: ImportResult[]
): void {
  if (!config.spotIdMapPath) {
    return;
  }

  const mappingEntries: SpotIdMappingEntry[] = spots.map((spot, index) => {
    const result = results.find((r) => r.spotIndex === index);
    let status: ImportStatus = "failed";

    if (result) {
      if (result.skipped) {
        status = "skipped";
      } else if (result.success) {
        status = "success";
      }
    }

    return {
      horiznIndex: index,
      spotName: spot.name || `Spot #${index + 1}`,
      spotId: result?.spotId,
      duplicateId: result?.duplicateId,
      status,
      skipReason: result?.skipReason,
      error: result?.error,
    };
  });

  const mapping: SpotIdMappingFile = {
    generatedAt: new Date().toISOString(),
    dryRun: Boolean(config.dryRun),
    entries: mappingEntries,
  };

  fs.mkdirSync(path.dirname(config.spotIdMapPath), { recursive: true });
  fs.writeFileSync(
    config.spotIdMapPath,
    JSON.stringify(mapping, null, 2),
    "utf8"
  );
  console.log(`\n🗂️  Saved spot ID mapping to ${config.spotIdMapPath}`);
}

/**
 * Processes a batch of spots concurrently
 *
 * @param spots - Array of Horizn spots to process
 * @param startIdx - Starting index in the array
 * @param spotService - Strongly-typed spot service
 * @param bucket - Storage bucket
 * @param config - Import configuration
 * @returns Array of ImportResult objects
 */
async function processBatch(
  spots: HoriznSpotData[],
  startIdx: number,
  spotService: SpotServiceAdapter,
  config: ImportConfig
): Promise<ImportResult[]> {
  const batch = spots.slice(startIdx, startIdx + config.batchSize);
  const totalSpots = config.maxSpots || spots.length;

  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `Batch ${Math.floor(startIdx / config.batchSize) + 1}: Processing spots ${
      startIdx + 1
    }-${Math.min(startIdx + batch.length, totalSpots)} of ${totalSpots}`
  );
  console.log("=".repeat(60));

  const promises = batch.map(async (spot, idx) => {
    const spotNum = startIdx + idx + 1;
    console.log(`\n[${spotNum}/${totalSpots}] ${spot.name}`);
    return importSingleSpot(startIdx + idx, spot, spotService, config);
  });

  return Promise.all(promises);
}

/**
 * Main import orchestrator
 *
 * This is the entry point for the import process. It:
 * 1. Validates configuration
 * 2. Initializes Firebase Admin SDK
 * 3. Loads and parses Horizn JSON data
 * 4. Processes spots in batches
 * 5. Reports final statistics
 *
 * @param config - Complete import configuration
 * @throws Error if configuration is invalid or files are missing
 */
export async function runImport(config: ImportConfig): Promise<void> {
  console.log("🚀 Horizn Spot Import for PK Spot");
  console.log("=".repeat(60));

  // Validate configuration
  if (
    !config.serviceAccountKeyPath ||
    !fs.existsSync(config.serviceAccountKeyPath)
  ) {
    throw new Error(
      `Service account key not found: ${config.serviceAccountKeyPath}`
    );
  }

  if (!config.jsonFilePath || !fs.existsSync(config.jsonFilePath)) {
    throw new Error(`JSON file not found: ${config.jsonFilePath}`);
  }

  if (!config.storageBucket || config.storageBucket.includes("YOUR-PROJECT")) {
    throw new Error("Please configure storageBucket in the config!");
  }

  // Initialize Firebase Admin SDK
  const serviceAccount = JSON.parse(
    fs.readFileSync(config.serviceAccountKeyPath, "utf8")
  );

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: config.storageBucket,
    });
  }

  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const spotService = new SpotServiceAdapter(db, config.collectionName);

  console.log("✓ Firebase Admin initialized");
  console.log(`✓ Collection: ${config.collectionName}`);
  if (config.dryRun) {
    console.log("⚠️  DRY RUN MODE - No data will be written!");
  }
  if (config.maxSpots) {
    console.log(
      `⚠️  Testing mode: Only importing first ${config.maxSpots} spots`
    );
  }
  console.log("");

  // Load Horizn data
  const rawData = fs.readFileSync(config.jsonFilePath, "utf8");
  const horiznSpots: HoriznSpotData[] = JSON.parse(rawData);

  // Limit spots if maxSpots is set (for testing)
  const spotsToImport = config.maxSpots
    ? horiznSpots.slice(0, config.maxSpots)
    : horiznSpots;

  console.log(`📦 Loaded ${spotsToImport.length} spots from Horizn data`);
  console.log("");

  // Process in batches
  const results: ImportResult[] = [];

  for (let i = 0; i < spotsToImport.length; i += config.batchSize) {
    const batchResults = await processBatch(
      spotsToImport,
      i,
      spotService,
      config
    );
    results.push(...batchResults);

    // Small delay between batches to avoid rate limiting
    if (i + config.batchSize < spotsToImport.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 IMPORT SUMMARY");
  console.log("=".repeat(60));

  const successful = results.filter((r) => r.success && !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  const failed = results.filter((r) => !r.success);

  console.log(`✓ Successfully imported: ${successful.length} spots`);
  console.log(`↷ Skipped (duplicates): ${skipped.length} spots`);
  if (skipped.length > 0) {
    console.log("\n⚠️  Skipped spots:");
    skipped.forEach((r) => {
      console.log(`   - ${r.spotName}: ${r.skipReason}`);
    });
  }

  if (failed.length > 0) {
    console.log("\n❌ Failed spots:");
    failed.forEach((r) => {
      console.log(`   - ${r.spotName}: ${r.error}`);
    });
  }

  console.log("\n✨ Import complete!");

  writeSpotIdMapping(config, spotsToImport, results);

  if (failed.length > 0) {
    process.exit(1);
  }
}
