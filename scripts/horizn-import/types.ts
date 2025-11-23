/**
 * Type definitions for Horizn data import
 *
 * This file defines the structure of the Horizn app export data
 * and the configuration for the import process.
 */

/**
 * Horizn spot data structure from their JSON export
 */
export interface HoriznSpotData {
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  city_name?: string;
  country_code?: string;
  street_address?: string;
  postal_code?: string;
  pictures: string[]; // Array of paths like "spots_pics/filename.jpg"
  tags_moves?: string[];
  tags_area?: string[];
  tags_warnings?: string[];
}

/**
 * Configuration for the import process
 */
export interface ImportConfig {
  // Firebase Admin SDK service account key path
  serviceAccountKeyPath: string;

  // Firebase Storage bucket name (e.g., "your-project.appspot.com")
  storageBucket: string;

  // Path to Horizn JSON data file
  jsonFilePath: string;

  // Firestore collection name
  collectionName: string;

  // Default locale for spot names/descriptions
  defaultLocale: string;

  // Number of spots to process concurrently
  batchSize: number;

  // User ID to attribute uploads to (for metadata)
  importerUserId: string;

  // Maximum number of spots to import (for testing)
  maxSpots?: number;

  // Dry run mode - validate without writing to database
  dryRun?: boolean;

  // Path to write the spot ID mapping output
  spotIdMapPath?: string;
}

/**
 * Result of importing a single spot
 */
export interface ImportResult {
  success: boolean;
  spotName: string;
  spotId?: string; // String representation of SpotId
  error?: string;
  skipped?: boolean;
  skipReason?: string;
  spotIndex: number;
  duplicateId?: string; // String representation of SpotId
}

export type ImportStatus = "success" | "skipped" | "failed";

export interface SpotIdMappingEntry {
  horiznIndex: number;
  spotName: string;
  spotId?: string;
  duplicateId?: string;
  status: ImportStatus;
  skipReason?: string;
  error?: string;
}

export interface SpotIdMappingFile {
  generatedAt: string;
  dryRun: boolean;
  entries: SpotIdMappingEntry[];
}
