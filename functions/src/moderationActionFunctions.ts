import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { HttpsError, onCall } from "firebase-functions/v2/https";

type ModerationActionType =
  | "close_report"
  | "keep_warning"
  | "delete_media"
  | "delete_spot"
  | "archive_contact_message"
  | "delete_contact_message";

type SourceType = "spot_report" | "media_report" | "contact_message";
type TargetType = "spot" | "event" | "media" | "contact";

interface HandleModerationActionRequest {
  action_type: ModerationActionType;
  source_path: string;
  note?: string;
}

interface ModerationSource {
  sourceType: SourceType;
  sourcePath: string;
  sourceRef: admin.firestore.DocumentReference;
  sourceData: admin.firestore.DocumentData;
  targetType: TargetType;
  targetRef?: admin.firestore.DocumentReference;
  targetData?: admin.firestore.DocumentData;
  spotId?: string;
}

const db = admin.firestore();

const _isAdminUser = async (uid: string): Promise<boolean> => {
  const userSnap = await db.doc(`users/${uid}`).get();
  return userSnap.data()?.["is_admin"] === true;
};

const _userSnapshot = async (
  uid: string,
): Promise<{ uid: string; email?: string; display_name?: string }> => {
  const userSnap = await db.doc(`users/${uid}`).get();
  const data = userSnap.data();
  return {
    uid,
    ...(typeof data?.["email"] === "string" ? { email: data["email"] } : {}),
    ...(typeof data?.["display_name"] === "string"
      ? { display_name: data["display_name"] }
      : {}),
  };
};

const _parseSourcePath = (
  sourcePath: string,
): { sourceType: SourceType; spotId?: string } => {
  const spotReportMatch = sourcePath.match(/^spots\/([^/]+)\/reports\/[^/]+$/);
  if (spotReportMatch) {
    return { sourceType: "spot_report", spotId: spotReportMatch[1] };
  }

  if (/^media_reports\/[^/]+$/.test(sourcePath)) {
    return { sourceType: "media_report" };
  }

  if (/^contact_messages\/[^/]+$/.test(sourcePath)) {
    return { sourceType: "contact_message" };
  }

  throw new HttpsError("invalid-argument", "Unsupported moderation source path.");
};

const _targetRefForMediaReport = (
  data: admin.firestore.DocumentData,
): admin.firestore.DocumentReference | undefined => {
  if (data["context"] === "event" && typeof data["targetId"] === "string") {
    return db.doc(`events/${data["targetId"]}`);
  }

  const spotId =
    typeof data["spotId"] === "string"
      ? data["spotId"]
      : typeof data["targetId"] === "string"
        ? data["targetId"]
        : undefined;

  return spotId ? db.doc(`spots/${spotId}`) : undefined;
};

const _loadSource = async (sourcePath: string): Promise<ModerationSource> => {
  const parsed = _parseSourcePath(sourcePath);
  const sourceRef = db.doc(sourcePath);
  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists) {
    throw new HttpsError("not-found", "Moderation source no longer exists.");
  }

  const sourceData = sourceSnap.data();
  if (!sourceData) {
    throw new HttpsError("not-found", "Moderation source is empty.");
  }

  if (parsed.sourceType === "contact_message") {
    return {
      sourceType: parsed.sourceType,
      sourcePath,
      sourceRef,
      sourceData,
      targetType: "contact",
    };
  }

  const targetRef =
    parsed.sourceType === "spot_report"
      ? db.doc(`spots/${parsed.spotId}`)
      : _targetRefForMediaReport(sourceData);
  const targetSnap = targetRef ? await targetRef.get() : undefined;

  return {
    sourceType: parsed.sourceType,
    sourcePath,
    sourceRef,
    sourceData,
    targetType:
      parsed.sourceType === "media_report"
        ? sourceData["context"] === "event"
          ? "event"
          : "media"
        : "spot",
    targetRef,
    targetData: targetSnap?.data(),
    spotId: parsed.spotId,
  };
};

