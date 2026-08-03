import {createHash} from "node:crypto";
import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {
  isGuestMediaReportReason,
  isMediaReportReason,
  type SubmitMediaReportRequest,
  type SubmitMediaReportResponse,
} from "../../src/db/schemas/MediaReportPolicy";

const CALLABLE_OPTIONS = {cors: true, invoker: "public" as const};
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const PRIVATE_METADATA_RETENTION_MS = 90 * DAY_MS;
const GUEST_REPORTS_PER_HOUR = 12;
const AUTHENTICATED_REPORTS_PER_HOUR = 30;
const NETWORK_REPORTS_PER_HOUR = 60;
const REPORTS_PER_TARGET_PER_DAY = 5;

type UnknownRecord = Record<string, unknown>;

interface RateLimit {
  key: string;
  maximum: number;
  expiresAt: Timestamp;
}

const cleanText = (
  value: unknown,
  field: string,
  maximum: number,
  required = false,
): string | undefined => {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new HttpsError("invalid-argument", `${field} is required.`);
    }
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }
  const cleaned = Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127) ?
        " " :
        character;
    })
    .join("")
    .replace(/\s+/gu, " ")
    .trim();
  if (!cleaned || cleaned.length > maximum) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must contain at most ${maximum} characters.`,
    );
  }
  return cleaned;
};

const cleanUrl = (
  value: unknown,
  field: string,
  required = false,
): string | undefined => {
  const cleaned = cleanText(value, field, 2_048, required);
  if (!cleaned) return undefined;
  try {
    const url = new URL(cleaned);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be a valid public URL.`,
    );
  }
  return cleaned;
};

const cleanEmail = (value: unknown): string | undefined => {
  const email = cleanText(value, "reporterEmail", 240)?.toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new HttpsError(
      "invalid-argument",
      "reporterEmail must be a valid email address.",
    );
  }
  return email;
};

const cleanMedia = (
  value: unknown,
): SubmitMediaReportRequest["media"] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "media must be an object.");
  }
  const media = value as UnknownRecord;
  const type = cleanText(media["type"], "media.type", 20, true);
  if (type !== "image" && type !== "video") {
    throw new HttpsError("invalid-argument", "Unsupported media type.");
  }
  const src = cleanUrl(media["src"], "media.src", true);
  if (!src) {
    throw new HttpsError("invalid-argument", "media.src is required.");
  }
  const userId =
    cleanText(media["userId"], "media.userId", 128) ??
    cleanText(media["uid"], "media.uid", 128);
  const sourcePageUrl = cleanUrl(
    media["source_page_url"],
    "media.source_page_url",
  );
  const isInStorage =
    media["is_in_storage"] === true || media["isInStorage"] === true;

  return {
    type,
    src,
    ...(userId ? {userId} : {}),
    ...(sourcePageUrl ? {source_page_url: sourcePageUrl} : {}),
    ...(isInStorage ? {is_in_storage: true} : {}),
  };
};

const hash = (value: string): string =>
  createHash("sha256").update(`media-report-v1:${value}`).digest("hex");

const requestIp = (request: {
  rawRequest: { ip?: string; socket?: { remoteAddress?: string | null } };
}): string | undefined => {
  const value =
    request.rawRequest.ip ?? request.rawRequest.socket?.remoteAddress;
  return typeof value === "string" && value.length <= 128 ? value : undefined;
};

const header = (
  headers: Record<string, string | string[] | undefined>,
  name: string,
  maximum: number,
): string | undefined => {
  const value = headers[name];
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && candidate.length <= maximum ?
    candidate :
    undefined;
};

const rateLimit = (
  namespace: string,
  identity: string,
  windowStart: number,
  maximum: number,
  duration: number,
): RateLimit => ({
  key: hash(`${namespace}:${identity}:${windowStart}`),
  maximum,
  expiresAt: Timestamp.fromMillis(windowStart + duration + DAY_MS),
});

const enforceRateLimits = async (
  transaction: admin.firestore.Transaction,
  limits: RateLimit[],
): Promise<void> => {
  const db = admin.firestore();
  const refs = limits.map((limit) =>
    db.doc(`report_rate_limits/${limit.key}`),
  );
  const snapshots = await transaction.getAll(...refs);
  for (const [index, limit] of limits.entries()) {
    const ref = refs[index];
    const snapshot = snapshots[index];
    const count = snapshot.data()?.["count"];
    const currentCount = typeof count === "number" ? count : 0;
    if (currentCount >= limit.maximum) {
      throw new HttpsError(
        "resource-exhausted",
        "Too many reports were submitted. Please try again later.",
      );
    }
    transaction.set(
      ref,
      {
        count: currentCount + 1,
        updated_at: Timestamp.now(),
        expires_at: limit.expiresAt,
      },
      {merge: true},
    );
  }
};

