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

function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function removeUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((entry) => removeUndefinedDeep(entry))
      .filter((entry) => entry !== undefined) as T;
  }

  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (entry === undefined) {
        return;
      }
      out[key] = removeUndefinedDeep(entry);
    });
    return out as T;
  }

  return value;
}

async function processImportChunk(
  importId: string,
  chunkRef: admin.firestore.DocumentReference,
  chunkData: ImportChunk
) {
  const db = admin.firestore();
  const importRef = db.collection("imports").doc(importId);
  const importSnap = await importRef.get();
  const importData = importSnap.data() as any;
  const importCredits = importData?.credits || {};
  const strippingMode =
    importData?.stripping_mode === true ||
    importData?.legal?.public_abandoned_clause_used === true;
  const importAttribution = removeUndefinedDeep({
    title:
      importCredits.attribution_text ||
      importCredits.source_name ||
      `Import ${importId}`,
    author: importCredits.source_name || undefined,
    source_url:
      importData?.viewer_url ||
      importCredits.website_url ||
      importData?.source_url,
    license: importCredits.license || undefined,
  });

  try {
    await chunkRef.update({
      status: "PROCESSING",
      error_message: admin.firestore.FieldValue.delete(),
    });

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
              (p) => typeof p?.lat === "number" && typeof p?.lng === "number"
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

      const spotPayload = removeUndefinedDeep({
        name: nameMap,
        description: !strippingMode && spot.description
          ? {
              [spot.language || "en"]: spot.description,
            }
          : undefined,
        media:
          !strippingMode &&
          Array.isArray(spot.media_urls) &&
          spot.media_urls.length > 0
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
      batch.set(spotRef, spotPayload);
      importedCount++;
    }

    await batch.commit();

    await chunkRef.update({
      status: "COMPLETED",
      imported_count: importedCount,
      error_message: admin.firestore.FieldValue.delete(),
    });

    let importCompleted = false;
    await db.runTransaction(async (tx) => {
      const latestImportSnap = await tx.get(importRef);
      const latestImportData = latestImportSnap.data() as any;
      const nextProcessed = (latestImportData?.chunk_count_processed ?? 0) + 1;
      const totalChunks = latestImportData?.chunk_count_total ?? 0;
      const nextImported = (latestImportData?.spot_count_imported ?? 0) + importedCount;
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
    await chunkRef.update({
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

export const processImportChunkOnCreate = onDocumentCreated(
  "imports/{importId}/chunks/{chunkId}",
  async (event) => {
    const importId = event.params.importId;
    const chunkId = event.params.chunkId;
    const chunkSnapshot = event.data;

    if (!chunkSnapshot || chunkId === "retry") {
      return;
    }

    const chunkData = chunkSnapshot.data() as ImportChunk;
    await processImportChunk(importId, chunkSnapshot.ref, chunkData);
  }
);

export const retryFailedImportChunksOnCreate = onDocumentCreated(
  "imports/{importId}/chunks/retry",
  async (event) => {
    const importId = event.params.importId;
    const retrySnapshot = event.data;

    if (!retrySnapshot) {
      return;
    }

    const db = admin.firestore();
    const chunkCollectionRef = db.collection("imports").doc(importId).collection("chunks");
    let retriedCount = 0;
    let stillFailedCount = 0;

    try {
      const failedChunksSnapshot = await chunkCollectionRef
        .where("status", "==", "FAILED")
        .get();

      for (const failedChunkDoc of failedChunksSnapshot.docs) {
        if (failedChunkDoc.id === "retry") {
          continue;
        }
        try {
          await processImportChunk(
            importId,
            failedChunkDoc.ref,
            failedChunkDoc.data() as ImportChunk
          );
          retriedCount++;
        } catch (error) {
          stillFailedCount++;
          console.error(
            `[imports] Retry failed for chunk ${failedChunkDoc.id} in import ${importId}`,
            error
          );
        }
      }
    } finally {
      await retrySnapshot.ref.delete();
      console.log(
        `[imports] Retry request handled for import ${importId}. Retried: ${retriedCount}, failed again: ${stillFailedCount}`
      );
    }
  }
);
