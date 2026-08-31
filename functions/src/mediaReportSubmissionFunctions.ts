import {createHash} from "node:crypto";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {
  areGuestMediaReportReasons,
  isMediaReportReasons,
  type SubmitMediaReportRequest,
  type SubmitMediaReportResponse,
} from "../../src/db/schemas/MediaReportPolicy";
import type {
  GetOwnReportResponse,
  OwnReportSummary,
  OwnReportTargetRequest,
  WithdrawOwnReportRequest,
} from "../../src/db/schemas/ReportLifecycleSchema";
import {
  isActiveReport,
  recordValue,
  reportClaimId,
  reportReasons,
  reportTargetKeyForMedia,
  stringValue,
  type UnknownRecord as LifecycleUnknownRecord,
} from "./reportLifecycleHelpers";
import {closeSafetyCaseForWithdrawnSource} from "./safetyCaseProjectionFunctions";

const CALLABLE_OPTIONS = {cors: true, invoker: "public" as const};
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const PRIVATE_METADATA_RETENTION_MS = 90 * DAY_MS;
const GUEST_REPORTS_PER_HOUR = 12;
const AUTHENTICATED_REPORTS_PER_HOUR = 30;
const NETWORK_REPORTS_PER_HOUR = 60;
const REPORTS_PER_TARGET_PER_DAY = 5;

type UnknownRecord = Record<string, unknown>;

const reportMatchesMediaTarget = (data: LifecycleUnknownRecord, targetKey: string): boolean => {
  if (stringValue(data["target_key"]) === targetKey) return true;
  const media = recordValue(data["media"]);
  const type = stringValue(media["type"]);
  const src = stringValue(media["src"]);
  if (!type || !src) return false;
  return reportTargetKeyForMedia(
    {type, src},
    stringValue(data["context"]),
    stringValue(data["targetId"]),
  ) === targetKey;
};

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

