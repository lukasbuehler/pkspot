import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertMediaReviewAvailable } from "./mediaReviewState";

/** Separate callable so an older release backend cannot ignore a no-publish flag. */
export const markMediaUploadFalsePositive = onCall<{ review_id: string }>(
  async (request) => {
    const db = admin.firestore();
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    if ((await db.doc(`users/${uid}`).get()).data()?.["is_admin"] !== true) {
      throw new HttpsError("permission-denied", "Admin access required.");
    }
    const reviewId = request.data.review_id;
    if (typeof reviewId !== "string" || !/^[A-Za-z0-9_-]+$/.test(reviewId)) {
      throw new HttpsError("invalid-argument", "Invalid media review id.");
    }
    const ref = db.doc(`media_upload_reviews/${reviewId}`);
    const reportRef = db.doc(`reports/scanner_${reviewId}`);
    return db.runTransaction(async (transaction) => {
      const review = await transaction.get(ref);
      const report = await transaction.get(reportRef);
      if (!review.exists) throw new HttpsError("not-found", "Media review not found.");
      const data = review.data() ?? {};
      if (data["status"] === "dismissed" && data["manual_review"]?.decision === "false_positive") {
        return { ok: true, already_dismissed: true };
      }
      assertMediaReviewAvailable(data, report.data());
      const scan = data["scan_result"];
      if (scan?.decision === "reportable_match" || scan?.severity === "known_csam_match" ||
          !["needs_review", "audit_flagged"].includes(data["status"])) {
        throw new HttpsError("failed-precondition", "This media requires a different review workflow.");
      }
      const timestamp = FieldValue.serverTimestamp();
      transaction.update(ref, {
        status: "dismissed",
        manual_review: { decision: "false_positive", reviewed_by: uid, reviewed_at: timestamp },
        completed_at: timestamp,
      });
      if (report.exists) transaction.update(reportRef, {
        status: "dismissed", moderation_resolution: "false_positive",
        resolved_at: timestamp, resolved_by: uid,
      });
      transaction.create(db.collection("moderation_actions").doc(), {
        action_type: "dismiss_media_false_positive", source_type: "media_upload_review",
        source_path: ref.path, source_snapshot: data, target_type: "media",
        created_at: timestamp, created_by: { uid },
      });
      // Intentionally no Storage, profile, target, or published-status writes.
      return { ok: true };
    });
  },
);
