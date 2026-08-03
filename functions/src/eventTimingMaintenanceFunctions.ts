import * as admin from "firebase-admin";
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import {
  CallableRequest,
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import type { EventSchema } from "../../src/db/schemas/EventSchema";
import {
  isIanaTimeZone,
  legacyExactTiming,
} from "../../src/db/utils/event-timing";
import { eventTimeZoneAt } from "./event-time-zone";

interface BackfillEventTimingRequest {
  dryRun?: unknown;
  limit?: unknown;
  startAfter?: unknown;
}

interface BackfillEventTimingMaintenanceDocument {
  dry_run?: unknown;
  page_size?: unknown;
  start_after?: unknown;
}

const BACKFILL_MAINTENANCE_DOCUMENT =
  "maintenance/run-backfill-event-timing";
const ZURICH_COORDINATE = { lat: 47.3769, lng: 8.5417 };

export interface BackfillEventTimingResult {
  ok: true;
  dryRun: boolean;
  scanned: number;
  migrated: number;
  skipped: number;
  invalid: number;
  failed: number;
  nextCursor?: string;
  done: boolean;
  invalidEvents: Array<{ id: string; reason: string }>;
  failedEvents: Array<{ id: string; error: string }>;
}

const pageSize = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return 100;
  return Math.min(parsed, 250);
};

const requireAdmin = async (uid: string | undefined): Promise<void> => {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to run maintenance.");
  const user = await admin.firestore().doc(`users/${uid}`).get();
  if (user.data()?.["is_admin"] !== true) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
};

const timestampDate = (value: unknown): Date | undefined => {
  if (value instanceof Timestamp) return value.toDate();
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const date = (value as { toDate(): Date }).toDate();
    return Number.isFinite(date.getTime()) ? date : undefined;
  }
  return undefined;
};

const eventCoordinate = (
  event: EventSchema,
): { lat: number; lng: number } | undefined => {
  const raw = event.location_raw;
  if (
    raw &&
    Number.isFinite(raw.lat) &&
    Number.isFinite(raw.lng)
  ) {
    return raw;
  }
  const location = event.location as unknown as
    | { latitude?: number; longitude?: number; lat?: number; lng?: number }
    | undefined;
  const lat = location?.latitude ?? location?.lat;
  const lng = location?.longitude ?? location?.lng;
  return Number.isFinite(lat) && Number.isFinite(lng)
    ? { lat: lat!, lng: lng! }
    : undefined;
};

export function buildLegacyEventTimingPatch(
  event: EventSchema,
): Partial<EventSchema> | null {
  if (event.timing) return {};
  const start = timestampDate(event.start);
  const end = timestampDate(event.end);
  if (!start || !end || end <= start) return null;
  const coordinate = eventCoordinate(event);
  const timeZone = coordinate
    ? eventTimeZoneAt(coordinate)
    : isIanaTimeZone(event.time_zone)
      ? event.time_zone
      : undefined;
  if (!timeZone) return null;
  return {
    timing: legacyExactTiming(start, end, timeZone),
    time_zone: timeZone,
    has_location: coordinate !== undefined,
  };
}

