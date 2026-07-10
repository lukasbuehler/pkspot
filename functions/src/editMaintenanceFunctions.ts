import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import { buildCommunityEditFromLegacySuggestion } from "./communityEditFunctions";

interface BackfillEditTargetMetadataRequest {
  dryRun?: unknown;
  migrateLegacyCommunitySuggestions?: unknown;
}

interface BackfillEditTargetMetadataResult {
  ok: true;
  dryRun: boolean;
  scannedEdits: number;
  updatedEdits: number;
  conflictingEdits: number;
  unsupportedEditPaths: number;
  scannedLegacySuggestions: number;
  migratedLegacySuggestions: number;
  skippedLegacySuggestions: number;
}

type EditTarget = {
  targetType: "spot" | "event" | "community";
  targetId: string;
};

const targetFromEditRef = (
  editRef: FirebaseFirestore.DocumentReference,
): EditTarget | null => {
  const targetRef = editRef.parent.parent;
  const targetCollection = targetRef?.parent.id;
  if (!targetRef) {
    return null;
  }
  if (targetCollection === "spots") {
    return { targetType: "spot", targetId: targetRef.id };
  }
  if (targetCollection === "events") {
    return { targetType: "event", targetId: targetRef.id };
  }
  if (targetCollection === "community_pages") {
    return { targetType: "community", targetId: targetRef.id };
  }
  return null;
};

const requireAdmin = async (uid: string | undefined): Promise<void> => {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in to run edit maintenance.");
  }
  const userSnap = await admin.firestore().doc(`users/${uid}`).get();
  if (userSnap.data()?.["is_admin"] !== true) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
};

const migrateLegacyCommunitySuggestions = async (
  dryRun: boolean,
): Promise<{
  scanned: number;
  migrated: number;
  skipped: number;
}> => {
  const db = admin.firestore();
  const snapshot = await db.collection("community_card_suggestions").get();
  let migrated = 0;
  let skipped = 0;

  for (const suggestionDoc of snapshot.docs) {
    const edit = buildCommunityEditFromLegacySuggestion(
      suggestionDoc.id,
      suggestionDoc.data(),
    );
    const communityKey = edit?.["target_id"];
    if (!edit || typeof communityKey !== "string") {
      skipped += 1;
      continue;
    }

    const pageRef = db.doc(`community_pages/${communityKey}`);
    if (!(await pageRef.get()).exists) {
      skipped += 1;
      continue;
    }
    const editRef = pageRef.collection("edits").doc(suggestionDoc.id);
    if ((await editRef.get()).exists) {
      skipped += 1;
      continue;
    }

    migrated += 1;
    if (dryRun) {
      continue;
    }
    await editRef.create(edit);
    await suggestionDoc.ref.set(
      {
        migrated_edit_path: editRef.path,
        migrated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  return { scanned: snapshot.size, migrated, skipped };
};

const backfillEditTargetMetadataImpl = async (
  request: CallableRequest<BackfillEditTargetMetadataRequest>,
): Promise<BackfillEditTargetMetadataResult> => {
  await requireAdmin(request.auth?.uid);
  const dryRun = request.data?.dryRun !== false;
  const shouldMigrateLegacy =
    request.data?.migrateLegacyCommunitySuggestions === true;
  const db = admin.firestore();
  const snapshot = await db.collectionGroup("edits").get();
  const writer = dryRun ? null : db.bulkWriter();
  let updatedEdits = 0;
  let conflictingEdits = 0;
  let unsupportedEditPaths = 0;
  let writeFailures = 0;

  writer?.onWriteError((error) => {
    if (error.failedAttempts < 3) {
      return true;
    }
    writeFailures += 1;
    return false;
  });

  for (const editDoc of snapshot.docs) {
    const target = targetFromEditRef(editDoc.ref);
    if (!target) {
      unsupportedEditPaths += 1;
      continue;
    }
    const data = editDoc.data();
    if (
      (typeof data["target_type"] === "string" &&
        data["target_type"] !== target.targetType) ||
      (typeof data["target_id"] === "string" &&
        data["target_id"] !== target.targetId)
    ) {
      conflictingEdits += 1;
      continue;
    }

    const patch: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {};
    if (data["target_type"] !== target.targetType) {
      patch["target_type"] = target.targetType;
    }
    if (data["target_id"] !== target.targetId) {
      patch["target_id"] = target.targetId;
    }
    if (typeof data["schema_version"] !== "number") {
      patch["schema_version"] = 1;
    }
    if (Object.keys(patch).length === 0) {
      continue;
    }

    updatedEdits += 1;
    writer?.update(editDoc.ref, patch);
  }

  await writer?.close();
  if (writeFailures > 0) {
    throw new HttpsError(
      "internal",
      `Failed to update ${writeFailures} edit documents.`,
    );
  }
  const legacy = shouldMigrateLegacy
    ? await migrateLegacyCommunitySuggestions(dryRun)
    : { scanned: 0, migrated: 0, skipped: 0 };

  return {
    ok: true,
    dryRun,
    scannedEdits: snapshot.size,
    updatedEdits,
    conflictingEdits,
    unsupportedEditPaths,
    scannedLegacySuggestions: legacy.scanned,
    migratedLegacySuggestions: legacy.migrated,
    skippedLegacySuggestions: legacy.skipped,
  };
};

export const backfillEditTargetMetadata = onCall(
  {
    cors: true,
    invoker: "public",
    timeoutSeconds: 540,
  },
  backfillEditTargetMetadataImpl,
);
