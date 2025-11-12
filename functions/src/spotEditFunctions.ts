import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
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
        const createData: any = {
          ...editData.data,
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
            createData.location = new admin.firestore.GeoPoint(latitude, longitude);
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

        let updateData: any = {
          ...regularData,
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
            updateData.location = new admin.firestore.GeoPoint(latitude, longitude);
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
        }

        // Special handling for media: append instead of replace
        if (media && Array.isArray(media)) {
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
    } catch (error) {
      console.error(
        `Error processing spot edit ${editId} for spot ${spotId}:`,
        error
      );
      throw error;
    }
  }
);
