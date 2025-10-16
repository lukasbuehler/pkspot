#!/usr/bin/env node

/**
 * Horizn Data Validator
 *
 * Validates Horizn JSON data before import to catch issues early.
 * Checks for missing files, invalid coordinates, and data quality.
 *
 * Usage: npm run import:horizn:validate
 */

import * as fs from "fs";
import * as path from "path";
import { HoriznSpotData } from "./types";

// Configuration
const DATA_PATH = path.join(__dirname, "../data/horizn-spots-output.json");
const IMAGES_PATH = path.join(__dirname, "../data/spots_pics");

interface ValidationIssue {
  spotName: string;
  type: "error" | "warning" | "info";
  message: string;
}

/**
 * Validates a single Horizn spot
 */
function validateSpot(spot: HoriznSpotData, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const spotName = spot.name || `Spot #${index + 1}`;

  // Check required fields
  if (!spot.name) {
    issues.push({ spotName, type: "error", message: "Missing name" });
  }

  if (!spot.latitude || !spot.longitude) {
    issues.push({ spotName, type: "error", message: "Missing coordinates" });
  } else {
    // Validate coordinate ranges
    if (spot.latitude < -90 || spot.latitude > 90) {
      issues.push({
        spotName,
        type: "error",
        message: `Invalid latitude: ${spot.latitude}`,
      });
    }
    if (spot.longitude < -180 || spot.longitude > 180) {
      issues.push({
        spotName,
        type: "error",
        message: `Invalid longitude: ${spot.longitude}`,
      });
    }
  }

  // Check for location data
  if (!spot.country_code) {
    issues.push({ spotName, type: "warning", message: "Missing country code" });
  }

  if (!spot.city_name) {
    issues.push({ spotName, type: "warning", message: "Missing city name" });
  }

  // Check images
  if (!spot.pictures || spot.pictures.length === 0) {
    issues.push({ spotName, type: "warning", message: "No images" });
  } else {
    // Check if image files exist
    const missingImages: string[] = [];
    spot.pictures.forEach((picturePath) => {
      const fileName = picturePath.replace("spots_pics/", "");
      const fullPath = path.join(IMAGES_PATH, fileName);
      if (!fs.existsSync(fullPath)) {
        missingImages.push(fileName);
      }
    });

    if (missingImages.length > 0) {
      const preview = missingImages.slice(0, 3).join(", ");
      const suffix =
        missingImages.length > 3 ? ` (+${missingImages.length - 3} more)` : "";
      issues.push({
        spotName,
        type: "error",
        message: `Missing ${missingImages.length} images: ${preview}${suffix}`,
      });
    } else {
      issues.push({
        spotName,
        type: "info",
        message: `${spot.pictures.length} images available`,
      });
    }
  }

  // Info about tags
  const totalTags =
    (spot.tags_moves?.length || 0) +
    (spot.tags_area?.length || 0) +
    (spot.tags_warnings?.length || 0);

  if (totalTags > 0) {
    issues.push({ spotName, type: "info", message: `${totalTags} tags` });
  }

  return issues;
}

/**
 * Main validation function
 */
function validateHoriznData(): void {
  console.log("🔍 Validating Horizn Data\n");
  console.log("=".repeat(60));

  // Check if files exist
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`❌ JSON file not found: ${DATA_PATH}`);
    process.exit(1);
  }

  if (!fs.existsSync(IMAGES_PATH)) {
    console.error(`❌ Images folder not found: ${IMAGES_PATH}`);
    process.exit(1);
  }

  // Load and parse data
  const rawData = fs.readFileSync(DATA_PATH, "utf8");
  const spots: HoriznSpotData[] = JSON.parse(rawData);

  console.log(`✓ Loaded ${spots.length} spots from JSON\n`);

  // Validate each spot
  const allIssues: ValidationIssue[] = [];
  spots.forEach((spot, index) => {
    const issues = validateSpot(spot, index);
    allIssues.push(...issues);
  });

  // Categorize issues
  const errors = allIssues.filter((i) => i.type === "error");
  const warnings = allIssues.filter((i) => i.type === "warning");
  const infos = allIssues.filter((i) => i.type === "info");

  // Print summary
  console.log("📊 VALIDATION SUMMARY\n");
  console.log(`Total spots: ${spots.length}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log("");

  // Show errors
  if (errors.length > 0) {
    console.log("❌ ERRORS (must fix before import):");
    errors.slice(0, 20).forEach((e) => {
      console.log(`   ${e.spotName}: ${e.message}`);
    });
    if (errors.length > 20) {
      console.log(`   ... and ${errors.length - 20} more errors`);
    }
    console.log("");
  }

  // Show warnings
  if (warnings.length > 0) {
    console.log("⚠️  WARNINGS (recommended to review):");
    warnings.slice(0, 20).forEach((w) => {
      console.log(`   ${w.spotName}: ${w.message}`);
    });
    if (warnings.length > 20) {
      console.log(`   ... and ${warnings.length - 20} more warnings`);
    }
    console.log("");
  }

  // Statistics
  const spotsWithImages = spots.filter(
    (s) => s.pictures && s.pictures.length > 0
  ).length;
  const totalImages = spots.reduce(
    (sum, s) => sum + (s.pictures?.length || 0),
    0
  );
  const countries = new Set(spots.map((s) => s.country_code).filter(Boolean));

  console.log("📈 STATISTICS:\n");
  console.log(`Spots with images: ${spotsWithImages} / ${spots.length}`);
  console.log(`Total images: ${totalImages}`);
  console.log(`Countries: ${countries.size}`);
  console.log(
    `Average images per spot: ${(totalImages / spots.length).toFixed(1)}`
  );
  console.log("");

  // Final verdict
  if (errors.length > 0) {
    console.log("❌ Validation failed! Fix errors before importing.");
    process.exit(1);
  } else {
    console.log("✅ Validation passed! Ready to import.");
    process.exit(0);
  }
}

// Run validation
try {
  validateHoriznData();
} catch (error: any) {
  console.error("❌ Validation error:", error.message);
  process.exit(1);
}
