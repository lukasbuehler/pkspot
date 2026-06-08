const assert = require("node:assert/strict");
const path = require("node:path");
const admin = require("firebase-admin");
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
  "../src/assets/swissjam/swissjam0.jpg"
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

main().catch((error) => {
  console.error("Storage image processing emulator tests failed.");
  console.error(error);
  process.exitCode = 1;
});
