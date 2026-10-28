import { createHash } from "crypto";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

const SUBMISSIONS = "spot_media_submissions";
const STATUS = "media_upload_status";
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);

function submissionKey(uid: string, id: string): string {
  return createHash("sha256").update(`${uid}:${id}`).digest("hex");
}

/** Reserve the complete submission before files can reach the scanner. */
export const beginSpotMediaSubmission = onCall(
  { region: "europe-west1", enforceAppCheck: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    const { submission_id: id, spot_id: spotId, upload_ids: uploadIds } = request.data ?? {};
    if (!validId(id) || !validId(spotId) || !Array.isArray(uploadIds) ||
        uploadIds.length < 1 || uploadIds.length > 100 ||
        !uploadIds.every(validId) || new Set(uploadIds).size !== uploadIds.length) {
      throw new HttpsError("invalid-argument", "Invalid media submission.");
    }
    const db = getFirestore();
    const key = submissionKey(uid, id);
    const ref = db.doc(`${SUBMISSIONS}/${key}`);
    await db.runTransaction(async (transaction) => {
      const [submission, spot, ...uploads] = await transaction.getAll(
        ref, db.doc(`spots/${spotId}`), ...uploadIds.map((uploadId: string) =>
          db.doc(`${STATUS}/${uploadId}`))
      );
      if (submission.exists) {
        const previous = submission.data()!;
        if (previous.spot_id !== spotId ||
            JSON.stringify(previous.upload_ids) !== JSON.stringify(uploadIds)) {
          throw new HttpsError("already-exists", "Submission already exists.");
        }
        return;
      }
      if (!spot.exists) throw new HttpsError("not-found", "Spot not found.");
      if (uploads.some((upload) => upload.exists)) {
        throw new HttpsError("already-exists", "Upload already exists.");
      }
      transaction.create(ref, {
        uid, spot_id: spotId, upload_ids: uploadIds,
        status: "pending", created_at: FieldValue.serverTimestamp(),
      });
      uploads.forEach((upload) => transaction.create(upload.ref, {
        uid, upload_id: upload.id, submission_id: key,
        target_kind: "spot", target_id: spotId, status: "received",
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      }));
    });
    return { submission_id: key };
  }
);

/** Upload transport failures have no Storage event to report their outcome. */
export const failSpotMediaSubmissionUploads = onCall(
  { region: "europe-west1", enforceAppCheck: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    const ids: unknown = request.data?.upload_ids;
    if (!Array.isArray(ids) || ids.length > 100 || !ids.every(validId)) {
      throw new HttpsError("invalid-argument", "Invalid upload IDs.");
    }
    if (!ids.length) return { ok: true };
    const db = getFirestore();
    await db.runTransaction(async (transaction) => {
      const uploads = await transaction.getAll(...ids.map((id: string) => db.doc(`${STATUS}/${id}`)));
      for (const upload of uploads) {
        const data = upload.data();
        if (data?.uid !== uid || !data?.submission_id) {
          throw new HttpsError("permission-denied", "Upload owner mismatch.");
        }
        // An ambiguous client failure must not cancel an upload already scanning.
        if (data.status === "received") transaction.update(upload.ref, {
          status: "failed", updated_at: FieldValue.serverTimestamp(),
        });
      }
    });
    return { ok: true };
  }
);

export async function finalizeSpotMediaSubmission(key: string): Promise<void> {
  const db = getFirestore();
  const ref = db.doc(`${SUBMISSIONS}/${key}`);
  await db.runTransaction(async (transaction) => {
    const submission = await transaction.get(ref);
    const data = submission.data();
    if (!data) return;
    const uploads = await transaction.getAll(...(data.upload_ids as string[]).map(
      (id) => db.doc(`${STATUS}/${id}`)
    ));
    if (data.status === "pending" && uploads.some((upload) =>
      !["published", "failed"].includes(upload.get("status")))) return;
    const publishedIds: string[] = data.published_upload_ids ?? [];
    const approved = uploads.filter((upload) => upload.get("status") === "published" &&
      !publishedIds.includes(upload.id));
    if (data.status === "completed" && !approved.length) return;
    // Only server-written scanner approvals for this owner and Spot can publish.
    const reviews = approved.length ? await transaction.getAll(...approved.map(
      (upload) => db.doc(`media_upload_reviews/${upload.id}`)
    )) : [];
    if (reviews.some((review) => review.get("status") !== "approved" ||
        review.get("uid") !== data.uid || review.get("target_kind") !== "spot" ||
        review.get("target_id") !== data.spot_id ||
        typeof review.get("approved_url") !== "string")) return;
    const user = await transaction.get(db.doc(`users/${data.uid}`));
    if (approved.length) {
      // A later manual release or delayed Storage event is a separate edit.
      // Remember included uploads so replays never produce duplicate edits.
      const suffix = data.status === "completed" ? `_${createHash("sha256")
        .update(approved.map((upload) => upload.id).join(":"))
        .digest("hex").slice(0, 16)}` : "";
      transaction.create(db.doc(`spots/${data.spot_id}/edits/media_${key}${suffix}`), {
        target_type: "spot", target_id: data.spot_id, schema_version: 1,
        type: "UPDATE", modification_type: "APPEND", approved: false, likes: 0,
        timestamp: Timestamp.now(), timestamp_raw_ms: Date.now(),
        media_submission_id: key,
        user: { uid: data.uid, ...(typeof user.get("display_name") === "string"
          ? { display_name: user.get("display_name") } : {}) },
        data: { media: reviews.map((review) => ({
          src: review.get("approved_url"),
          type: review.get("content_type")?.startsWith("video/") ? "video" : "image",
          uid: data.uid, origin: "user", isInStorage: true,
        })) },
      });
    }
    transaction.update(ref, {
      status: "completed", completed_at: FieldValue.serverTimestamp(),
      published_upload_ids: [...publishedIds, ...approved.map((upload) => upload.id)],
      published_count: publishedIds.length + approved.length,
      failed_count: uploads.length - publishedIds.length - approved.length,
    });
  });
}

export const onSpotMediaSubmissionUploadStatus = onDocumentWritten(
  { document: `${STATUS}/{uploadId}`, region: "europe-west1", retry: true },
  async (event) => {
    const key = event.data?.after.get("submission_id");
    if (typeof key === "string") await finalizeSpotMediaSubmission(key);
  }
);

/** A disconnected client cannot report files that never reached Storage. */
export const expireSpotMediaSubmissions = onSchedule(
  { schedule: "every 30 minutes", region: "europe-west1" },
  async () => {
    const db = getFirestore();
    const cutoff = Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);
    const pending = await db.collection(SUBMISSIONS).where("status", "==", "pending").get();
    for (const submission of pending.docs) {
      if (submission.get("created_at").toMillis() > cutoff.toMillis()) continue;
      await db.runTransaction(async (transaction) => {
        const uploads = await transaction.getAll(...(submission.get("upload_ids") as string[])
          .map((id) => db.doc(`${STATUS}/${id}`)));
        for (const upload of uploads) {
          if (["received", "processing"].includes(upload.get("status")) &&
              upload.get("updated_at").toMillis() <= cutoff.toMillis()) {
            transaction.update(upload.ref, {
              status: "failed", updated_at: FieldValue.serverTimestamp(),
            });
          }
        }
      });
      await finalizeSpotMediaSubmission(submission.id);
    }
  }
);
