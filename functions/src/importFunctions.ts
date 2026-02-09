import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { computeTileCoordinates } from "../../src/scripts/TileCoordinateHelpers";

interface ImportChunkSpot {
  name: string;
  language: string;
  description?: string;
  media_urls?: string[];
  location: { lat: number; lng: number };
  bounds?: { lat: number; lng: number }[];
  type?: string;
  access?: string;
  amenities?: Record<string, boolean | null | undefined>;
}

interface ImportChunk {
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  spots: ImportChunkSpot[];
  chunk_index: number;
  spot_count: number;
  imported_count?: number;
  error_message?: string;
}

export const processImportChunkOnCreate = onDocumentCreated(
  "imports/{importId}/chunks/{chunkId}",
  async (event) => {
    const importId = event.params.importId;
    const chunkSnapshot = event.data;

    if (!chunkSnapshot) {
      return;
    }

    const db = admin.firestore();
    const chunkData = chunkSnapshot.data() as ImportChunk;
    const importRef = db.collection("imports").doc(importId);
    const importSnap = await importRef.get();
    const importData = importSnap.data() as any;
    const importCredits = importData?.credits || {};
    const importAttribution = {
      title:
        importCredits.attribution_text ||
        importCredits.source_name ||
        `Import ${importId}`,
      author: importCredits.source_name || undefined,
      source_url: importCredits.website_url || importData?.source_url,
      license: importCredits.license || undefined,
    };

    try {
      await chunkSnapshot.ref.update({ status: "PROCESSING" });

      const batch = db.batch();
      let importedCount = 0;

      for (const spot of chunkData.spots ?? []) {
        if (!spot?.location) continue;

        const latitude = Number(spot.location.lat);
        const longitude = Number(spot.location.lng);
        if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
          continue;
        }

        const spotRef = db.collection("spots").doc();
        const location = new admin.firestore.GeoPoint(latitude, longitude);

        const boundsGeoPoints = Array.isArray(spot.bounds)
          ? spot.bounds
              .filter(
                (p) =>
                  typeof p?.lat === "number" && typeof p?.lng === "number"
              )
              .map((p) => new admin.firestore.GeoPoint(p.lat, p.lng))
          : undefined;
        const boundsRaw =
          spot.bounds?.filter(
            (p) => typeof p?.lat === "number" && typeof p?.lng === "number"
          ) ?? undefined;

        const nameMap = {
          [spot.language || "en"]: spot.name || "Unnamed Spot",
        };

        batch.set(spotRef, {
          name: nameMap,
          description: spot.description
            ? {
                [spot.language || "en"]: spot.description,
              }
            : undefined,
          media:
            Array.isArray(spot.media_urls) && spot.media_urls.length > 0
              ? spot.media_urls.map((url) => ({
                  type: "image",
                  src: url,
                  isInStorage: false,
                  origin: "other",
                  attribution: importAttribution,
                }))
              : undefined,
          location,
          location_raw: { lat: latitude, lng: longitude },
          tile_coordinates: computeTileCoordinates(latitude, longitude),
          bounds: boundsGeoPoints,
          bounds_raw: boundsRaw,
          address: null,
          type: spot.type ?? "other",
          access: spot.access ?? "other",
          amenities: spot.amenities ?? {},
          source: importId,
          is_iconic: false,
          rating: 0,
          num_reviews: 0,
          time_created: admin.firestore.FieldValue.serverTimestamp(),
          time_updated: admin.firestore.FieldValue.serverTimestamp(),
        });
        importedCount++;
      }

      await batch.commit();

      await chunkSnapshot.ref.update({
        status: "COMPLETED",
        imported_count: importedCount,
      });

      let importCompleted = false;
      await db.runTransaction(async (tx) => {
        const importSnap = await tx.get(importRef);
        const importData = importSnap.data() as any;
        const nextProcessed = (importData?.chunk_count_processed ?? 0) + 1;
        const totalChunks = importData?.chunk_count_total ?? 0;
        const nextImported = (importData?.spot_count_imported ?? 0) + importedCount;
        const nextStatus =
          totalChunks > 0 && nextProcessed >= totalChunks
            ? "COMPLETED"
            : "PROCESSING";
        importCompleted = nextStatus === "COMPLETED";

        tx.update(importRef, {
          chunk_count_processed: nextProcessed,
          spot_count_imported: nextImported,
          status: nextStatus,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      // Rebuild cluster tiles as soon as an import completes so new spots appear in cluster mode.
      if (importCompleted) {
        const runRef = db.collection("spot_clusters").doc("run");
        const runSnap = await runRef.get();
        if (runSnap.exists) {
          await runRef.delete();
        }
        await runRef.set({
          triggered_by: "import",
          import_id: importId,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } catch (error: any) {
      await chunkSnapshot.ref.update({
        status: "FAILED",
        error_message: error?.message ?? String(error),
      });
      await importRef.update({
        status: "PARTIAL",
        error_message: error?.message ?? String(error),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      throw error;
    }
  }
);
