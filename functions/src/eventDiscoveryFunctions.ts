import * as admin from "firebase-admin";
import { FieldPath } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import {
  EVENT_DISCOVERY_COLLECTION,
  buildEventDiscoveryProjection,
} from "../../src/db/schemas/EventDiscoverySchema";
import { EventSchema } from "../../src/db/schemas/EventSchema";

const EVENTS_COLLECTION = "events";
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
    if (!projection) {
      await target.delete();
      return;
    }
    await target.set(projection);
  },
);

interface RebuildEventDiscoveryRequest {
  dryRun?: unknown;
  limit?: unknown;
  startAfter?: unknown;
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

    const dryRun = request.data?.dryRun !== false;
    const startAfter =
      typeof request.data?.startAfter === "string" &&
      request.data.startAfter.length > 0
        ? request.data.startAfter
        : undefined;
    const limit = pageSize(request.data?.limit);
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
        if (projection) {
          await target.set(projection);
        } else {
          await target.delete();
        }
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
  },
);