const cleanDuplicateMedia = (
  value: unknown,
  currentMedia: SubmitMediaReportRequest["media"],
  required: boolean,
): {type: string; src: string} | undefined => {
  const input = recordValue(value);
  const src = cleanUrl(input["src"], "duplicateMedia.src", required);
  if (!src) return undefined;
  if (src === currentMedia.src) {
    throw new HttpsError("invalid-argument", "duplicateMedia must refer to different media.");
  }
  return {type: currentMedia.type, src};
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
    const rawReasons = input["reasons"] ??
      (input["reason"] === undefined ? [] : [input["reason"]]);
    if (!isMediaReportReasons(rawReasons)) {
      throw new HttpsError("invalid-argument", "Select at least one supported report reason.");
    }
    const reasons = [...new Set(rawReasons)];

    const uid = request.auth?.uid;
    if (!uid && !areGuestMediaReportReasons(reasons)) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to submit media quality reports.",
      );
    }

    const media = cleanMedia(input["media"]);
    const duplicateMedia = cleanDuplicateMedia(
      input["duplicateMedia"],
      media,
      reasons.includes("duplicate"),
    );
    if (!reasons.includes("duplicate") && input["duplicateMedia"] !== undefined) {
      throw new HttpsError("invalid-argument", "duplicateMedia is only allowed with the duplicate reason.");
    }
    const comment = cleanText(
      input["comment"],
      "comment",
      2_000,
      reasons.includes("other"),
    ) ?? "";
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
    const targetKey = reportTargetKeyForMedia(
      media,
      context as string | undefined,
      targetId ?? spotId,
    );
    const targetIdentity = hash(targetKey);
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
    let reportRef: admin.firestore.DocumentReference | undefined;
    let created = false;
    const now = Timestamp.now();
    await db.runTransaction(async (transaction) => {
      const claimRef = uid ?
        db.doc(`report_claims/${reportClaimId("media", uid, targetKey)}`) :
        undefined;
      const claim = claimRef ? await transaction.get(claimRef) : undefined;
      const existingPath = stringValue(claim?.data()?.["open_report_path"]);
      const claimedReport = existingPath ? await transaction.get(db.doc(existingPath)) : undefined;
      const legacyReports = uid ? await transaction.get(
        db.collection("reports").where("user.uid", "==", uid).limit(200),
      ) : undefined;
      const existing = claimedReport?.exists && isActiveReport(claimedReport.data() as LifecycleUnknownRecord) ?
        claimedReport :
        legacyReports?.docs.find((report) => {
          const data = report.data() as LifecycleUnknownRecord;
          return isActiveReport(data) && reportMatchesMediaTarget(data, targetKey);
        });
      if (uid && existing) {
        reportRef = existing.ref;
        transaction.update(existing.ref, {
          media,
          reasons,
          reason: reasons[0],
          comment,
          ...(locale ? {locale} : {locale: FieldValue.delete()}),
          ...(spotId ? {spotId} : {spotId: FieldValue.delete()}),
          ...(context ? {context} : {context: FieldValue.delete()}),
          ...(targetId ? {targetId} : {targetId: FieldValue.delete()}),
          ...(duplicateMedia ? {duplicate_media: duplicateMedia} : {duplicate_media: FieldValue.delete()}),
          updated_at: now,
        });
        transaction.set(claimRef!, {
          kind: "media",
          uid,
          target: targetKey,
          open_report_path: existing.ref.path,
          updated_at: now,
        }, {merge: true});
        return;
      }
      await enforceRateLimits(transaction, limits);
      reportRef = db.collection("reports").doc();
      created = true;
      transaction.create(reportRef, {
        kind: "media",
        media,
        reasons,
        reason: reasons[0],
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
        updated_at: now,
        target_key: targetKey,
        ...(locale ? {locale} : {}),
        ...(spotId ? {spotId} : {}),
        ...(context ? {context} : {}),
        ...(targetId ? {targetId} : {}),
        ...(duplicateMedia ? {duplicate_media: duplicateMedia} : {}),
        submission: {
          channel: "callable",
          canonical: true,
          accepted_at: now,
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
      if (claimRef) {
        transaction.set(claimRef, {
          kind: "media",
          uid,
          target: targetKey,
          open_report_path: reportRef.path,
          updated_at: now,
        });
      }
    });

    return {reportId: reportRef!.id, created};
  },
);

const mediaSummary = (
  id: string,
  data: LifecycleUnknownRecord,
): OwnReportSummary => {
  const media = recordValue(data["media"]);
  const duplicateMedia = recordValue(data["duplicate_media"]);
  const status = data["status"];
  const safeStatus = status === "resolved" || status === "dismissed" || status === "withdrawn" ?
    status :
    "open";
  return {
    id,
    kind: "media",
    status: safeStatus,
    reasons: reportReasons(data),
    comment: stringValue(data["comment"]) ?? "",
    ...(data["createdAt"] ? {createdAt: data["createdAt"]} : {}),
    ...(data["updated_at"] ? {updatedAt: data["updated_at"]} : {}),
    ...(data["withdrawn_at"] ? {withdrawnAt: data["withdrawn_at"]} : {}),
    media: {
      type: stringValue(media["type"]) ?? "image",
      src: stringValue(media["src"]) ?? "",
    },
    ...(stringValue(duplicateMedia["src"]) ? {
      duplicateMedia: {
        type: stringValue(duplicateMedia["type"]) ?? "image",
        src: stringValue(duplicateMedia["src"])!,
      },
    } : {}),
    ...(stringValue(data["targetId"]) ? {targetId: stringValue(data["targetId"])} : {}),
    ...(data["context"] === "spot" || data["context"] === "event" || data["context"] === "media" ?
      {context: data["context"]} : {}),
  };
};

export const getOwnMediaReport = onCall<OwnReportTargetRequest, Promise<GetOwnReportResponse>>(
  CALLABLE_OPTIONS,
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to view your reports.");
    const target = request.data?.media;
    if (request.data?.kind !== "media" || !target?.type || !target.src) {
      throw new HttpsError("invalid-argument", "A media target is required.");
    }
    const targetKey = reportTargetKeyForMedia(target, target.context, target.targetId);
    const db = admin.firestore();
    const claim = await db.doc(
      `report_claims/${reportClaimId("media", uid, targetKey)}`,
    ).get();
    const path = stringValue(claim.data()?.["open_report_path"]);
    const claimedReport = path ? await db.doc(path).get() : undefined;
    const report = claimedReport?.exists && isActiveReport(claimedReport.data() as LifecycleUnknownRecord) ?
      claimedReport :
      (await db.collection("reports").where("user.uid", "==", uid).limit(200).get()).docs.find((candidate) => {
        const data = candidate.data() as LifecycleUnknownRecord;
        return isActiveReport(data) && reportMatchesMediaTarget(data, targetKey);
      });
    if (!report?.exists || !isActiveReport(report.data() as LifecycleUnknownRecord)) {
      return {report: null};
    }
    return {report: mediaSummary(report.id, report.data() as LifecycleUnknownRecord)};
  },
);

export const withdrawOwnMediaReport = onCall<WithdrawOwnReportRequest, Promise<{withdrawn: boolean}>>(
  CALLABLE_OPTIONS,
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to withdraw a report.");
    const reportId = cleanText(request.data?.reportId, "reportId", 128, true)!;
    const db = admin.firestore();
    const reportRef = db.doc(`reports/${reportId}`);
    await db.runTransaction(async (transaction) => {
      const report = await transaction.get(reportRef);
      const data = report.data() as LifecycleUnknownRecord | undefined;
      if (!report.exists || stringValue(recordValue(recordValue(data)["user"])["uid"]) !== uid) {
        throw new HttpsError("permission-denied", "You can only withdraw your own report.");
      }
      if (!isActiveReport(data ?? {})) return;
      const media = recordValue(data?.["media"]);
      const targetKey = stringValue(data?.["target_key"]);
      const now = Timestamp.now();
      transaction.update(reportRef, {status: "withdrawn", withdrawn_at: now, updated_at: now});
      if (targetKey) {
        transaction.set(db.doc(`report_claims/${reportClaimId("media", uid, targetKey)}`), {
          open_report_path: FieldValue.delete(),
          updated_at: now,
        }, {merge: true});
      }
      logger.info("Reporter withdrew media report", {reportId, mediaSrc: media["src"]});
    });
    await closeSafetyCaseForWithdrawnSource(reportRef.path);
    return {withdrawn: true};
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
