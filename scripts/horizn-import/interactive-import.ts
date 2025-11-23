#!/usr/bin/env node

/**
 * Interactive Import Script
 *
 * Two-phase import process:
 * 1. Duplicate Detection Phase - identify and resolve duplicates interactively
 * 2. Automatic Import Phase - import all non-duplicate spots
 *
 * Usage:
 *   npm run import:interactive        - Full interactive import
 *   npm run import:interactive:test   - Test mode (3 spots)
 */

import * as admin from "firebase-admin";
import * as fs from "fs";
import * as readline from "readline";
import { HoriznSpotData, ImportConfig } from "./types";
import { createBaseConfig } from "./config";
import { checkForDuplicate } from "./duplicateChecker";
import { runImport } from "./importEngine";
import { SpotServiceAdapter } from "./spotService";

interface DuplicateResolution {
  horiznIndex: number;
  spotName: string;
  action: "skip" | "import" | "pending";
  duplicateId?: string;
  distance?: number;
}

interface ResolutionFile {
  generatedAt: string;
  resolutions: DuplicateResolution[];
}

const RESOLUTION_FILE = "output/duplicate-resolutions.json";

/**
 * Creates a readline interface for user input
 */
function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompts user for input
 */
function prompt(question: string): Promise<string> {
  const rl = createReadline();
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/**
 * Phase 1: Duplicate Detection and Resolution
 *
 * Checks each spot for duplicates and prompts user for action
 */
async function detectAndResolveDuplicates(
  spots: HoriznSpotData[],
  spotService: SpotServiceAdapter
): Promise<DuplicateResolution[]> {
  console.log("\n" + "=".repeat(70));
  console.log("🔍 PHASE 1: DUPLICATE DETECTION");
  console.log("=".repeat(70));
  console.log(
    `Checking ${spots.length} spots for duplicates within 50 meters...\n`
  );

  const resolutions: DuplicateResolution[] = [];
  let duplicatesFound = 0;

  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i];
    const spotNum = i + 1;

    process.stdout.write(`[${spotNum}/${spots.length}] ${spot.name}... `);

    const duplicateCheck = await checkForDuplicate(
      spotService,
      spot.name,
      spot.latitude,
      spot.longitude
    );

    if (duplicateCheck.isDuplicate) {
      duplicatesFound++;

      // Fetch the duplicate spot to show its name
      let duplicateName = "Unknown";
      if (duplicateCheck.duplicateId) {
        try {
          const duplicateSpot = await spotService.getSpotById(
            duplicateCheck.duplicateId
          );
          if (duplicateSpot && duplicateSpot.name) {
            // Try multiple approaches to extract the name
            const nameData = duplicateSpot.name;

            if (typeof nameData === "string") {
              duplicateName = nameData;
            } else if (typeof nameData === "object" && nameData !== null) {
              // Get first locale's value
              const locales = Object.values(nameData);
              if (locales.length > 0) {
                const firstLocale = locales[0];

                // Check if it's LocaleMap format: { text: "...", provider: "..." }
                if (
                  firstLocale &&
                  typeof firstLocale === "object" &&
                  "text" in firstLocale
                ) {
                  duplicateName = (firstLocale as any).text;
                }
                // Check if it's legacy string format: "Name"
                else if (typeof firstLocale === "string") {
                  duplicateName = firstLocale;
                }
                // Last resort: stringify it to see what we're getting
                else {
                  duplicateName = `[Debug: ${JSON.stringify(
                    firstLocale
                  ).substring(0, 50)}]`;
                }
              }
            }
          }
        } catch (error) {
          // If we can't fetch it, just show the ID
          duplicateName = `[Error: ${error}]`;
        }
      }

      console.log(`❗ DUPLICATE FOUND (${duplicateCheck.distance}m away)`);
      console.log(
        `  Existing spot: "${duplicateName}" (ID: ${duplicateCheck.duplicateId})`
      );

      const answer = await prompt(
        "  Action: [s]kip or [i]mport anyway? (s/i): "
      );

      const action = answer === "i" ? "import" : "skip";
      resolutions.push({
        horiznIndex: i,
        spotName: spot.name,
        action,
        duplicateId: duplicateCheck.duplicateId,
        distance: duplicateCheck.distance,
      });

      console.log(`  → ${action === "skip" ? "Skipping" : "Will import"}\n`);
    } else {
      console.log("✓ No duplicate");
      resolutions.push({
        horiznIndex: i,
        spotName: spot.name,
        action: "import",
      });
    }
  }

  console.log("\n" + "-".repeat(70));
  console.log(`✓ Duplicate detection complete`);
  console.log(`  - Duplicates found: ${duplicatesFound}`);
  console.log(
    `  - To import: ${resolutions.filter((r) => r.action === "import").length}`
  );
  console.log(
    `  - To skip: ${resolutions.filter((r) => r.action === "skip").length}`
  );
  console.log("-".repeat(70) + "\n");

  return resolutions;
}

/**
 * Saves duplicate resolutions to file
 */
function saveResolutions(resolutions: DuplicateResolution[]): void {
  const resolutionData: ResolutionFile = {
    generatedAt: new Date().toISOString(),
    resolutions,
  };

  const dir = RESOLUTION_FILE.split("/")[0];
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(
    RESOLUTION_FILE,
    JSON.stringify(resolutionData, null, 2),
    "utf8"
  );
  console.log(`💾 Saved resolutions to ${RESOLUTION_FILE}\n`);
}

