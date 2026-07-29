const assert = require("node:assert/strict");
const path = require("node:path");
const admin = require("firebase-admin");
const { deleteApp, initializeApp } = require("firebase/app");
const {
  connectAuthEmulator,
  getAuth,
  signInWithCustomToken,
} = require("firebase/auth");
const {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} = require("firebase/functions");
const sharp = require("../functions/node_modules/sharp");

if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  throw new Error(
    "Refusing to run image processing tests without FIREBASE_STORAGE_EMULATOR_HOST."
  );
}

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    "Refusing to run image processing tests without FIRESTORE_EMULATOR_HOST."
  );
}

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-pkspot";

const PROJECT_ID = process.env.GCLOUD_PROJECT;
const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;
const ORIGINAL_IMAGE = path.resolve(
  __dirname,
  "../src/assets/events/swissjam/swissjam0.jpg"
);
const SIZES = [200, 400, 800];
const ARCHIVE_PREFIX = "resized_originals";
const PROFILE_CACHE_CONTROL = "public, max-age=31536000";

admin.initializeApp({
  projectId: PROJECT_ID,
  storageBucket: STORAGE_BUCKET,
});

const bucket = admin.storage().bucket();
const db = admin.firestore();
let clientApp;

async function createAdminCallables(uid) {
  await admin.auth().createUser({ uid });
  await db.doc(`users/${uid}`).set({ is_admin: true });
  clientApp = initializeApp(
    {
      apiKey: "demo-api-key",
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      projectId: PROJECT_ID,
      storageBucket: STORAGE_BUCKET,
    },
    `media-moderation-admin-${Date.now()}`
  );
  const auth = getAuth(clientApp);
  const [authHost, authPort] = process.env.FIREBASE_AUTH_EMULATOR_HOST.split(":");
  connectAuthEmulator(auth, `http://${authHost}:${authPort}`, {
    disableWarnings: true,
  });
  await signInWithCustomToken(auth, await admin.auth().createCustomToken(uid));

  const functions = getFunctions(clientApp, "europe-west1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  return {
    markSafe: httpsCallable(functions, "markMediaUploadSafe"),
    getPreview: httpsCallable(functions, "getModerationMediaPreview"),
    updateIncident: httpsCallable(functions, "updateSafetyIncident"),
  };
}

async function assertCallableRejected(operation, expectedCode) {
  try {
    await operation();
  } catch (error) {
    assert.equal(error.code, expectedCode);
    return;
  }
  assert.fail(`Callable should have failed with ${expectedCode}`);
}

async function waitForFile(filePath, timeoutMs = 60_000) {
  const startedAt = Date.now();
  const file = bucket.file(filePath);

  while (Date.now() - startedAt < timeoutMs) {
    const [exists] = await file.exists();
    if (exists) return file;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${filePath}`);
}

async function waitForDeletedDoc(docRef, timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await docRef.get();
    if (!snapshot.exists) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${docRef.path} to be deleted`);
}

function getDerivativePath(originalPath, size) {
  return originalPath.includes(".")
    ? originalPath.replace(/(\.[^.]+)$/, `_${size}x${size}$1`)
    : `${originalPath}_${size}x${size}`;
}

async function assertOriginalArchived(
  originalPath,
  expectedMetadata,
  expectedCacheControl
) {
  const archivedFile = await waitForFile(`${ARCHIVE_PREFIX}/${originalPath}`);
  const [archivedMetadata] = await archivedFile.getMetadata();

  assert.equal(archivedMetadata.contentType, "image/jpeg");
  assert.equal(
    archivedMetadata.metadata.firebaseStorageDownloadTokens,
    expectedMetadata.firebaseStorageDownloadTokens
  );
  assert.equal(archivedMetadata.metadata.uid, expectedMetadata.uid);
  if (expectedCacheControl) {
    assert.equal(archivedMetadata.cacheControl, expectedCacheControl);
  }

  const [originalStillExists] = await bucket.file(originalPath).exists();
  assert.equal(originalStillExists, false);
}

async function assertFileMissing(filePath) {
  const [exists] = await bucket.file(filePath).exists();
  assert.equal(exists, false, `${filePath} should not exist`);
}

async function waitForReviewStatus(reviewId, status, timeoutMs = 60_000) {
  const startedAt = Date.now();
  const reviewRef = db.collection("media_upload_reviews").doc(reviewId);

  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await reviewRef.get();
    if (snapshot.exists && snapshot.data().status === status) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for media_upload_reviews/${reviewId}=${status}`);
}

async function waitForIncident(reviewPath, timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await db
      .collection("safety_incidents")
      .where("review_path", "==", reviewPath)
      .get();
    if (!snapshot.empty) {
      return snapshot.docs[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for csam incident for ${reviewPath}`);
}