export const submitMediaReport = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<SubmitMediaReportResponse> => {
    const input = (request.data ?? {}) as UnknownRecord;
    const reason = input["reason"];
    if (!isMediaReportReason(reason)) {
      throw new HttpsError("invalid-argument", "Unsupported report reason.");
    }

    const uid = request.auth?.uid;
    if (!uid && !isGuestMediaReportReason(reason)) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to submit media quality reports.",
      );
    }

    const media = cleanMedia(input["media"]);
    const comment = cleanText(input["comment"], "comment", 2_000) ?? "";
    const reporterEmail = uid ? undefined : cleanEmail(input["reporterEmail"]);
    const locale = cleanText(input["locale"], "locale", 20);
    const spotId = cleanText(input["spotId"], "spotId", 128);
    const targetId = cleanText(input["targetId"], "targetId", 128);
    const context = input["context"];
    if (
      context !== undefined &&
      context !== "spot" &&
      context !== "event" &&
      context !== "media"
    ) {
      throw new HttpsError("invalid-argument", "Unsupported report context.");
    }

    const ipAddress = requestIp(request);
    const headers = request.rawRequest.headers;
    const userAgent = header(headers, "user-agent", 500);
    const origin = header(headers, "origin", 300);
    const appId = request.app?.appId;
    const networkIdentity = hash(
      ipAddress ?? `${appId ?? "no-app"}:${userAgent ?? "no-user-agent"}`,
    );
    const reporterIdentity = uid ? `uid:${uid}` : `network:${networkIdentity}`;
    const targetIdentity = hash(
      targetId ?? spotId ?? `${media.type}:${media.src}`,
    );
    const nowMs = Date.now();
    const hourStart = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
    const dayStart = Math.floor(nowMs / DAY_MS) * DAY_MS;
    const limits = [
      rateLimit(
        "reporter-hour",
        reporterIdentity,
        hourStart,
        uid ? AUTHENTICATED_REPORTS_PER_HOUR : GUEST_REPORTS_PER_HOUR,
        HOUR_MS,
      ),
      rateLimit(
        "reporter-target-day",
        `${reporterIdentity}:${targetIdentity}`,
        dayStart,
        REPORTS_PER_TARGET_PER_DAY,
        DAY_MS,
      ),
      ...(uid ?
        [
          rateLimit(
            "network-hour",
            networkIdentity,
            hourStart,
            NETWORK_REPORTS_PER_HOUR,
            HOUR_MS,
          ),
        ] :
        []),
    ];

    const db = admin.firestore();
    const reportRef = db.collection("reports").doc();
    const now = Timestamp.now();
    await db.runTransaction(async (transaction) => {
      await enforceRateLimits(transaction, limits);
      transaction.create(reportRef, {
        kind: "media",
        media,
        reason,
        comment,
        user: uid ?
          {uid} :
          {
            ...(reporterEmail ? {email: reporterEmail} : {}),
            email_verified: false,
          },
        createdAt: now,
        source: "user",
        status: "open",
        ...(locale ? {locale} : {}),
        ...(spotId ? {spotId} : {}),
        ...(context ? {context} : {}),
        ...(targetId ? {targetId} : {}),
        submission: {
          channel: "callable",
          authenticated: Boolean(uid),
          app_check: Boolean(request.app),
          ...(appId ? {app_id: appId} : {}),
          ...(ipAddress ? {ip_address: ipAddress} : {}),
          ip_hash: networkIdentity,
          ...(userAgent ? {user_agent: userAgent} : {}),
          ...(origin ? {origin} : {}),
          contact_email_verified: Boolean(uid),
          metadata_expires_at: Timestamp.fromMillis(
            nowMs + PRIVATE_METADATA_RETENTION_MS,
          ),
        },
      });
    });

    return {reportId: reportRef.id};
  },
);

export const cleanupMediaReportSubmissionMetadata = onSchedule(
  "every 24 hours",
  async () => {
    const db = admin.firestore();
    const now = Timestamp.now();
    const [reports, limits] = await Promise.all([
      db
        .collection("reports")
        .where("submission.metadata_expires_at", "<=", now)
        .limit(200)
        .get(),
      db
        .collection("report_rate_limits")
        .where("expires_at", "<=", now)
        .limit(250)
        .get(),
    ]);
    const batch = db.batch();

    for (const report of reports.docs) {
      if (report.data()["incident_path"]) {
        batch.update(report.ref, {
          "submission.metadata_expires_at":
            FieldValue.delete(),
        });
        continue;
      }
      batch.update(report.ref, {
        "submission.app_id": FieldValue.delete(),
        "submission.ip_address": FieldValue.delete(),
        "submission.ip_hash": FieldValue.delete(),
        "submission.user_agent": FieldValue.delete(),
        "submission.origin": FieldValue.delete(),
        "submission.metadata_expires_at":
          FieldValue.delete(),
      });
    }
    for (const limit of limits.docs) {
      batch.delete(limit.ref);
    }
    await batch.commit();
  },
);