const backfillEventTimingPage = async (
  request: BackfillEventTimingRequest,
): Promise<BackfillEventTimingResult> => {
  const dryRun = request.dryRun !== false;
  const limit = pageSize(request.limit);
  const startAfter =
    typeof request.startAfter === "string" && request.startAfter.length > 0
      ? request.startAfter
      : undefined;
  let query = admin
    .firestore()
    .collection("events")
    .orderBy(FieldPath.documentId())
    .limit(limit + 1);
  if (startAfter) query = query.startAfter(startAfter);
  const snapshot = await query.get();
  const page = snapshot.docs.slice(0, limit);
  const hasMore = snapshot.docs.length > limit;
  const result: BackfillEventTimingResult = {
    ok: true,
    dryRun,
    scanned: page.length,
    migrated: 0,
    skipped: 0,
    invalid: 0,
    failed: 0,
    done: !hasMore,
    invalidEvents: [],
    failedEvents: [],
  };

  for (const document of page) {
    if (document.id === "typesense" || document.id.startsWith("run-")) {
      result.skipped += 1;
      continue;
    }
    const patch = buildLegacyEventTimingPatch(document.data() as EventSchema);
    if (patch === null) {
      result.invalid += 1;
      result.invalidEvents.push({
        id: document.id,
        reason: "valid legacy start, end, and IANA time zone are required",
      });
      continue;
    }
    if (Object.keys(patch).length === 0) {
      result.skipped += 1;
      continue;
    }
    result.migrated += 1;
    if (dryRun) continue;
    try {
      await document.ref.update(patch);
    } catch (error) {
      result.migrated -= 1;
      result.failed += 1;
      result.failedEvents.push({
        id: document.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (hasMore && page.length > 0) {
    result.nextCursor = page.at(-1)?.id;
  }
  return result;
};

/**
 * Resumable, dry-run-first migration for legacy timestamp-only events.
 * Updating an event also invokes the regular authoritative normalization and
 * discovery-projection triggers.
 */
export const backfillEventTiming = onCall(
  { cors: true, invoker: "public", timeoutSeconds: 540 },
  async (
    request: CallableRequest<BackfillEventTimingRequest>,
  ): Promise<BackfillEventTimingResult> => {
    await requireAdmin(request.auth?.uid);
    return backfillEventTimingPage(request.data ?? {});
  },
);

/**
 * Operator-friendly alternative to the callable. Create
 * `maintenance/run-backfill-event-timing` with `{ dry_run: true }`, review the
 * retained result, then delete and recreate it with `{ dry_run: false }`.
 */
export const backfillEventTimingOnCreate = onDocumentCreated(
  { document: BACKFILL_MAINTENANCE_DOCUMENT, timeoutSeconds: 540 },
  async (event) => {
    const reference = event.data?.ref;
    const maintenanceData = event.data?.data() as
      | BackfillEventTimingMaintenanceDocument
      | undefined;
    if (!reference || !maintenanceData) return;

    const dryRun = maintenanceData.dry_run !== false;
    const limit = pageSize(maintenanceData.page_size);
    let cursor =
      typeof maintenanceData.start_after === "string" &&
      maintenanceData.start_after.length > 0
        ? maintenanceData.start_after
        : undefined;
    const total: BackfillEventTimingResult = {
      ok: true,
      dryRun,
      scanned: 0,
      migrated: 0,
      skipped: 0,
      invalid: 0,
      failed: 0,
      done: false,
      invalidEvents: [],
      failedEvents: [],
    };

    await reference.set(
      {
        status: "RUNNING",
        dry_run: dryRun,
        page_size: limit,
        verification: {
          zurich_time_zone: eventTimeZoneAt(ZURICH_COORDINATE),
        },
        started_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    try {
      do {
        const page = await backfillEventTimingPage({
          dryRun,
          limit,
          startAfter: cursor,
        });
        total.scanned += page.scanned;
        total.migrated += page.migrated;
        total.skipped += page.skipped;
        total.invalid += page.invalid;
        total.failed += page.failed;
        total.invalidEvents.push(...page.invalidEvents);
        total.failedEvents.push(...page.failedEvents);
        cursor = page.nextCursor;

        await reference.set(
          {
            progress: {
              scanned: total.scanned,
              migrated: total.migrated,
              skipped: total.skipped,
              invalid: total.invalid,
              failed: total.failed,
            },
            next_cursor: cursor ?? FieldValue.delete(),
          },
          { merge: true },
        );
      } while (cursor);

      total.done = true;
      await reference.set(
        {
          status: total.failed > 0 ? "DONE_WITH_ERRORS" : "DONE",
          result: total,
          completed_at: FieldValue.serverTimestamp(),
          next_cursor: FieldValue.delete(),
        },
        { merge: true },
      );
    } catch (error) {
      await reference.set(
        {
          status: "ERROR",
          error: error instanceof Error ? error.message : String(error),
          completed_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      throw error;
    }
  },
);
