/**
 * Duplicate Checker
 *
 * Detects if spots already exist in Firestore before importing.
 * Prevents duplicate imports by checking location and name similarity.
 */

import * as admin from "firebase-admin";
import { SpotSchema } from "../../src/db/schemas/SpotSchema";

// Distance threshold in meters for considering spots as duplicates
const DUPLICATE_DISTANCE_THRESHOLD = 50; // 50 meters

/**
 * Calculates distance between two geographic points using Haversine formula
 *
 * @param lat1 - Latitude of first point
 * @param lon1 - Longitude of first point
 * @param lat2 - Latitude of second point
 * @param lon2 - Longitude of second point
 * @returns Distance in meters
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Normalizes a string for comparison
 * Converts to lowercase and removes special characters
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Checks if a spot already exists in Firestore
 *
 * Algorithm:
 * 1. Query spots near the location (within 0.01 degrees ~1km)
 * 2. For each nearby spot:
 *    a. Calculate exact distance
 *    b. If within 50m threshold, check name similarity
 *    c. If names are similar, consider it a duplicate
 *
 * @param db - Firestore database instance
 * @param spotName - Name of the spot to check
 * @param latitude - Latitude of the spot
 * @param longitude - Longitude of the spot
 * @param collectionName - Firestore collection name
 * @returns Object with isDuplicate flag and duplicate spot ID if found
 */
export async function checkForDuplicate(
  db: admin.firestore.Firestore,
  spotName: string,
  latitude: number,
  longitude: number,
  collectionName: string
): Promise<{ isDuplicate: boolean; duplicateId?: string; distance?: number }> {
  // Query spots in the general area (rough filter)
  const latRange = 0.01; // ~1.1km at equator
  const lngRange = 0.01;

  const nearbySpots = await db
    .collection(collectionName)
    .where(
      "location",
      ">=",
      new admin.firestore.GeoPoint(latitude - latRange, longitude - lngRange)
    )
    .where(
      "location",
      "<=",
      new admin.firestore.GeoPoint(latitude + latRange, longitude + lngRange)
    )
    .get();

  // Check each nearby spot for exact distance match
  for (const doc of nearbySpots.docs) {
    const spotData = doc.data() as SpotSchema;
    const existingLat = spotData.location.latitude;
    const existingLng = spotData.location.longitude;

    const distance = calculateDistance(
      latitude,
      longitude,
      existingLat,
      existingLng
    );

    // If within distance threshold, check name similarity
    if (distance < DUPLICATE_DISTANCE_THRESHOLD) {
      // Get name in any locale
      const existingName =
        typeof spotData.name === "object"
          ? Object.values(spotData.name)[0]
          : spotData.name;

      const normalizedExisting = normalizeString(existingName);
      const normalizedNew = normalizeString(spotName);

      // Check if names are very similar (allow minor differences)
      if (
        normalizedExisting === normalizedNew ||
        normalizedExisting.includes(normalizedNew) ||
        normalizedNew.includes(normalizedExisting)
      ) {
        return {
          isDuplicate: true,
          duplicateId: doc.id,
          distance: Math.round(distance),
        };
      }
    }
  }

  return { isDuplicate: false };
}
