import {createHash} from "node:crypto";
import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {publicSpotWarningForReasons} from "./spotPublicWarning";

export type UnknownRecord = Record<string, unknown>;

export const recordValue = (value: unknown): UnknownRecord =>
  value && typeof value === "object" && !Array.isArray(value) ?
    value as UnknownRecord :
    {};

export const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export const reportReasons = (data: UnknownRecord): string[] => {
  const selected = Array.isArray(data["reasons"]) ?
    data["reasons"].filter((reason): reason is string =>
      typeof reason === "string" && reason.trim().length > 0,
    ) :
    [];
  const legacyReason = stringValue(data["reason"]);
  return [...new Set(selected.length > 0 ? selected : legacyReason ? [legacyReason] : ["other"])];
};

export const isActiveReport = (data: UnknownRecord): boolean => {
  const status = data["status"];
  return status === undefined || status === "open";
};

export const reportClaimId = (kind: "spot" | "media", uid: string, target: string): string =>
  createHash("sha256")
    .update(`report-claim-v1:${kind}:${uid}:${target}`)
    .digest("hex");

export const reportTargetKeyForMedia = (media: {
  type: string;
  src: string;
}, context?: string, targetId?: string): string =>
  createHash("sha256")
    .update(`report-media-target-v1:${media.type}:${media.src}:${context ?? "media"}:${targetId ?? ""}`)
    .digest("hex");

export const clearSpotReportProjection = () => ({
  is_reported: FieldValue.delete(),
  report_reason: FieldValue.delete(),
  isReported: FieldValue.delete(),
  reportReason: FieldValue.delete(),
  latest_report_at: FieldValue.delete(),
  public_notice: FieldValue.delete(),
});

/** Rebuild the public projection from all active canonical/legacy reports. */
export const refreshSpotReportProjection = async (
  spotId: string,
  incrementCount = false,
): Promise<void> => {
  const db = admin.firestore();
  const spotRef = db.collection("spots").doc(spotId);
  const reports = await spotRef.collection("reports").get();
  const active = reports.docs
    .map((report) => report.data() as UnknownRecord)
    .filter(isActiveReport)
    .filter((report) => report["status"] !== "superseded");

  if (active.length === 0) {
    const spot = await spotRef.get();
    const notice = recordValue(spot.data()?.["public_notice"]);
    if (notice["source"] === "moderator") {
      await spotRef.update({
        is_reported: true,
        report_reason: stringValue(notice["message"]) ?? "Community warning",
      });
      return;
    }
    await spotRef.update(clearSpotReportProjection());
    return;
  }

  const warning = publicSpotWarningForReasons(active.flatMap(reportReasons));
  await spotRef.update({
    is_reported: true,
    report_reason: warning.message,
    ...(incrementCount ? {report_count: FieldValue.increment(1)} : {}),
    latest_report_at: FieldValue.serverTimestamp(),
    public_notice: {
      ...warning,
      published_at: FieldValue.serverTimestamp(),
      source: "community_report",
    },
  });
};

export const asTimestamp = (value: unknown): Timestamp | undefined =>
  value instanceof Timestamp ? value : undefined;
