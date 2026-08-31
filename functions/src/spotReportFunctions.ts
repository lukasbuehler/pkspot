import * as logger from "firebase-functions/logger";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import type {
  GetOwnReportResponse,
  ListOwnReportsResponse,
  OwnReportSummary,
  OwnReportTargetRequest,
  SubmitSpotReportRequest,
  SubmitSpotReportResponse,
  WithdrawOwnReportRequest,
} from "../../src/db/schemas/ReportLifecycleSchema";
import {SPOT_REPORT_REASONS} from "../../src/db/schemas/SpotReportSchema";
import {persistAuthoritativeReporter} from "./reportIdentity";
import {closeSafetyCaseForWithdrawnSource} from "./safetyCaseProjectionFunctions";
import {
  isActiveReport,
  recordValue,
  refreshSpotReportProjection,
  reportClaimId,
  reportReasons,
  stringValue,
  type UnknownRecord,
} from "./reportLifecycleHelpers";

interface ResolveSpotReportRequest {
  reportPath: string;
  status: "resolved" | "dismissed";
  resolutionNote?: string;
}

const discordWebhookUrl = defineSecret("DISCORD_WEBHOOK_URL");
const SPOT_COMMENT_MAXIMUM = 1_000;

const cleanText = (
  value: unknown,
  field: string,
  maximum: number,
  required = false,
): string | undefined => {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpsError("invalid-argument", `${field} is required.`);
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim();
  if (!cleaned || cleaned.length > maximum) {
    throw new HttpsError("invalid-argument", `${field} must contain at most ${maximum} characters.`);
  }
  return cleaned;
};

const cleanSpotReasons = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "reasons must be an array.");
  }
  const reasons = [...new Set(value.filter((reason): reason is string =>
    typeof reason === "string" && (SPOT_REPORT_REASONS as string[]).includes(reason),
  ))];
  if (reasons.length === 0 || reasons.length !== value.length) {
    throw new HttpsError("invalid-argument", "Select at least one supported report reason.");
  }
  return reasons;
};

const cleanDuplicateOf = (value: unknown, required: boolean) => {
  const input = recordValue(value);
  const id = cleanText(input["id"], "duplicateOf.id", 128, required);
  if (!id) return undefined;
  const name = cleanText(input["name"], "duplicateOf.name", 160);
  return {id, ...(name ? {name} : {})};
};

const spotName = (spot: UnknownRecord, fallback: string): string => {
  const name = spot["name"];
  if (typeof name === "string" && name.trim()) return name.trim();
  if (name && typeof name === "object") {
    for (const value of Object.values(name as UnknownRecord)) {
      const text = typeof value === "string" ? value : stringValue(recordValue(value)["text"]);
      if (text) return text;
    }
  }
  return fallback;
};

const reportSummary = (
  id: string,
  data: UnknownRecord,
  kind: "spot" | "media",
): OwnReportSummary => {
  const status = data["status"];
  const safeStatus = status === "resolved" || status === "dismissed" || status === "withdrawn" ?
    status :
    "open";
  const spot = recordValue(data["spot"]);
  const media = recordValue(data["media"]);
  const duplicateOf = recordValue(data["duplicateOf"]);
  return {
    id,
    kind,
    status: safeStatus,
    reasons: reportReasons(data),
    comment: stringValue(data["comment"]) ?? "",
    ...(data["createdAt"] ? {createdAt: data["createdAt"]} : {}),
    ...(data["updated_at"] ? {updatedAt: data["updated_at"]} : {}),
    ...(data["withdrawn_at"] ? {withdrawnAt: data["withdrawn_at"]} : {}),
    ...(kind === "spot" ? {
      spot: {
        id: stringValue(spot["id"]) ?? "",
        name: stringValue(spot["name"]) ?? stringValue(spot["id"]) ?? "Spot",
      },
      ...(stringValue(duplicateOf["id"]) ? {
        duplicateOf: {
          id: stringValue(duplicateOf["id"])!,
          ...(stringValue(duplicateOf["name"]) ? {name: stringValue(duplicateOf["name"])} : {}),
        },
      } : {}),
    } : {
      media: {
        type: stringValue(media["type"]) ?? "image",
        src: stringValue(media["src"]) ?? "",
      },
      ...(stringValue(data["targetId"]) ? {targetId: stringValue(data["targetId"])} : {}),
      ...(data["context"] === "spot" || data["context"] === "event" || data["context"] === "media" ?
        {context: data["context"]} : {}),
    }),
  };
};