const _assertActionAllowed = (
  source: ModerationSource,
  actionType: ModerationActionType,
): void => {
  const allowedBySource: Record<SourceType, ModerationActionType[]> = {
    spot_report: ["close_report", "keep_warning", "delete_spot"],
    media_report: ["close_report", "keep_warning", "delete_media"],
    contact_message: ["archive_contact_message", "delete_contact_message"],
  };

  if (!allowedBySource[source.sourceType].includes(actionType)) {
    throw new HttpsError("invalid-argument", "Action does not match source type.");
  }
};

const _writeAction = async (
  source: ModerationSource,
  actionType: ModerationActionType,
  createdBy: { uid: string; email?: string; display_name?: string },
  note?: string,
): Promise<void> => {
  await db.collection("moderation_actions").add({
    action_type: actionType,
    source_type: source.sourceType,
    source_path: source.sourcePath,
    source_snapshot: source.sourceData,
    target_type: source.targetType,
    ...(source.targetRef ? { target_path: source.targetRef.path } : {}),
    ...(source.targetData ? { target_snapshot: source.targetData } : {}),
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    created_by: createdBy,
    ...(note ? { note } : {}),
  });
};

const _clearSpotWarningIfNoActiveReports = async (
  spotRef: admin.firestore.DocumentReference,
): Promise<void> => {
  const reportsSnapshot = await spotRef.collection("reports").get();
  const hasActiveReports = reportsSnapshot.docs.some((doc) => {
    const status = doc.data()["status"];
    return status !== "resolved" && status !== "dismissed";
  });

  if (hasActiveReports) {
    return;
  }

  await spotRef.update({
    is_reported: admin.firestore.FieldValue.delete(),
    report_reason: admin.firestore.FieldValue.delete(),
    isReported: admin.firestore.FieldValue.delete(),
    reportReason: admin.firestore.FieldValue.delete(),
    latest_report_at: admin.firestore.FieldValue.delete(),
  });
};

const _mediaSrc = (source: ModerationSource): string | undefined => {
  const media = source.sourceData["media"];
  return media && typeof media["src"] === "string" ? media["src"] : undefined;
};

const _hasTargetMedia = (source: ModerationSource): boolean => {
  const src = _mediaSrc(source);
  const media = source.targetData?.["media"];
  return Boolean(
    src &&
      Array.isArray(media) &&
      media.some(
        (item) => item && typeof item === "object" && item["src"] === src,
      ),
  );
};

const _assertActionPreconditions = (
  source: ModerationSource,
  actionType: ModerationActionType,
): void => {
  if (
    (actionType === "delete_spot" || actionType === "keep_warning") &&
    source.sourceType === "spot_report" &&
    !source.targetData
  ) {
    throw new HttpsError("failed-precondition", "Reported spot is missing.");
  }

  if (
    (actionType === "delete_media" || actionType === "keep_warning") &&
    source.sourceType === "media_report" &&
    !_hasTargetMedia(source)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Reported media was not found on target.",
    );
  }
};

const _updateTargetMediaFlag = async (
  source: ModerationSource,
  keepWarning: boolean,
): Promise<void> => {
  if (!source.targetRef || !source.targetData) {
    throw new HttpsError("failed-precondition", "Report target is missing.");
  }

  const src = _mediaSrc(source);
  if (!src) {
    throw new HttpsError("failed-precondition", "Media report is missing media src.");
  }

  const media = source.targetData["media"];
  if (!Array.isArray(media)) {
    throw new HttpsError("failed-precondition", "Target has no media list.");
  }

  const updatedMedia = media.map((item) => {
    if (!item || typeof item !== "object" || item["src"] !== src) {
      return item;
    }

    if (keepWarning) {
      return { ...item, isReported: true };
    }

    const updatedItem = { ...item };
    delete updatedItem["isReported"];
    return updatedItem;
  });

  await source.targetRef.update({ media: updatedMedia });
};

