import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getStorage } from "firebase-admin/storage";
import { computeTileCoordinates } from "../../src/scripts/TileCoordinateHelpers";

interface SpotEditSchema {
  type: "CREATE" | "UPDATE";
  timestamp: any;
  likes: number;
  approved: boolean;
  user: {
    uid: string;
    [key: string]: any;
  };
  data: any;
  prevData?: any;
  modification_type?: "APPEND" | "OVERWRITE";
}

/**
 * Triggered when a new spot edit is created.
 * For now, applies the edit to the spot immediately.
 * In the future, this might be based on votes associated with the spot edit.
 */
export const applySpotEditOnCreate = onDocumentCreated(
  "spots/{spotId}/edits/{editId}",
  async (event) => {
    const spotId = event.params.spotId;
    const editId = event.params.editId;

    try {
      const editSnapshot = event.data;

      if (!editSnapshot) {
        console.error("Edit snapshot is missing for edit", editId);
        return;
      }

      const editData = editSnapshot.data() as SpotEditSchema;

      console.log(
        `Processing spot edit ${editId} for spot ${spotId}`,
        `Edit type: ${editData.type}`
      );

      const db = admin.firestore();
      const spotRef = db.collection("spots").doc(spotId);

      // For CREATE edits, update the existing (initially empty) spot document with the data
      if (editData.type === "CREATE") {
        const { source: _ignoredSource, ...createPayload } = editData.data || {};
        const createData: any = {
          ...createPayload,
          // Set source to pkspot for user-created spots
          source: "pkspot",
          // Initialize is_iconic to false (will be computed by scheduled function)
          is_iconic: false,
        };

        // Ensure location is a proper GeoPoint if it exists and compute tile coordinates
        if (createData.location) {
          let latitude: number;
          let longitude: number;

          // If location is already a GeoPoint, keep it; otherwise convert it
          if (
            createData.location._latitude === undefined &&
            createData.location.latitude !== undefined
          ) {
            // It's a plain object with latitude/longitude, convert to GeoPoint
            latitude = createData.location.latitude;
            longitude = createData.location.longitude;
            createData.location = new admin.firestore.GeoPoint(
              latitude,
              longitude
            );
          } else if (createData.location._latitude !== undefined) {
            // It's already a GeoPoint, extract coordinates
            latitude = createData.location._latitude;
            longitude = createData.location._longitude;
          } else {
            console.error("Invalid location format for spot", spotId);
            throw new Error("Invalid location format");
          }

          // Compute tile coordinates for the location
          createData.tile_coordinates = computeTileCoordinates(
            latitude,
            longitude
          );

          // Always write location_raw
          createData.location_raw = { lat: latitude, lng: longitude };
        }

        await spotRef.update(createData);
        console.log(
          `Updated spot ${spotId} with data from CREATE edit ${editId}`
        );
      }
      // For UPDATE edits, merge the changes into the existing spot
      else if (editData.type === "UPDATE") {
        // Extract fields that need special merge logic
        const { media, external_references, amenities, ...regularData } =
          editData.data;
        const { source: _ignoredSource, ...regularDataWithoutSource } =
          regularData || {};

        let updateData: any = {
          ...regularDataWithoutSource,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Ensure location is a proper GeoPoint if it exists and compute tile coordinates
        if (updateData.location) {
          let latitude: number;
          let longitude: number;

          // If location is already a GeoPoint, keep it; otherwise convert it
          if (
            updateData.location._latitude === undefined &&
            updateData.location.latitude !== undefined
          ) {
            // It's a plain object with latitude/longitude, convert to GeoPoint
            latitude = updateData.location.latitude;
            longitude = updateData.location.longitude;
            updateData.location = new admin.firestore.GeoPoint(
              latitude,
              longitude
            );
          } else if (updateData.location._latitude !== undefined) {
            // It's already a GeoPoint, extract coordinates
            latitude = updateData.location._latitude;
            longitude = updateData.location._longitude;
          } else {
            console.error("Invalid location format for spot", spotId);
            throw new Error("Invalid location format");
          }

          // Compute tile coordinates for the new location
          updateData.tile_coordinates = computeTileCoordinates(
            latitude,
            longitude
          );

          // Always write location_raw
          updateData.location_raw = { lat: latitude, lng: longitude };
        }

        // For media, we handle two cases based on modification_type:
        // 1. OVERWRITE: Completely replace the media list (used by new clients supporting deletions)
        // 2. APPEND (default): Add new items only (used by legacy clients)
        if (media && Array.isArray(media)) {
          if (editData.modification_type === "OVERWRITE") {
            // Check for deleted media and remove from storage
            const spotSnapshot = await spotRef.get();
            if (spotSnapshot.exists) {
              const currentMedia = (spotSnapshot.data() as any)["media"] || [];
              const newMediaSrcs = new Set(media.map((m: any) => m.src));

              const removedMedia = currentMedia.filter(
                (m: any) => !newMediaSrcs.has(m.src) && m.isInStorage
              );

              if (removedMedia.length > 0) {
                console.log(
                  `Found ${removedMedia.length} removed media items. Attempting deletion.`
                );
                const bucket = getStorage().bucket();

                for (const item of removedMedia) {
                  try {
                    // Extract path from URL.
                    // Format: https://firebasestorage.googleapis.com/v0/b/[bucket]/o/[path]?alt=media...
                    // Or gs://[bucket]/[path]

                    let path = "";
                    if (item.src.startsWith("gs://")) {
                      path = item.src.split(bucket.name + "/")[1];
                    } else if (item.src.includes("/o/")) {
                      const urlObj = new URL(item.src);
                      const pathWithToken = urlObj.pathname.split("/o/")[1];
                      path = decodeURIComponent(pathWithToken);
                    }

                    if (path) {
                      console.log(`Deleting orphaned file: ${path}`);
                      await bucket.file(path).delete();
                    }
                  } catch (e) {
                    console.error(
                      `Failed to delete orphaned media ${item.src}:`,
                      e
                    );
                    // Continue execution, do not fail the spot update
                  }
                }
              }
            }

            updateData.media = media;
          } else {
            // Legacy/Default behavior: Append only
            const spotSnapshot = await spotRef.get();
            if (spotSnapshot.exists) {
              const currentMedia = (spotSnapshot.data() as any)["media"] || [];
              // Append new media items to existing ones, avoiding duplicates
              const newMedia = media.filter(
                (newItem: any) =>
                  !currentMedia.some((item: any) => item.src === newItem.src)
              );
              updateData.media = [...currentMedia, ...newMedia];
            } else {
              // Spot doesn't exist yet, just set the media
              updateData.media = media;
            }
          }
        }

        // Handle external references: merge instead of replace
        if (external_references) {
          const spotSnapshot = await spotRef.get();
          if (spotSnapshot.exists) {
            const spotData = spotSnapshot.data() as any;
            const currentRefs = spotData["external_references"] || {};
            updateData.external_references = {
              ...currentRefs,
              ...external_references,
            };
            // If a value is explicitly null, delete the field
            Object.keys(updateData.external_references).forEach((key) => {
              if (updateData.external_references[key] === null) {
                updateData.external_references[key] =
                  admin.firestore.FieldValue.delete() as any;
              }
            });
          } else {
            // Spot doesn't exist yet
            updateData.external_references = external_references;
          }
        }

        // Handle amenities: merge instead of replace
        if (amenities) {
          const spotSnapshot = await spotRef.get();
          if (spotSnapshot.exists) {
            const spotData = spotSnapshot.data() as any;
            const currentAmenities = spotData["amenities"] || {};
            updateData.amenities = {
              ...currentAmenities,
              ...amenities,
            };
            // If a value is explicitly null, delete the field
            Object.keys(updateData.amenities).forEach((key) => {
              if (updateData.amenities[key] === null) {
                updateData.amenities[key] =
                  admin.firestore.FieldValue.delete() as any;
              }
            });
          } else {
            // Spot doesn't exist yet
            updateData.amenities = amenities;
          }
        }

        await spotRef.update(updateData);
        console.log(`Updated spot ${spotId} from edit ${editId}`);
      }

      // Mark the edit as approved
      await editSnapshot.ref.update({
        approved: true,
      });

      console.log(`Marked edit ${editId} as approved`);

      // Increment user contribution counters
      const userRef = db.collection("users").doc(editData.user.uid);
      const incrementData: Record<string, FirebaseFirestore.FieldValue> = {
        spot_edits_count: admin.firestore.FieldValue.increment(1),
      };

      if (editData.type === "CREATE") {
        incrementData["spot_creates_count"] =
          admin.firestore.FieldValue.increment(1);
      }

      // Count media items added in this edit
      const mediaItems = editData.data?.media;
      if (Array.isArray(mediaItems) && mediaItems.length > 0) {
        incrementData["media_added_count"] =
          admin.firestore.FieldValue.increment(mediaItems.length);
      }

      await userRef.set(incrementData, { merge: true });
      console.log(`Updated user ${editData.user.uid} contribution counters`);

      // Update leaderboards
      await updateLeaderboards(editData.user.uid, editData.type, db);
    } catch (error) {
      console.error(
        `Error processing spot edit ${editId} for spot ${spotId}:`,
        error
      );
      throw error;
    }
  }
);

interface LeaderboardEntry {
  uid: string;
  display_name: string;
  profile_picture?: string;
  count: number;
}

const TOP_N = 50;

/**
 * Updates the leaderboards after a spot edit is approved.
 * Maintains three separate leaderboards: spots_created, spots_edited, media_added
 */
async function updateLeaderboards(
  userId: string,
  editType: "CREATE" | "UPDATE",
  db: FirebaseFirestore.Firestore
): Promise<void> {
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (!userData) {
      console.warn(`User ${userId} not found when updating leaderboards`);
      return;
    }

    const userEntry: Omit<LeaderboardEntry, "count"> = {
      uid: userId,
      display_name: userData["display_name"] || "Anonymous",
      profile_picture: userData["profile_picture"],
    };

    // Always update the edits leaderboard
    await updateSingleLeaderboard(
      db,
      "spots_edited",
      userEntry,
      userData["spot_edits_count"] || 0
    );

    // Update creates leaderboard if this was a CREATE
    if (editType === "CREATE") {
      await updateSingleLeaderboard(
        db,
        "spots_created",
        userEntry,
        userData["spot_creates_count"] || 0
      );
    }

    // Update media leaderboard if user has media count
    if (userData["media_added_count"]) {
      await updateSingleLeaderboard(
        db,
        "media_added",
        userEntry,
        userData["media_added_count"]
      );
    }
  } catch (error) {
    console.error(`Error updating leaderboards for user ${userId}:`, error);
    // Don't throw - leaderboard update failure shouldn't fail the edit
  }
}

/**
 * Updates a single leaderboard document with the user's new count.
 */
async function updateSingleLeaderboard(
  db: FirebaseFirestore.Firestore,
  leaderboardId: string,
  userEntry: Omit<LeaderboardEntry, "count">,
  count: number
): Promise<void> {
  const leaderboardRef = db.collection("leaderboards").doc(leaderboardId);

  await db.runTransaction(async (transaction) => {
    const leaderboardDoc = await transaction.get(leaderboardRef);
    const entries: LeaderboardEntry[] =
      leaderboardDoc.data()?.["entries"] || [];

    // Find existing entry for this user
    const existingIndex = entries.findIndex((e) => e.uid === userEntry.uid);

    if (existingIndex >= 0) {
      // Update existing entry
      entries[existingIndex] = { ...userEntry, count };
    } else {
      // Add new entry
      entries.push({ ...userEntry, count });
    }

    // Sort by count descending and keep top N
    entries.sort((a, b) => b.count - a.count);
    const topEntries = entries.slice(0, TOP_N);

    transaction.set(leaderboardRef, {
      entries: topEntries,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  console.log(`Updated leaderboard ${leaderboardId} for user ${userEntry.uid}`);
}