const _isAdminUser = async (uid: string): Promise<boolean> =>
  (await admin.firestore().doc(`users/${uid}`).get()).data()?.["is_admin"] === true;

const _parseSpotReportPath = (path: string): {spotId: string; reportId: string} => {
  const match = path.match(/^spots\/([^/]+)\/reports\/([^/]+)$/);
  if (!match) throw new HttpsError("invalid-argument", "Invalid spot report path.");
  return {spotId: match[1], reportId: match[2]};
};

const formatReporter = (data: UnknownRecord): string => {
  const user = recordValue(data["user"]);
  const identity = stringValue(user["display_name"]) ?? stringValue(user["uid"]) ?? "Unknown";
  const email = stringValue(user["email"]);
  return email ? `${identity} (${email})` : identity;
};

const sendSpotReportDiscord = async (
  spotId: string,
  reportId: string,
  report: UnknownRecord,
): Promise<void> => {
  const webhookUrl = discordWebhookUrl.value();
  if (!webhookUrl) {
    logger.error("DISCORD_WEBHOOK_URL secret not set. Set it with: firebase functions:secrets:set DISCORD_WEBHOOK_URL");
    return;
  }
  const spot = recordValue(report["spot"]);
  const duplicateOf = recordValue(report["duplicateOf"]);
  const appUrl = `https://pkspot.app/en/s/${spotId}`;
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      content: null,
      embeds: [{
        title: "New Spot Report",
        color: 0xffb020,
        url: appUrl,
        fields: [
          {name: "Spot", value: stringValue(spot["name"]) ?? spotId, inline: true},
          {name: "Reasons", value: reportReasons(report).join(", "), inline: true},
          {name: "Report ID", value: reportId, inline: true},
          {name: "Reporter", value: formatReporter(report), inline: false},
          ...(stringValue(duplicateOf["id"]) ? [{
            name: "Duplicate Of",
            value: stringValue(duplicateOf["name"]) ?? stringValue(duplicateOf["id"])!,
            inline: false,
          }] : []),
          ...(stringValue(report["comment"]) ? [{
            name: "More details",
            value: stringValue(report["comment"])!,
            inline: false,
          }] : []),
          {name: "Open Spot", value: appUrl, inline: false},
        ],
        timestamp: new Date().toISOString(),
      }],
    }),
  });
  if (!response.ok) {
    logger.error(`Discord webhook failed with status ${response.status}:`, await response.text());
  }
};

/**
 * Existing app versions still create raw documents directly. Fold those writes
 * into one canonical report until it is safe to reject the legacy path.
 */
export const onSpotReportCreate = onDocumentCreated(
  {document: "spots/{spotId}/reports/{reportId}", secrets: [discordWebhookUrl]},
  async (event) => {
    const source = event.data;
    if (!source) return;
    const sourceData = source.data() as UnknownRecord;
    if (recordValue(sourceData["submission"])["channel"] === "callable") return;
    const uid = stringValue(recordValue(sourceData["user"])["uid"]);
    if (!uid) return;

    const db = admin.firestore();
    const spotRef = db.doc(`spots/${event.params.spotId}`);
    let created = false;
    let canonicalRef: admin.firestore.DocumentReference | undefined;
    await db.runTransaction(async (transaction) => {
      const reports = await transaction.get(spotRef.collection("reports"));
      const canonical = reports.docs.find((report) => {
        if (report.ref.path === source.ref.path) return false;
        const data = report.data() as UnknownRecord;
        return stringValue(recordValue(data["user"])["uid"]) === uid && isActiveReport(data) &&
          data["status"] !== "superseded";
      });
      const reasons = reportReasons(sourceData);
      const now = Timestamp.now();
      if (!canonical) {
        canonicalRef = source.ref;
        created = true;
        transaction.set(source.ref, {
          reasons,
          reason: reasons[0],
          status: "open",
          updated_at: now,
          submission: {channel: "legacy_bridge", canonical: true, accepted_at: now},
        }, {merge: true});
        transaction.set(db.doc(`report_claims/${reportClaimId("spot", uid, event.params.spotId)}`), {
          kind: "spot",
          uid,
          target: event.params.spotId,
          open_report_path: source.ref.path,
          updated_at: now,
        });
        return;
      }
      canonicalRef = canonical.ref;
      const mergedReasons = [...new Set([...reportReasons(canonical.data() as UnknownRecord), ...reasons])];
      transaction.update(canonical.ref, {reasons: mergedReasons, reason: mergedReasons[0], updated_at: now});
      transaction.set(source.ref, {
        status: "superseded",
        superseded_at: now,
        superseded_into: canonical.ref.path,
        submission: {channel: "legacy_bridge", canonical: false},
      }, {merge: true});
    });

    if (!canonicalRef) return;
    const reporter = await persistAuthoritativeReporter(canonicalRef, recordValue(sourceData["user"]));
    await refreshSpotReportProjection(event.params.spotId, created);
    if (created) {
      const canonical = await canonicalRef.get();
      await sendSpotReportDiscord(event.params.spotId, canonicalRef.id, {
        ...(canonical.data() as UnknownRecord), user: reporter,
      });
    }
  },
);

