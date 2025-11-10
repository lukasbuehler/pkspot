import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

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
        const createData = {
          ...editData.data,
          // Enforce correct metadata - overwrite what client set to prevent abuse
          created_by: editData.user.uid,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          likes: 0,
          num_reviews: 0,
        };

        await spotRef.update(createData);
        console.log(
          `Updated spot ${spotId} with data from CREATE edit ${editId}`
        );
      }
      // For UPDATE edits, merge the changes into the existing spot
      else if (editData.type === "UPDATE") {
        let updateData: any = {
          ...editData.data,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Special handling for media: append instead of replace
        if (editData.data.media && Array.isArray(editData.data.media)) {
          const spotSnapshot = await spotRef.get();
          if (spotSnapshot.exists) {
            const currentMedia = (spotSnapshot.data() as any)["media"] || [];
            // Append new media items to existing ones, avoiding duplicates
            const newMedia = editData.data.media.filter(
              (newItem: any) =>
                !currentMedia.some((item: any) => item.src === newItem.src)
            );
            updateData.media = [...currentMedia, ...newMedia];
          } else {
            // Spot doesn't exist yet, just set the media
            updateData.media = editData.data.media;
          }
        }

        // Handle external references: merge instead of replace
        if (editData.data.external_references) {
          const spotSnapshot = await spotRef.get();
          if (spotSnapshot.exists) {
            const spotData = spotSnapshot.data() as any;
            const currentRefs = spotData["external_references"] || {};
            updateData.external_references = {
              ...currentRefs,
              ...editData.data.external_references,
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
            updateData.external_references = editData.data.external_references;
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
