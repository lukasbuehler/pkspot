import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

/** Manual decisions and incident escalation must not race a public release. */
export function assertMediaReviewAvailable(
  review: admin.firestore.DocumentData,
  report: admin.firestore.DocumentData = {},
): void {
  if (review["release_in_progress"]) {
    throw new HttpsError("failed-precondition", "A media release is in progress.");
  }
  if (review["status"] === "dismissed") {
    throw new HttpsError("failed-precondition", "This review was closed without publication.");
  }
  if (review["incident_path"] || report["incident_path"]) {
    throw new HttpsError("failed-precondition", "Continue this review in its safety incident.");
  }
}

export async function withMediaReleaseLock<T>(
  reviewId: string,
  release: (review: admin.firestore.DocumentSnapshot) => Promise<T>,
): Promise<T> {
  const db = admin.firestore();
  const ref = db.doc(`media_upload_reviews/${reviewId}`);
  const review = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const report = await transaction.get(db.doc(`reports/scanner_${reviewId}`));
    if (!snapshot.exists) throw new HttpsError("not-found", "Media review not found.");
    assertMediaReviewAvailable(snapshot.data() ?? {}, report.data());
    transaction.update(ref, { release_in_progress: true });
    return snapshot;
  });
  try {
    return await release(review);
  } finally {
    await ref.update({ release_in_progress: FieldValue.delete() });
  }
}