/**
 * Loads previous duplicate resolutions from file
 */
function loadResolutions(): DuplicateResolution[] | null {
  if (!fs.existsSync(RESOLUTION_FILE)) {
    return null;
  }

  try {
    const data = fs.readFileSync(RESOLUTION_FILE, "utf8");
    const resolutionFile: ResolutionFile = JSON.parse(data);
    return resolutionFile.resolutions;
  } catch (error) {
    console.error(`⚠️  Could not load resolutions: ${error}`);
    return null;
  }
}

/**
 * Phase 2: Import Non-Duplicate Spots
 *
 * Filters out skipped spots and imports the rest
 */
async function importFilteredSpots(
  allSpots: HoriznSpotData[],
  resolutions: DuplicateResolution[],
  config: ImportConfig
): Promise<void> {
  console.log("\n" + "=".repeat(70));
  console.log("📦 PHASE 2: IMPORTING SPOTS");
  console.log("=".repeat(70));

  // Filter spots based on resolutions
  const spotsToImport = allSpots.filter((spot, index) => {
    const resolution = resolutions.find((r) => r.horiznIndex === index);
    return resolution?.action === "import";
  });

  const skippedCount = allSpots.length - spotsToImport.length;

  console.log(`Total spots: ${allSpots.length}`);
  console.log(`To import: ${spotsToImport.length}`);
  console.log(`To skip: ${skippedCount}\n`);

  if (spotsToImport.length === 0) {
    console.log("✓ No spots to import. Done!");
    return;
  }

  const answer = await prompt(
    `Proceed with importing ${spotsToImport.length} spots? (y/n): `
  );

  if (answer !== "y" && answer !== "yes") {
    console.log("❌ Import cancelled by user.");
    return;
  }

  // Create a modified config that includes only spots to import
  const modifiedConfig: ImportConfig = {
    ...config,
    // We'll filter in the import engine
  };

  // Temporarily write filtered data to a temp file
  const tempJsonPath = config.jsonFilePath.replace(".json", "-filtered.json");
  fs.writeFileSync(tempJsonPath, JSON.stringify(spotsToImport, null, 2));

  const originalPath = config.jsonFilePath;
  config.jsonFilePath = tempJsonPath;

  try {
    await runImport(config);
  } finally {
    // Restore original path and clean up temp file
    config.jsonFilePath = originalPath;
    if (fs.existsSync(tempJsonPath)) {
      fs.unlinkSync(tempJsonPath);
    }
  }
}

/**
 * Main entry point for interactive import
 */
async function main() {
  const args = process.argv.slice(2);
  const isTestMode = args.includes("--test");
  const isDryRun = args.includes("--dry-run");

  console.log("🚀 Horizn Spot Import - Interactive Mode");
  console.log("=".repeat(70));

  const config = createBaseConfig();

  if (isTestMode) {
    config.maxSpots = 3;
    console.log("🧪 TEST MODE: Processing only 3 spots");
  }

  if (isDryRun) {
    config.dryRun = true;
    console.log("🔍 DRY RUN: No data will be written to database");
  }

  console.log("");

  // Validate configuration
  if (!fs.existsSync(config.serviceAccountKeyPath)) {
    console.error(
      `❌ Service account key not found: ${config.serviceAccountKeyPath}`
    );
    process.exit(1);
  }

  if (!fs.existsSync(config.jsonFilePath)) {
    console.error(`❌ JSON file not found: ${config.jsonFilePath}`);
    process.exit(1);
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
  const spotService = new SpotServiceAdapter(db, config.collectionName);

  // Load Horizn data
  const rawData = fs.readFileSync(config.jsonFilePath, "utf8");
  const allSpots: HoriznSpotData[] = JSON.parse(rawData);
  const spots = config.maxSpots ? allSpots.slice(0, config.maxSpots) : allSpots;

  console.log(`✓ Loaded ${spots.length} spots from Horizn data`);
  console.log(`✓ Firebase Admin initialized`);
  console.log(`✓ Collection: ${config.collectionName}\n`);

  // Check if we have previous resolutions
  const previousResolutions = loadResolutions();
  let resolutions: DuplicateResolution[];

  if (previousResolutions && previousResolutions.length === spots.length) {
    console.log(
      `📋 Found previous duplicate resolutions from ${RESOLUTION_FILE}`
    );
    const answer = await prompt("Use previous resolutions? (y/n): ");

    if (answer === "y" || answer === "yes") {
      resolutions = previousResolutions;
      console.log("✓ Using previous resolutions\n");
    } else {
      resolutions = await detectAndResolveDuplicates(spots, spotService);
      saveResolutions(resolutions);
    }
  } else {
    // Phase 1: Detect and resolve duplicates
    resolutions = await detectAndResolveDuplicates(spots, spotService);
    saveResolutions(resolutions);
  }

  // Phase 2: Import filtered spots
  await importFilteredSpots(spots, resolutions, config);

  console.log("\n✨ Interactive import complete!");
}

// Run the script
main().catch((error) => {
  console.error("\n❌ Fatal error:", error.message);
  console.error(error.stack);
  process.exit(1);
});
