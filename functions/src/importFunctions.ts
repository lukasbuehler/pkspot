import * as admin from "firebase-admin";
import { createHash } from "node:crypto";
import { FieldValue, GeoPoint } from "firebase-admin/firestore";
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
  external_references?: {
    google_maps_place_id?: string;
    website_url?: string;
  };
}

interface ImportChunk {
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  spots: ImportChunkSpot[];
  chunk_index: number;
  spot_count: number;
  imported_count?: number;
  error_message?: string;
}

interface ImportDocument {
  credits?: {
    attribution_text?: string;
    source_name?: string;
    website_url?: string;
    license?: string;
  };
  legal?: { public_abandoned_clause_used?: boolean };
  stripping_mode?: boolean;
  viewer_url?: string;
  source_url?: string;
  chunk_count_total?: number;
  chunk_count_processed?: number;
  chunk_count_failed?: number;
  spot_count_imported?: number;
  error_message?: string;
}

const deterministicSpotId = (
  importId: string,
  chunkId: string,
  spotIndex: number
): string =>
  createHash("sha256")
    .update(`${importId}:${chunkId}:${spotIndex}`)
    .digest("hex")
    .slice(0, 32);

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
  const importData = importSnap.data() as ImportDocument | undefined;
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
  const wasFailed = chunkData.status === "FAILED";

  try {
    await chunkRef.update({
      status: "PROCESSING",
      error_message: FieldValue.delete(),
    });

    const batch = db.batch();
    let importedCount = 0;

    for (const [spotIndex, spot] of (chunkData.spots ?? []).entries()) {
      if (!spot?.location) continue;

      const latitude = Number(spot.location.lat);
      const longitude = Number(spot.location.lng);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        continue;
      }

      // Stable IDs make event redelivery and manual chunk retries overwrite
      // the same spots instead of silently duplicating a committed batch.
      const spotRef = db
        .collection("spots")
        .doc(deterministicSpotId(importId, chunkRef.id, spotIndex));
      const location = new GeoPoint(latitude, longitude);

      const boundsGeoPoints = Array.isArray(spot.bounds)
        ? spot.bounds
            .filter(
              (p) => typeof p?.lat === "number" && typeof p?.lng === "number"
            )
            .map((p) => new GeoPoint(p.lat, p.lng))
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
        external_references: spot.external_references,
        source: importId,
        import_id: importId,
        community_rebuild_deferred: true,
        is_iconic: false,
        rating: 0,
        num_reviews: 0,
        time_created: FieldValue.serverTimestamp(),
        time_updated: FieldValue.serverTimestamp(),
      });
      batch.set(spotRef, spotPayload);
      importedCount++;
    }

    await batch.commit();

    await db.runTransaction(async (tx) => {
      const [latestImportSnap, latestChunkSnap] = await Promise.all([
        tx.get(importRef),
        tx.get(chunkRef),
      ]);
      if (latestChunkSnap.data()?.status === "COMPLETED") {
        return;
      }

      const latestImportData = latestImportSnap.data() as
        | ImportDocument
        | undefined;
      const nextProcessed = (latestImportData?.chunk_count_processed ?? 0) + 1;
      const nextFailed = Math.max(
        0,
        (latestImportData?.chunk_count_failed ?? 0) - (wasFailed ? 1 : 0)
      );
      const totalChunks = latestImportData?.chunk_count_total ?? 0;
      const nextImported =
        (latestImportData?.spot_count_imported ?? 0) + importedCount;
      const nextStatus =
        totalChunks > 0 && nextProcessed >= totalChunks && nextFailed === 0
          ? "COMPLETED"
          : nextProcessed + nextFailed >= totalChunks
          ? "PARTIAL"
          : "PROCESSING";

      tx.update(chunkRef, {
        status: "COMPLETED",
        imported_count: importedCount,
        error_message: FieldValue.delete(),
      });
      tx.update(importRef, {
        chunk_count_processed: nextProcessed,
        chunk_count_failed: nextFailed,
        spot_count_imported: nextImported,
        status: nextStatus,
        error_message:
          nextStatus === "COMPLETED"
            ? FieldValue.delete()
            : latestImportData?.error_message ?? FieldValue.delete(),
        updated_at: FieldValue.serverTimestamp(),
      });
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    await chunkRef.update({
      status: "FAILED",
      error_message: errorMessage,
    });
    await db.runTransaction(async (tx) => {
      const latestImportSnap = await tx.get(importRef);
      const latestImportData = latestImportSnap.data() as
        | ImportDocument
        | undefined;
      const processed = latestImportData?.chunk_count_processed ?? 0;
      const failed = Math.max(
        0,
        (latestImportData?.chunk_count_failed ?? 0) + (wasFailed ? 0 : 1)
      );
      const total = latestImportData?.chunk_count_total ?? 0;

      tx.update(importRef, {
        chunk_count_failed: failed,
        status:
          total > 0 && processed + failed >= total
            ? "PARTIAL"
            : "PROCESSING",
        error_message: errorMessage,
        updated_at: FieldValue.serverTimestamp(),
      });
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
