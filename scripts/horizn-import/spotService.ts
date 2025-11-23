/**
 * Firestore Helper for Node.js Import Scripts
 *
 * Minimal typed wrapper around Firebase Admin SDK for import scripts.
 * Uses the same SpotSchema as the Angular app's SpotsService to ensure type safety.
 *
 * NOTE: This is NOT a duplicate of SpotsService - that's an Angular service with
 * DI that can't be used in Node.js. This is a simple Node.js adapter that ensures
 * we use the same types and schemas.
 */

import * as admin from "firebase-admin";
import { SpotSchema, SpotId } from "../../src/db/schemas/SpotSchema";

/**
 * Minimal typed wrapper for Firestore operations in Node.js scripts.
 * Ensures type safety using the same SpotSchema as the main app.
 */
export class SpotServiceAdapter {
  constructor(
    private db: admin.firestore.Firestore,
    private collectionName: string = "spots"
  ) {}

  /**
   * Gets a spot by ID (for verification/debugging)
   */
  async getSpotById(spotId: SpotId): Promise<SpotSchema | null> {
    const doc = await this.db.collection(this.collectionName).doc(spotId).get();

    if (!doc.exists) {
      return null;
    }

    return doc.data() as SpotSchema;
  }

  /**
   * Adds a new spot to Firestore (type-safe using SpotSchema)
   */
  async addSpot(spotData: SpotSchema): Promise<SpotId> {
    const docRef = await this.db.collection(this.collectionName).add(spotData);
    return docRef.id as SpotId;
  }

  /**
   * Queries spots within a geographic bounding box (for duplicate checking)
   */
  async getSpotsInBounds(
    minLat: number,
    maxLat: number,
    minLng: number,
    maxLng: number
  ): Promise<Array<{ id: SpotId; data: SpotSchema }>> {
    // Firestore GeoPoint queries work with lat/lng ordering
    const snapshot = await this.db
      .collection(this.collectionName)
      .where("location", ">=", new admin.firestore.GeoPoint(minLat, minLng))
      .where("location", "<=", new admin.firestore.GeoPoint(maxLat, maxLng))
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id as SpotId,
      data: doc.data() as SpotSchema,
    }));
  }
}
