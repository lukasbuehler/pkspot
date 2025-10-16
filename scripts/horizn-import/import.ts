#!/usr/bin/env node

/**
 * Horizn Import Script
 *
 * Main entry point for importing Horizn parkour spot data into PK Spot.
 *
 * Usage:
 *   1. Test with 3 spots:  npm run import:horizn:test
 *   2. Import all spots:   npm run import:horizn
 *   3. Dry run validation: npm run import:horizn:dry
 */

import { runImport } from "./importEngine";
import { ImportConfig } from "./types";
import { createBaseConfig } from "./config";

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG: ImportConfig = createBaseConfig();

// =============================================================================
// COMMAND LINE ARGUMENTS
// =============================================================================

const args = process.argv.slice(2);

// Check for test mode flag
if (args.includes("--test")) {
  CONFIG.maxSpots = 3;
  console.log("🧪 TEST MODE: Importing only 3 spots\n");
}

// Check for dry run flag
if (args.includes("--dry-run")) {
  CONFIG.dryRun = true;
  console.log("🔍 DRY RUN: No data will be written\n");
}

// Check for spots-only flag (skip image upload)
if (args.includes("--spots-only")) {
  CONFIG.uploadImages = false;
  console.log("🧭 SPOTS ONLY: Images will NOT be uploaded\n");
}

// =============================================================================
// VALIDATION & EXECUTION
// =============================================================================

// Validate storage bucket is configured
if (CONFIG.storageBucket === "YOUR-PROJECT-ID.appspot.com") {
  console.error("❌ ERROR: Please configure storageBucket in this script!");
  console.error("   Find it in: Firebase Console → Storage");
  console.error('   Format: "your-project-id.appspot.com"\n');
  process.exit(1);
}

// Run the import
runImport(CONFIG).catch((error) => {
  console.error("\n❌ Fatal error:", error.message);
  process.exit(1);
});
