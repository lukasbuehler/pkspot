import * as admin from "firebase-admin";
import {FieldPath, FieldValue} from "firebase-admin/firestore";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {
  buildPublicImportProvenance,
  PublicImportProvenanceProjection,
  publicImportProvenanceEqual,
} from "./importProvenanceProjection";

const RUN_DOCUMENT = "maintenance/run-backfill-public-import-provenance";
const STATE_DOCUMENT = "maintenance/public-import-provenance-backfill";
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 250;

type BackfillPhase = "import_id" | "source";
type BackfillCounts = {
  scanned: number;
  linked: number;
  changed: number;
  written: number;
  missing_imports: number;
};
type BackfillCursor = {value: string; document_id: string};

const emptyCounts = (): BackfillCounts => ({
  scanned: 0,
  linked: 0,
  changed: 0,
  written: 0,
  missing_imports: 0,
});

export const pageSizeFrom = (value: unknown): number =>
  typeof value === "number" && Number.isInteger(value)
    ? Math.max(1, Math.min(MAX_PAGE_SIZE, value))
    : DEFAULT_PAGE_SIZE;

export const countsFrom = (value: unknown): BackfillCounts => {
  const data = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const count = (key: keyof BackfillCounts): number =>
    typeof data[key] === "number" && Number.isFinite(data[key])
      ? Math.max(0, data[key])
      : 0;
  return {
    scanned: count("scanned"),
    linked: count("linked"),
    changed: count("changed"),
    written: count("written"),
    missing_imports: count("missing_imports"),
  };
};

export const cursorFrom = (value: unknown): BackfillCursor | null => {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  return typeof data["value"] === "string" &&
    typeof data["document_id"] === "string"
    ? {value: data["value"], document_id: data["document_id"]}
    : null;
};

export const isImportDocumentId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= 180 &&
  !value.includes("/");

/**
 * Resumable, dry-run-first public attribution backfill. The retained state is
 * keyed by the Eventarc event id, so a retry resumes while a recreated trigger
 * starts a fresh run.
 */
export const backfillPublicImportProvenanceOnCreate = onDocumentCreated(
  {document: RUN_DOCUMENT, timeoutSeconds: 540, retry: true},
  async (event) => {
    const trigger = event.data;
    if (!trigger) return;

    const db = admin.firestore();
    const stateRef = db.doc(STATE_DOCUMENT);
    const dryRun = trigger.data()?.["dry_run"] !== false;
    const pageSize = pageSizeFrom(trigger.data()?.["page_size"]);
    const previousState = (await stateRef.get()).data();
    const isRetry = previousState?.["active_event_id"] === event.id;
    if (isRetry && previousState?.["status"] === "DONE") {
      await trigger.ref.delete();
      return;
    }
    let phase: BackfillPhase = isRetry && previousState?.["phase"] === "source"
      ? "source"
      : "import_id";
    let cursor = isRetry ? cursorFrom(previousState?.["cursor"]) : null;
    const counts = isRetry ? countsFrom(previousState?.["counts"]) : emptyCounts();

    await stateRef.set(
      {
        active_event_id: event.id,
        status: "RUNNING",
        dry_run: dryRun,
        page_size: pageSize,
        phase,
        counts,
        cursor: cursor ?? FieldValue.delete(),
        error: FieldValue.delete(),
        ...(isRetry ? {} : {started_at: FieldValue.serverTimestamp()}),
        updated_at: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    try {
      while (true) {
        let query = db.collection("spots")
          .where(phase, ">", "")
          .orderBy(phase)
          .orderBy(FieldPath.documentId())
          .limit(pageSize);
        if (cursor) query = query.startAfter(cursor.value, cursor.document_id);
        const page = await query.get();

        if (page.empty) {
          if (phase === "import_id") {
            phase = "source";
            cursor = null;
            await stateRef.set({
              phase,
              cursor: FieldValue.delete(),
              updated_at: FieldValue.serverTimestamp(),
            }, {merge: true});
            continue;
          }
          break;
        }

        const imports = new Map<
          string,
          {exists: boolean; projection: PublicImportProvenanceProjection | null}
        >();
        const pendingWrites: Array<{
          ref: FirebaseFirestore.DocumentReference;
          projection: PublicImportProvenanceProjection | null;
        }> = [];

        for (const spot of page.docs) {
          counts.scanned += 1;
          const data = spot.data();
          if (phase === "source" && typeof data["import_id"] === "string") {
            continue;
          }
          const importId = data[phase];
          if (!isImportDocumentId(importId)) continue;

          let imported = imports.get(importId);
          if (!imported) {
            const snapshot = await db.collection("imports").doc(importId).get();
            imported = {
              exists: snapshot.exists,
              projection: buildPublicImportProvenance(snapshot.data()),
            };
            imports.set(importId, imported);
          }
          if (!imported.exists && phase === "source") continue;
          if (!imported.exists) counts.missing_imports += 1;
          counts.linked += 1;
          if (
            publicImportProvenanceEqual(
              data["public_import_provenance"] as
                | PublicImportProvenanceProjection
                | null
                | undefined,
              imported.projection,
            )
          ) {
            continue;
          }
          counts.changed += 1;
          pendingWrites.push({ref: spot.ref, projection: imported.projection});
        }

        const last = page.docs.at(-1)!;
        const nextCursor = {
          value: String(last.data()[phase]),
          document_id: last.id,
        };
        const checkpointCounts = {
          ...counts,
          written: counts.written + (dryRun ? 0 : pendingWrites.length),
        };
        const batch = db.batch();
        if (!dryRun) {
          for (const write of pendingWrites) {
            batch.update(write.ref, {
              public_import_provenance: write.projection,
            });
          }
        }
        batch.set(stateRef, {
          phase,
          cursor: nextCursor,
          counts: checkpointCounts,
          updated_at: FieldValue.serverTimestamp(),
        }, {merge: true});
        await batch.commit();
        cursor = nextCursor;
        Object.assign(counts, checkpointCounts);
        if (page.size < pageSize) {
          if (phase === "import_id") {
            phase = "source";
            cursor = null;
            continue;
          }
          break;
        }
      }

      await stateRef.set({
        status: "DONE",
        phase,
        counts,
        cursor: FieldValue.delete(),
        completed_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      }, {merge: true});
      await trigger.ref.delete();
    } catch (error) {
      await stateRef.set({
        status: "FAILED",
        phase,
        cursor: cursor ?? FieldValue.delete(),
        counts,
        error: error instanceof Error ? error.message : String(error),
        updated_at: FieldValue.serverTimestamp(),
      }, {merge: true});
      throw error;
    }
  },
);
