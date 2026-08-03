import * as admin from "firebase-admin";
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import {
  EVENT_DISCOVERY_COLLECTION,
  buildEventDiscoveryProjection,
} from "../../src/db/schemas/EventDiscoverySchema";
import { EventSchema } from "../../src/db/schemas/EventSchema";

const EVENTS_COLLECTION = "events";
const REBUILD_MAINTENANCE_DOCUMENT =
  "maintenance/run-rebuild-event-discovery";
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 250;

const isRuntimeEvent = (id: string): boolean =>
  id !== "typesense" && !id.startsWith("run-");

const requireAdmin = async (uid: string | undefined): Promise<void> => {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to run maintenance.");
  const user = await admin.firestore().doc(`users/${uid}`).get();
  if (user.data()?.["is_admin"] !== true) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
};

const pageSize = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(parsed, MAX_PAGE_SIZE);
};

const retryableError = (error: unknown): boolean => {
  const code =
    error && typeof error === "object"
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  return [
    "aborted",
    "deadline-exceeded",
    "internal",
    "resource-exhausted",
    "unavailable",
    "unknown",
    "10",
    "4",
    "13",
    "8",
    "14",
    "2",
  ].includes(code);
};

const messageFor = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const normalizeLegacyTimestampMaps = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalizeLegacyTimestampMaps);
  if (!value || typeof value !== "object") return value;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length === 2 &&
    keys.includes("seconds") &&
    keys.includes("nanoseconds") &&
    typeof record["seconds"] === "number" &&
    typeof record["nanoseconds"] === "number"
  ) {
    return new Timestamp(record["seconds"], record["nanoseconds"]);
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [
      key,
      normalizeLegacyTimestampMaps(entry),
    ]),
  );
};

const writeEventDiscoveryProjection = async (
  target: FirebaseFirestore.DocumentReference,
  projection: ReturnType<typeof buildEventDiscoveryProjection>,
): Promise<void> => {
  if (!projection) {
    await target.delete();
    return;
  }
  await target.set(
    normalizeLegacyTimestampMaps(projection) as FirebaseFirestore.DocumentData,
  );
};

export const syncEventDiscoveryOnEventWrite = onDocumentWritten(
  `${EVENTS_COLLECTION}/{eventId}`,
  async (event) => {
    const eventId = event.params.eventId;
    if (!isRuntimeEvent(eventId)) return;

    const target = admin
      .firestore()
      .collection(EVENT_DISCOVERY_COLLECTION)
      .doc(eventId);
    const after = event.data?.after;
    if (!after?.exists) {
      await target.delete();
      return;
    }

    const projection = buildEventDiscoveryProjection(
      after.data() as EventSchema,
    );
    await writeEventDiscoveryProjection(target, projection);
  },
);

interface RebuildEventDiscoveryRequest {
  dryRun?: unknown;
  limit?: unknown;
  startAfter?: unknown;
}

interface RebuildEventDiscoveryMaintenanceDocument {
  dry_run?: unknown;
  page_size?: unknown;
  start_after?: unknown;
}

export interface RebuildEventDiscoveryResult {
  ok: true;
  dryRun: boolean;
  scanned: number;
  projected: number;
  removed: number;
  skipped: number;
  failed: number;
  retryable: number;
  nextCursor?: string;
  done: boolean;
  failures: Array<{ id: string; retryable: boolean; error: string }>;
}