export const submitSpotReport = onCall<SubmitSpotReportRequest, Promise<SubmitSpotReportResponse>>(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to report a Spot.");
    const spotId = cleanText(request.data?.spotId, "spotId", 128, true)!;
    const reasons = cleanSpotReasons(request.data?.reasons);
    const comment = cleanText(request.data?.comment, "comment", SPOT_COMMENT_MAXIMUM, reasons.includes("other")) ?? "";
    const duplicateOf = cleanDuplicateOf(request.data?.duplicateOf, reasons.includes("duplicate"));
    if (!reasons.includes("duplicate") && request.data?.duplicateOf !== undefined) {
      throw new HttpsError("invalid-argument", "duplicateOf is only allowed with the duplicate reason.");
    }

    const db = admin.firestore();
    const spotRef = db.doc(`spots/${spotId}`);
    const claimRef = db.doc(`report_claims/${reportClaimId("spot", uid, spotId)}`);
    let reportRef: admin.firestore.DocumentReference | undefined;
    let created = false;
    await db.runTransaction(async (transaction) => {
      const [spot, claim, reports] = await Promise.all([
        transaction.get(spotRef),
        transaction.get(claimRef),
        transaction.get(spotRef.collection("reports")),
      ]);
      if (!spot.exists) throw new HttpsError("not-found", "This Spot no longer exists.");
      const now = Timestamp.now();
      const existingPath = stringValue(claim.data()?.["open_report_path"]);
      const claimedReport = existingPath ? await transaction.get(db.doc(existingPath)) : undefined;
      const existing = claimedReport?.exists && isActiveReport(claimedReport.data() as UnknownRecord) ?
        claimedReport :
        reports.docs.find((report) => {
          const data = report.data() as UnknownRecord;
          return stringValue(recordValue(data["user"])["uid"]) === uid && isActiveReport(data);
        });
      if (existing) {
        reportRef = existing.ref;
        transaction.update(existing.ref, {
          reasons,
          reason: reasons[0],
          comment,
          ...(duplicateOf ? {duplicateOf} : {duplicateOf: FieldValue.delete()}),
          updated_at: now,
        });
        transaction.set(claimRef, {
          kind: "spot",
          uid,
          target: spotId,
          open_report_path: existing.ref.path,
          updated_at: now,
        }, {merge: true});
        return;
      }
      reportRef = spotRef.collection("reports").doc();
      created = true;
      const name = spotName(spot.data() as UnknownRecord, spotId);
      transaction.create(reportRef, {
        spot: {id: spotId, name},
        reasons,
        reason: reasons[0],
        comment,
        ...(duplicateOf ? {duplicateOf} : {}),
        user: {uid},
        createdAt: now,
        updated_at: now,
        status: "open",
        submission: {channel: "callable", canonical: true, accepted_at: now},
      });
      transaction.set(claimRef, {
        kind: "spot",
        uid,
        target: spotId,
        open_report_path: reportRef.path,
        updated_at: now,
      });
    });

    await persistAuthoritativeReporter(reportRef!, {uid});
    await refreshSpotReportProjection(spotId, created);
    if (created) {
      await sendSpotReportDiscord(spotId, reportRef!.id, (await reportRef!.get()).data() as UnknownRecord);
    }
    return {reportId: reportRef!.id, created};
  },
);

