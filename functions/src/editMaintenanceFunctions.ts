import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import { buildCommunityEditFromLegacySuggestion } from "./communityEditFunctions";

const BACKFILL_MAINTENANCE_DOCUMENT =
  "maintenance/run-backfill-edit-target-metadata";

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

interface BackfillEditTargetMetadataOptions {
  dryRun: boolean;
  migrateLegacyCommunitySuggestions: boolean;
}

interface BackfillEditTargetMetadataMaintenanceDocument {
  dry_run?: unknown;
  migrate_legacy_community_suggestions?: unknown;
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
  options: BackfillEditTargetMetadataOptions,
): Promise<BackfillEditTargetMetadataResult> => {
  const {
    dryRun,
    migrateLegacyCommunitySuggestions: shouldMigrateLegacyCommunitySuggestions,
  } = options;
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
  const legacy = shouldMigrateLegacyCommunitySuggestions
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
  async (request: CallableRequest<BackfillEditTargetMetadataRequest>) => {
    await requireAdmin(request.auth?.uid);
    return backfillEditTargetMetadataImpl({
      dryRun: request.data?.dryRun !== false,
      migrateLegacyCommunitySuggestions:
        request.data?.migrateLegacyCommunitySuggestions === true,
    });
  },
);

export const backfillEditTargetMetadataOnCreate = onDocumentCreated(
  {
    document: BACKFILL_MAINTENANCE_DOCUMENT,
    timeoutSeconds: 540,
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      return null;
    }

    const request = snapshot.data() as
      | BackfillEditTargetMetadataMaintenanceDocument
      | undefined;
    if (!request) {
      return null;
    }
    const options: BackfillEditTargetMetadataOptions = {
      dryRun: request.dry_run !== false,
      migrateLegacyCommunitySuggestions:
        request.migrate_legacy_community_suggestions === true,
    };

    await snapshot.ref.set(
      {
        status: "RUNNING",
        dry_run: options.dryRun,
        migrate_legacy_community_suggestions:
          options.migrateLegacyCommunitySuggestions,
        started_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    try {
      const result = await backfillEditTargetMetadataImpl(options);
      await snapshot.ref.set(
        {
          status: "DONE",
          result: {
            scanned_edits: result.scannedEdits,
            updated_edits: result.updatedEdits,
            conflicting_edits: result.conflictingEdits,
            unsupported_edit_paths: result.unsupportedEditPaths,
            scanned_legacy_suggestions: result.scannedLegacySuggestions,
            migrated_legacy_suggestions: result.migratedLegacySuggestions,
            skipped_legacy_suggestions: result.skippedLegacySuggestions,
          },
          completed_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown maintenance error";
      await snapshot.ref.set(
        {
          status: "ERROR",
          error: message,
          completed_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      throw error;
    }

    return null;
  },
);
