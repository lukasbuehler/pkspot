import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

/**
 * Uploaders who think a held photo failed tend to upload it again. Exact
 * re-uploads (same bytes, uploader, and target) are folded into one review so
 * moderators decide once and a release never publishes the photo twice.
 */

const REVIEWS = "media_upload_reviews";
const STATUSES = "media_upload_status";
const REPORTS = "reports";
const PENDING = new Set(["needs_review", "audit_flagged"]);

type ReviewData = admin.firestore.DocumentData;

export interface DuplicateIdentity {
  sha256: string;
  uid: string;
  targetId?: string;
}

export const duplicateIdentity = (
  data: ReviewData | undefined,
): DuplicateIdentity | undefined => {
  const sha256 = data?.["sha256"];
  const uid = data?.["uid"];
  if (typeof sha256 !== "string" || !sha256 || typeof uid !== "string" || !uid) {
    return undefined;
  }
  const targetId = typeof data?.["target_id"] === "string" ?
    data["target_id"] as string :
    undefined;
  return {sha256, uid, ...(targetId ? {targetId} : {})};
};

/** Restricted matches always follow the incident workflow, never dedupe. */
const isRestricted = (data: ReviewData): boolean =>
  data["status"] === "blocked" ||
  Boolean(data["incident_path"]) ||
  data["scan_result"]?.["decision"] === "reportable_match" ||
  data["scan_result"]?.["severity"] === "known_csam_match";

const siblings = async (
  identity: DuplicateIdentity,
  excludeId: string,
): Promise<admin.firestore.QueryDocumentSnapshot[]> => {
  const matches = await admin.firestore()
    .collection(REVIEWS)
    .where("sha256", "==", identity.sha256)
    .limit(50)
    .get();
  return matches.docs.filter((doc) => {
    const data = doc.data();
    return doc.id !== excludeId &&
      data["uid"] === identity.uid &&
      (data["target_id"] ?? undefined) === identity.targetId &&
      !isRestricted(data);
  });
};

/**
 * Finds the earliest pending review of the exact same upload. Re-uploads of an
 * already released photo go through normal review, because the original may
 * have been removed from its target since.
 */
export const findPendingOriginal = async (
  identity: DuplicateIdentity,
  reviewId: string,
): Promise<admin.firestore.QueryDocumentSnapshot | undefined> =>
  (await siblings(identity, reviewId))
    .filter((doc) => PENDING.has(doc.data()["status"]) && !doc.data()["duplicate_of"])
    .sort((left, right) =>
      (left.createTime?.toMillis() ?? 0) - (right.createTime?.toMillis() ?? 0),
    )[0];

/**
 * Closes pending exact duplicates after a moderator decided the original.
 * Their upload status stays "failed" (never "published"): a Spot media
 * submission only publishes approved reviews, and the original already carries
 * the photo. Clearing the hold flag removes the "waiting for review" tile.
 * @return {Promise<number>} Number of duplicate reviews closed.
 */
const closeDuplicateReviewsUnsafe = async (params: {
  original: admin.firestore.DocumentReference;
  originalData: ReviewData;
  decision: "approved" | "false_positive";
  moderatorUid: string;
}): Promise<number> => {
  const identity = duplicateIdentity(params.originalData);
  if (!identity) return 0;
  const pending = (await siblings(identity, params.original.id))
    .filter((doc) => PENDING.has(doc.data()["status"]));
  if (pending.length === 0) return 0;

  const db = admin.firestore();
  const batch = db.batch();
  const timestamp = FieldValue.serverTimestamp();
  for (const duplicate of pending) {
    batch.update(duplicate.ref, {
      status: "dismissed",
      duplicate_of: params.original.path,
      manual_review: {
        decision: "duplicate",
        reviewed_by: params.moderatorUid,
        reviewed_at: timestamp,
      },
      completed_at: timestamp,
    });
    const report = await db.doc(`${REPORTS}/scanner_${duplicate.id}`).get();
    if (report.exists && report.data()?.["status"] === "open") {
      batch.update(report.ref, {
        status: params.decision === "approved" ? "resolved" : "dismissed",
        moderation_resolution: "duplicate",
        duplicate_of: `${REPORTS}/scanner_${params.original.id}`,
        resolved_at: timestamp,
        resolved_by: params.moderatorUid,
      });
    }
    if (duplicate.data()["source"] !== "audit") {
      batch.set(db.doc(`${STATUSES}/${duplicate.id}`), {
        held_for_review: false,
        updated_at: timestamp,
      }, {merge: true});
    }
  }
  await batch.commit();
  logger.info("Closed duplicate media reviews", {
    original: params.original.path,
    decision: params.decision,
    count: pending.length,
  });
  return pending.length;
};

/**
 * Runs after the moderator's decision has already been committed, so a
 * cleanup failure is logged rather than reported as a failed decision.
 * @return {Promise<number>} Number of duplicate reviews closed.
 */
export const closeDuplicateReviews = async (
  params: Parameters<typeof closeDuplicateReviewsUnsafe>[0],
): Promise<number> => {
  try {
    return await closeDuplicateReviewsUnsafe(params);
  } catch (error) {
    logger.error("Failed to close duplicate media reviews", {
      original: params.original.path,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
};