const rebuildEventDiscoveryPage = async (
  request: RebuildEventDiscoveryRequest,
): Promise<RebuildEventDiscoveryResult> => {
  const dryRun = request.dryRun !== false;
  const startAfter =
    typeof request.startAfter === "string" && request.startAfter.length > 0
      ? request.startAfter
      : undefined;
  const limit = pageSize(request.limit);
  let query = admin
    .firestore()
    .collection(EVENTS_COLLECTION)
    .orderBy(FieldPath.documentId())
    .limit(limit + 1);
  if (startAfter) query = query.startAfter(startAfter);
  const snapshot = await query.get();
  const page = snapshot.docs.slice(0, limit);
  const hasMore = snapshot.docs.length > limit;
  const result: RebuildEventDiscoveryResult = {
    ok: true,
    dryRun,
    scanned: page.length,
    projected: 0,
    removed: 0,
    skipped: 0,
    failed: 0,
    retryable: 0,
    done: !hasMore,
    failures: [],
  };

  for (const document of page) {
    if (!isRuntimeEvent(document.id)) {
      result.skipped += 1;
      continue;
    }
    const projection = buildEventDiscoveryProjection(
      document.data() as EventSchema,
    );
    if (projection) {
      result.projected += 1;
    } else {
      result.removed += 1;
    }
    if (dryRun) continue;

    try {
      const target = admin
        .firestore()
        .collection(EVENT_DISCOVERY_COLLECTION)
        .doc(document.id);
      await writeEventDiscoveryProjection(target, projection);
    } catch (error) {
      if (projection) {
        result.projected -= 1;
      } else {
        result.removed -= 1;
      }
      result.failed += 1;
      const canRetry = retryableError(error);
      if (canRetry) result.retryable += 1;
      result.failures.push({
        id: document.id,
        retryable: canRetry,
        error: messageFor(error),
      });
    }
  }

  if (hasMore && page.length > 0) {
    result.nextCursor = page.at(-1)?.id;
  }
  return result;
};

/**
 * Resumable projection rebuild. It never mutates canonical event documents.
 * Dry-run is the default so operators can inspect counts before materializing.
 */
export const rebuildEventDiscovery = onCall(
  { cors: true, invoker: "public", timeoutSeconds: 540 },
  async (
    request: CallableRequest<RebuildEventDiscoveryRequest>,
  ): Promise<RebuildEventDiscoveryResult> => {
    await requireAdmin(request.auth?.uid);
    return rebuildEventDiscoveryPage(request.data ?? {});
  },
);

/**
 * Operator-friendly alternative to the callable. Create
 * `maintenance/run-rebuild-event-discovery` with `{ dry_run: false }`.
 * The run document retains progress and the final result for auditing.
 */
export const rebuildEventDiscoveryOnCreate = onDocumentCreated(
  { document: REBUILD_MAINTENANCE_DOCUMENT, timeoutSeconds: 540 },
  async (event) => {
    const reference = event.data?.ref;
    const maintenanceData = event.data?.data() as
      | RebuildEventDiscoveryMaintenanceDocument
      | undefined;
    if (!reference || !maintenanceData) return;

    const dryRun = maintenanceData.dry_run !== false;
    const limit = pageSize(maintenanceData.page_size);
    let cursor =
      typeof maintenanceData.start_after === "string" &&
      maintenanceData.start_after.length > 0
        ? maintenanceData.start_after
        : undefined;
    const total: RebuildEventDiscoveryResult = {
      ok: true,
      dryRun,
      scanned: 0,
      projected: 0,
      removed: 0,
      skipped: 0,
      failed: 0,
      retryable: 0,
      done: false,
      failures: [],
    };

    await reference.set(
      {
        status: "RUNNING",
        dry_run: dryRun,
        page_size: limit,
        started_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    try {
      do {
        const page = await rebuildEventDiscoveryPage({
          dryRun,
          limit,
          startAfter: cursor,
        });
        total.scanned += page.scanned;
        total.projected += page.projected;
        total.removed += page.removed;
        total.skipped += page.skipped;
        total.failed += page.failed;
        total.retryable += page.retryable;
        total.failures.push(...page.failures);
        cursor = page.nextCursor;

        await reference.set(
          {
            progress: {
              scanned: total.scanned,
              projected: total.projected,
              removed: total.removed,
              skipped: total.skipped,
              failed: total.failed,
              retryable: total.retryable,
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
          error: messageFor(error),
          completed_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      throw error;
    }
  },
);