const _deleteTargetMedia = async (source: ModerationSource): Promise<void> => {
  if (!source.targetRef || !source.targetData) {
    throw new HttpsError("failed-precondition", "Report target is missing.");
  }

  const src = _mediaSrc(source);
  if (!src) {
    throw new HttpsError("failed-precondition", "Media report is missing media src.");
  }

  const media = source.targetData["media"];
  if (!Array.isArray(media)) {
    throw new HttpsError("failed-precondition", "Target has no media list.");
  }

  const updatedMedia = media.filter(
    (item) => !item || typeof item !== "object" || item["src"] !== src,
  );

  if (updatedMedia.length === media.length) {
    throw new HttpsError("not-found", "Reported media was not found on target.");
  }

  await source.targetRef.update({ media: updatedMedia });
};

const _deleteCollection = async (collectionPath: string): Promise<void> => {
  const snapshot = await db.collection(collectionPath).get();
  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  if (!snapshot.empty) {
    await batch.commit();
  }
};

const _deleteSpotCascade = async (spotId: string): Promise<void> => {
  await _deleteCollection(`spots/${spotId}/reviews`);
  await _deleteCollection(`spots/${spotId}/reports`);
  await _deleteCollection(`spots/${spotId}/challenges`);

  const editsSnapshot = await db.collection(`spots/${spotId}/edits`).get();
  for (const edit of editsSnapshot.docs) {
    await _deleteCollection(`spots/${spotId}/edits/${edit.id}/votes`);
    await edit.ref.delete();
  }

  const slugsSnapshot = await db
    .collection("spot_slugs")
    .where("spot_id", "==", spotId)
    .get();
  const slugsBatch = db.batch();
  slugsSnapshot.docs.forEach((doc) => slugsBatch.delete(doc.ref));
  if (!slugsSnapshot.empty) {
    await slugsBatch.commit();
  }

  await db.doc(`spots/${spotId}`).delete();
};

export const handleModerationAction = onCall<HandleModerationActionRequest>(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid || !(await _isAdminUser(uid))) {
      throw new HttpsError("permission-denied", "Admin access required.");
    }

    const { action_type: actionType, source_path: sourcePath, note } = request.data;
    if (!actionType || !sourcePath) {
      throw new HttpsError("invalid-argument", "Missing moderation action data.");
    }

    const source = await _loadSource(sourcePath);
    _assertActionAllowed(source, actionType);
    _assertActionPreconditions(source, actionType);
    const createdBy = await _userSnapshot(uid);

    await _writeAction(source, actionType, createdBy, note);

    if (actionType === "delete_spot") {
      if (!source.spotId) {
        throw new HttpsError("invalid-argument", "Spot report path is required.");
      }
      await _deleteSpotCascade(source.spotId);
      logger.info("Deleted spot from moderation action", {
        spotId: source.spotId,
        sourcePath,
      });
      return { ok: true };
    }

    if (actionType === "delete_media") {
      await _deleteTargetMedia(source);
      await source.sourceRef.delete();
      return { ok: true };
    }

    if (actionType === "keep_warning") {
      if (source.sourceType === "spot_report" && source.targetRef) {
        await source.targetRef.update({
          is_reported: true,
          report_reason: source.sourceData["reason"] || "other",
          latest_report_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else if (source.sourceType === "media_report") {
        await _updateTargetMediaFlag(source, true);
      }
      await source.sourceRef.delete();
      return { ok: true };
    }

    if (actionType === "close_report") {
      if (source.sourceType === "spot_report" && source.targetRef) {
        await source.sourceRef.delete();
        await _clearSpotWarningIfNoActiveReports(source.targetRef);
      } else if (source.sourceType === "media_report") {
        if (source.targetData && _hasTargetMedia(source)) {
          await _updateTargetMediaFlag(source, false);
        }
        await source.sourceRef.delete();
      } else {
        await source.sourceRef.delete();
      }
      return { ok: true };
    }

    if (
      actionType === "archive_contact_message" ||
      actionType === "delete_contact_message"
    ) {
      await source.sourceRef.delete();
      return { ok: true };
    }

    throw new HttpsError("invalid-argument", "Unsupported moderation action.");
  },
);