const findOwnSpotReport = async (uid: string, spotId: string) => {
  const reports = await admin.firestore().collection(`spots/${spotId}/reports`).get();
  return reports.docs.find((report) => {
    const data = report.data() as UnknownRecord;
    return stringValue(recordValue(data["user"])["uid"]) === uid && isActiveReport(data) && data["status"] !== "superseded";
  });
};

export const getOwnReportForTarget = onCall<OwnReportTargetRequest, Promise<GetOwnReportResponse>>(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to view your reports.");
    if (request.data?.kind !== "spot") {
      throw new HttpsError("invalid-argument", "Use the media report endpoint for media.");
    }
    const spotId = cleanText(request.data?.spotId, "spotId", 128, true)!;
    const report = await findOwnSpotReport(uid, spotId);
    return {report: report ? reportSummary(report.id, report.data() as UnknownRecord, "spot") : null};
  },
);

export const withdrawOwnSpotReport = onCall<WithdrawOwnReportRequest, Promise<{withdrawn: boolean}>>(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to withdraw a report.");
    const spotId = cleanText(request.data?.spotId, "spotId", 128, true)!;
    const reportId = cleanText(request.data?.reportId, "reportId", 128, true)!;
    const db = admin.firestore();
    const reportRef = db.doc(`spots/${spotId}/reports/${reportId}`);
    const claimRef = db.doc(`report_claims/${reportClaimId("spot", uid, spotId)}`);
    await db.runTransaction(async (transaction) => {
      const report = await transaction.get(reportRef);
      if (!report.exists || stringValue(recordValue(recordValue(report.data())["user"])["uid"]) !== uid) {
        throw new HttpsError("permission-denied", "You can only withdraw your own report.");
      }
      if (!isActiveReport(report.data() as UnknownRecord)) return;
      const now = Timestamp.now();
      transaction.update(reportRef, {status: "withdrawn", withdrawn_at: now, updated_at: now});
      transaction.set(claimRef, {open_report_path: FieldValue.delete(), updated_at: now}, {merge: true});
    });
    await refreshSpotReportProjection(spotId);
    await closeSafetyCaseForWithdrawnSource(reportRef.path);
    return {withdrawn: true};
  },
);

export const listMyReports = onCall<Record<string, never>, Promise<ListOwnReportsResponse>>(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to view your reports.");
    const db = admin.firestore();
    const [groupedReports, rootReports] = await Promise.all([
      db.collectionGroup("reports").where("user.uid", "==", uid).limit(200).get(),
      db.collection("reports").where("user.uid", "==", uid).limit(200).get(),
    ]);
    const reports = [...new Map(
      [...groupedReports.docs, ...rootReports.docs].map((report) => [report.ref.path, report]),
    ).values()];
    return {
      reports: reports
        .map((report) => {
          const data = report.data() as UnknownRecord;
          if (data["status"] === "superseded") return undefined;
          return reportSummary(report.id, data, data["kind"] === "media" ? "media" : "spot");
        })
        .filter((report): report is OwnReportSummary => Boolean(report))
        .sort((left, right) => {
          const leftTime = (left.updatedAt ?? left.createdAt) as {toMillis?: () => number} | undefined;
          const rightTime = (right.updatedAt ?? right.createdAt) as {toMillis?: () => number} | undefined;
          return (rightTime?.toMillis?.() ?? 0) - (leftTime?.toMillis?.() ?? 0);
        }),
    };
  },
);

export const resolveSpotReport = onCall<ResolveSpotReportRequest>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await _isAdminUser(uid))) throw new HttpsError("permission-denied", "Admin access required.");
  const {spotId} = _parseSpotReportPath(request.data.reportPath);
  if (request.data.status !== "resolved" && request.data.status !== "dismissed") {
    throw new HttpsError("invalid-argument", "Invalid report status.");
  }
  await admin.firestore().doc(request.data.reportPath).update({
    status: request.data.status,
    resolvedAt: FieldValue.serverTimestamp(),
    resolvedBy: {uid},
    resolutionNote: request.data.resolutionNote || FieldValue.delete(),
  });
  await refreshSpotReportProjection(spotId);
  return {ok: true};
});
