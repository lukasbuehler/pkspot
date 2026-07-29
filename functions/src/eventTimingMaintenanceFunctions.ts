import * as admin from "firebase-admin";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
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
    const dryRun = request.data?.dryRun !== false;
    const limit = pageSize(request.data?.limit);
    const startAfter =
      typeof request.data?.startAfter === "string" &&
      request.data.startAfter.length > 0
        ? request.data.startAfter
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
      const patch = buildLegacyEventTimingPatch(
        document.data() as EventSchema,
      );
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
  },
);
