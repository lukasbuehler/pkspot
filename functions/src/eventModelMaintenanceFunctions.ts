import * as admin from "firebase-admin";
import { FieldPath } from "firebase-admin/firestore";
import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import {
  EventOwnerSchema,
  EventSchema,
} from "../../src/db/schemas/EventSchema";
import {
  isEventOwner,
  normalizeEventModel,
} from "../../src/db/schemas/EventNormalization";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 250;

interface BackfillEventModelRequest {
  dryRun?: unknown;
  limit?: unknown;
  startAfter?: unknown;
  fallbackOwner?: unknown;
}

export interface BackfillEventModelResult {
  ok: true;
  dryRun: boolean;
  scanned: number;
  migrated: number;
  skipped: number;
  invalid: number;
  failed: number;
  retryable: number;
  nextCursor?: string;
  done: boolean;
  invalidEvents: Array<{ id: string; fields: string[] }>;
  failedEvents: Array<{ id: string; retryable: boolean; error: string }>;
}

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

export const backfillEventModel = onCall(
  { cors: true, invoker: "public", timeoutSeconds: 540 },
  async (
    request: CallableRequest<BackfillEventModelRequest>,
  ): Promise<BackfillEventModelResult> => {
    await requireAdmin(request.auth?.uid);

    const dryRun = request.data?.dryRun !== false;
    const fallbackOwner = request.data?.fallbackOwner;
    if (fallbackOwner !== undefined && !isEventOwner(fallbackOwner)) {
      throw new HttpsError(
        "invalid-argument",
        "fallbackOwner must be a valid user or organization owner.",
      );
    }
    const startAfter =
      typeof request.data?.startAfter === "string" &&
      request.data.startAfter.length > 0
        ? request.data.startAfter
        : undefined;
    const limit = pageSize(request.data?.limit);
    let query = admin
      .firestore()
      .collection("events")
      .orderBy(FieldPath.documentId())
      .limit(limit + 1);
    if (startAfter) query = query.startAfter(startAfter);
    const snapshot = await query.get();
    const page = snapshot.docs.slice(0, limit);
    const hasMore = snapshot.docs.length > limit;

    const result: BackfillEventModelResult = {
      ok: true,
      dryRun,
      scanned: page.length,
      migrated: 0,
      skipped: 0,
      invalid: 0,
      failed: 0,
      retryable: 0,
      done: !hasMore,
      invalidEvents: [],
      failedEvents: [],
    };

    for (const document of page) {
      if (document.id === "typesense" || document.id.startsWith("run-")) {
        result.skipped += 1;
        continue;
      }
      const normalized = normalizeEventModel(document.data() as EventSchema, {
        fallbackOwner: fallbackOwner as EventOwnerSchema | undefined,
      });
      if (normalized.invalid.length > 0) {
        result.invalid += 1;
        result.invalidEvents.push({
          id: document.id,
          fields: normalized.invalid,
        });
        continue;
      }
      if (Object.keys(normalized.patch).length === 0) {
        result.skipped += 1;
        continue;
      }

      result.migrated += 1;
      if (dryRun) continue;
      try {
        await document.ref.update(normalized.patch);
      } catch (error) {
        result.migrated -= 1;
        result.failed += 1;
        const canRetry = retryableError(error);
        if (canRetry) result.retryable += 1;
        result.failedEvents.push({
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