async function waitForMediaReport(reviewPath, timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await db
      .collection("reports")
      .where("review_path", "==", reviewPath)
      .get();
    if (!snapshot.empty) {
      return snapshot.docs[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for media report for ${reviewPath}`);
}

async function waitForAuditedReview(storagePath, timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await db
      .collection("media_upload_reviews")
      .where("audited_path", "==", storagePath)
      .get();
    if (!snapshot.empty) {
      return snapshot.docs[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for audited review for ${storagePath}`);
}

async function assertDerivative(
  originalPath,
  size,
  expectedMetadata,
  originalMinDimension
) {
  const derivativePath = getDerivativePath(originalPath, size);
  const file = await waitForFile(derivativePath);
  const [bytes] = await file.download();
  const [metadata] = await file.getMetadata();
  const imageMetadata = await sharp(bytes).metadata();

  assert.equal(metadata.contentType, "image/jpeg");
  assert.equal(
    metadata.metadata.firebaseStorageDownloadTokens,
    expectedMetadata.firebaseStorageDownloadTokens
  );
  assert.equal(metadata.metadata.uid, expectedMetadata.uid);
  assert.equal(
    Math.min(imageMetadata.width, imageMetadata.height),
    Math.min(size, originalMinDimension)
  );

  return derivativePath;
}

async function assertDerivativesForOriginal(originalPath, customMetadata) {
  const originalMinDimension = await getOriginalMinDimension();
  const derivativePaths = [];

  for (const size of SIZES) {
    derivativePaths.push(
      await assertDerivative(
        originalPath,
        size,
        customMetadata,
        originalMinDimension
      )
    );
  }

  return derivativePaths;
}

async function getOriginalMinDimension() {
  const originalMetadata = await sharp(ORIGINAL_IMAGE).metadata();
  return Math.min(originalMetadata.width, originalMetadata.height);
}

async function main() {
  const suffix = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  const uid = "image-processing-uploader";
  const customMetadata = {
    uid,
    firebaseStorageDownloadTokens: `test-token-${suffix}`,
  };
  const originalPath = `spot_pictures/${suffix}.jpg`;

  console.log("Checking spot image upload derivatives and archiving...");
  await bucket.upload(ORIGINAL_IMAGE, {
    destination: originalPath,
    resumable: false,
    metadata: {
      contentType: "image/jpeg",
      metadata: customMetadata,
    },
  });

  const derivativePaths = await assertDerivativesForOriginal(
    originalPath,
    customMetadata
  );
  await assertOriginalArchived(originalPath, customMetadata);

  console.log("Checking moderated intake approval promotes image before resizing...");
  const moderatedUploadId = `moderated-${suffix}`;
  const moderatedIntakePath = `media_intake/${uid}/${moderatedUploadId}/${moderatedUploadId}.jpg`;
  const moderatedApprovedPath = `spot_pictures/${moderatedUploadId}.jpg`;
  await bucket.upload(ORIGINAL_IMAGE, {
    destination: moderatedIntakePath,
    resumable: false,
    metadata: {
      contentType: "image/jpeg",
      metadata: {
        uid,
        upload_id: moderatedUploadId,
        destination_folder: "spot_pictures",
        destination_filename: moderatedUploadId,
        target_kind: "post",
      },
    },
  });
  const moderatedReview = await waitForReviewStatus(moderatedUploadId, "approved");
  assert.equal(moderatedReview.data().approved_path, moderatedApprovedPath);
  assert.equal(moderatedReview.data().scan_result.reason, undefined);
  await assertFileMissing(moderatedIntakePath);
  await assertDerivativesForOriginal(moderatedApprovedPath, {
    uid,
    upload_id: moderatedUploadId,
    moderated: "true",
  });
  await assertOriginalArchived(moderatedApprovedPath, {
    uid,
    upload_id: moderatedUploadId,
    moderated: "true",
  });

  console.log("Checking organization logo approval and derivatives...");
  const organizationUploadId = `organization-${suffix}`;
  const organizationId = `organization-${suffix}`;
  const organizationIntakePath =
    `media_intake/${uid}/${organizationUploadId}/${organizationUploadId}.jpg`;
  const organizationApprovedPath =
    `organization_media/${organizationId}.jpg`;
  await bucket.upload(ORIGINAL_IMAGE, {
    destination: organizationIntakePath,
    resumable: false,
    metadata: {
      contentType: "image/jpeg",
      metadata: {
        uid,
        upload_id: organizationUploadId,
        destination_folder: "organization_media",
        destination_filename: organizationId,
        target_kind: "organization",
        target_id: organizationId,
      },
    },
  });
  const organizationReview = await waitForReviewStatus(
    organizationUploadId,
    "approved"
  );
  assert.equal(
    organizationReview.data().approved_path,
    organizationApprovedPath
  );
  assert.equal(organizationReview.data().target_kind, "organization");
  assert.equal(organizationReview.data().target_id, organizationId);
  await assertFileMissing(organizationIntakePath);
  await assertDerivativesForOriginal(organizationApprovedPath, {
    uid,
    upload_id: organizationUploadId,
    moderated: "true",
  });
  await assertOriginalArchived(organizationApprovedPath, {
    uid,
    upload_id: organizationUploadId,
    moderated: "true",
  });

  console.log("Checking audit records approved legacy media for the stream...");
  const mediaAuditDoc = db
    .collection("maintenance")
    .doc("run-audit-media-moderation");
  await mediaAuditDoc.set({
    requestedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await waitForDeletedDoc(mediaAuditDoc);
  const auditedReview = await waitForAuditedReview(
    `${ARCHIVE_PREFIX}/${moderatedApprovedPath}`
  );
  assert.equal(auditedReview.data().status, "approved");
  assert.equal(auditedReview.data().scan_result.decision, "allow");
  assert.equal(auditedReview.data().scan_result.reason, undefined);
  assert.equal(
    auditedReview.data().approved_path,
    `${ARCHIVE_PREFIX}/${moderatedApprovedPath}`
  );

  console.log("Checking reportable safety matches stay quarantined and create incidents...");
  const blockedUploadId = `blocked-${suffix}`;
  const blockedIntakePath = `media_intake/${uid}/${blockedUploadId}/${blockedUploadId}.jpg`;
  const blockedApprovedPath = `spot_pictures/${blockedUploadId}.jpg`;
  await bucket.upload(ORIGINAL_IMAGE, {
    destination: blockedIntakePath,
    resumable: false,
    metadata: {
      contentType: "image/jpeg",
      metadata: {
        uid,
        upload_id: blockedUploadId,
        destination_folder: "spot_pictures",
        destination_filename: blockedUploadId,
        target_kind: "post",
        emulator_safety_result: "reportable_match",
      },
    },
  });
  const blockedReview = await waitForReviewStatus(blockedUploadId, "blocked");
  assert.equal(blockedReview.data().scan_result.decision, "reportable_match");
  const blockedReviewPath = `media_upload_reviews/${blockedUploadId}`;
  const blockedIncident = await waitForIncident(blockedReviewPath);
  const blockedReport = await waitForMediaReport(blockedReviewPath);
  assert.equal(blockedReport.data().source, "scanner");
  assert.equal(blockedReport.data().reason, "known_csam_match");
  assert.equal(blockedReport.data().media.storage_path, blockedIntakePath);
  await waitForFile(blockedIntakePath);
  await assertFileMissing(blockedApprovedPath);

  console.log("Checking administrator review releases ordinary Vision flags only...");
  const callables = await createAdminCallables("media-moderation-admin");
  await assertCallableRejected(
    () => callables.getPreview({ review_id: blockedUploadId }),
    "functions/failed-precondition"
  );
  await assertCallableRejected(
    () => callables.markSafe({ review_id: blockedUploadId }),
    "functions/failed-precondition"
  );
  await assertCallableRejected(
    () =>
      callables.updateIncident({
        incident_id: blockedIncident.id,
        status: "closed",
        classification: "csea",
        uk_link: "yes",
        retention_state: "reporting_hold",
        reporting_route: "nca_csea_irp",
        reporting_status: "preparing",
        runbook: {
          evidence_preserved: true,
          access_restricted: true,
          context_collected: false,
          uk_link_assessed: true,
          reporting_route_assessed: true,
          external_action_recorded: false,
        },
      }),
    "functions/failed-precondition"
  );
  const incidentUpdate = await callables.updateIncident({
    incident_id: blockedIncident.id,
    status: "reported",
    classification: "csea",
    uk_link: "yes",
    retention_state: "reporting_hold",
    reporting_route: "nca_csea_irp",
    reporting_status: "submitted",
    runbook: {
      evidence_preserved: true,
      access_restricted: true,
      context_collected: true,
      uk_link_assessed: true,
      reporting_route_assessed: true,
      external_action_recorded: true,
    },
    containment_summary: "Upload remained quarantined.",
    reporting_decision_summary:
      "Detected and unreported CSEA with a UK link.",
    external_report_reference: "NCA-TEST-REFERENCE",
  });
  assert.equal(incidentUpdate.data.ok, true);
  const updatedIncident = await db
    .collection("safety_incidents")
    .doc(blockedIncident.id)
    .get();
  assert.equal(updatedIncident.data().reporting_status, "submitted");
  assert.equal(
    updatedIncident.data().external_report_reference,
    "NCA-TEST-REFERENCE"
  );
  assert.ok(updatedIncident.data().external_reported_at);

  const reviewUploadId = `manual-review-${suffix}`;
  const reviewIntakePath =
    `media_intake/${uid}/${reviewUploadId}/${reviewUploadId}.jpg`;
  const reviewApprovedPath = `spot_pictures/${reviewUploadId}.jpg`;
  await bucket.upload(ORIGINAL_IMAGE, {
    destination: reviewIntakePath,
    resumable: false,
    metadata: {
      contentType: "image/jpeg",
      metadata: {
        uid,
        upload_id: reviewUploadId,
        destination_folder: "spot_pictures",
        destination_filename: reviewUploadId,
        target_kind: "post",
        emulator_safety_result: "block",
      },
    },
  });
  await waitForReviewStatus(reviewUploadId, "needs_review");
  await waitForMediaReport(`media_upload_reviews/${reviewUploadId}`);
  const releaseResult = await callables.markSafe({ review_id: reviewUploadId });
  assert.equal(releaseResult.data.ok, true);
  const releasedReview = await waitForReviewStatus(reviewUploadId, "approved");
  assert.equal(releasedReview.data().manual_review.decision, "safe");
  assert.equal(
    releasedReview.data().manual_review.reviewed_by,
    "media-moderation-admin"
  );
  assert.equal(releasedReview.data().approved_path, reviewApprovedPath);
  await assertFileMissing(reviewIntakePath);
  await waitForFile(`${ARCHIVE_PREFIX}/${reviewApprovedPath}`);
  const resolvedReport = await db
    .collection("reports")
    .doc(`scanner_${reviewUploadId}`)
    .get();
  assert.equal(resolvedReport.data().status, "resolved");
  assert.equal(resolvedReport.data().moderation_resolution, "manual_safe");

  console.log("Checking reconciliation of legacy false scan failures...");
  const staleUploadId = `stale-approved-${suffix}`;
  const staleDestinationFilename = `released-${suffix}`;
  const staleIntakePath =
    `media_intake/${uid}/${staleUploadId}/${staleUploadId}.jpg`;
  const staleApprovedPath =
    `spot_pictures/${staleDestinationFilename}.jpg`;
  const staleArchivedPath =
    `${ARCHIVE_PREFIX}/${staleApprovedPath}`;
  await bucket.upload(ORIGINAL_IMAGE, {
    destination: staleApprovedPath,
    resumable: false,
    metadata: {
      contentType: "image/jpeg",
      metadata: {
        uid,
        upload_id: staleUploadId,
        moderated: "true",
      },
    },
  });
  await waitForFile(staleArchivedPath);
  const staleDisplayPath =
    `spot_pictures/${staleDestinationFilename}_800x800.jpg`;
  await waitForFile(staleDisplayPath);
  await db.collection("media_upload_reviews").doc(staleUploadId).set({
    status: "scan_failed",
    source: "upload",
    uid,
    target_kind: "spot",
    target_id: "test-spot",
    intake_path: staleIntakePath,
    content_type: "image/jpeg",
    destination_folder: "spot_pictures",
    destination_filename: staleDestinationFilename,
    failure_reason:
      'Cannot use "undefined" as a Firestore value (found in field "scan_result.reason").',
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    completed_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  const unresolvedUploadId = `unresolved-${suffix}`;
  await db.collection("media_upload_reviews").doc(unresolvedUploadId).set({
    status: "scan_failed",
    source: "upload",
    uid,
    intake_path:
      `media_intake/${uid}/${unresolvedUploadId}/${unresolvedUploadId}.jpg`,
    content_type: "image/jpeg",
    destination_folder: "spot_pictures",
    destination_filename: unresolvedUploadId,
    failure_reason:
      'Cannot use "undefined" as a Firestore value (found in field "scan_result.reason").',
  });
  await assertCallableRejected(
    () => callables.getPreview({ review_id: unresolvedUploadId }),
    "functions/not-found"
  );

  const reconciliationDoc = db
    .collection("maintenance")
    .doc("run-reconcile-published-media-reviews");
  await reconciliationDoc.set({
    requestedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await waitForDeletedDoc(reconciliationDoc);
  const reconciledReview = await waitForReviewStatus(staleUploadId, "approved");
  assert.equal(reconciledReview.data().approved_path, staleDisplayPath);
  assert.equal(reconciledReview.data().scan_result.decision, "allow");
  assert.equal(reconciledReview.data().failure_reason, undefined);
  assert.equal(
    reconciledReview.data().reconciliation_reason,
    "legacy_undefined_scan_reason_after_publish"
  );
  const unresolvedReview = await waitForReviewStatus(
    unresolvedUploadId,
    "scan_failed"
  );
  assert.equal(unresolvedReview.exists, true);
  const reconciliationSummary = await db
    .collection("maintenance")
    .doc("last-published-media-review-reconciliation")
    .get();
  assert.equal(reconciliationSummary.data().recovered, 1);
  assert.ok(reconciliationSummary.data().unresolved >= 1);

  console.log("Checking media intake backfill maintenance trigger...");
  const intakeBackfillDoc = db
    .collection("maintenance")
    .doc("run-process-media-intake-backfill");
  await intakeBackfillDoc.set({
    requestedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await waitForDeletedDoc(intakeBackfillDoc);
  const intakeBackfillSummary = await db
    .collection("maintenance")
    .doc("last-media-intake-backfill")
    .get();
  assert.equal(intakeBackfillSummary.exists, true);
  assert.equal(intakeBackfillSummary.data().scan_failed, 0);

  console.log("Checking extensionless profile picture derivatives and archiving...");
  const profilePath = `profile_pictures/${uid}`;
  await bucket.upload(ORIGINAL_IMAGE, {
    destination: profilePath,
    resumable: false,
    metadata: {
      contentType: "image/jpeg",
      cacheControl: PROFILE_CACHE_CONTROL,
      metadata: customMetadata,
    },
  });
  const profileDerivativePaths = await assertDerivativesForOriginal(
    profilePath,
    customMetadata
  );
  await assertOriginalArchived(
    profilePath,
    customMetadata,
    PROFILE_CACHE_CONTROL
  );

  console.log("Checking maintenance backfill creates missing derivatives for spot and profile images...");
  const missingDerivative = derivativePaths[1];
  const missingProfileDerivative = profileDerivativePaths[1];
  await bucket.file(missingDerivative).delete();
  await bucket.file(missingProfileDerivative).delete();

  const backfillDoc = db
    .collection("maintenance")
    .doc("run-backfill-storage-image-sizes");
  await backfillDoc.set({ requestedAt: admin.firestore.FieldValue.serverTimestamp() });

  await waitForDeletedDoc(backfillDoc);
  await assertDerivative(
    originalPath,
    400,
    customMetadata,
    await getOriginalMinDimension()
  );
  await assertDerivative(
    profilePath,
    400,
    customMetadata,
    await getOriginalMinDimension()
  );

  const summary = await db
    .collection("maintenance")
    .doc("last-storage-image-size-backfill")
    .get();
  assert.equal(summary.exists, true);
  assert.equal(summary.data().failed, 0);
  assert.ok(summary.data().created >= 2);

  console.log("Checking optional 1600px backfill for spot and profile images...");
  const optionalDerivative = getDerivativePath(originalPath, 1600);
  const optionalProfileDerivative = getDerivativePath(profilePath, 1600);
  await assertFileMissing(optionalDerivative);
  await assertFileMissing(optionalProfileDerivative);

  await backfillDoc.set({
    include1600: true,
    requestedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await waitForDeletedDoc(backfillDoc);
  await assertDerivative(
    originalPath,
    1600,
    customMetadata,
    await getOriginalMinDimension()
  );
  await assertDerivative(
    profilePath,
    1600,
    customMetadata,
    await getOriginalMinDimension()
  );

  console.log("Storage image processing emulator tests passed.");
}

main()
  .catch((error) => {
    console.error("Storage image processing emulator tests failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (clientApp) {
      await deleteApp(clientApp).catch(() => undefined);
    }
    await admin.app().delete().catch(() => undefined);
  });
