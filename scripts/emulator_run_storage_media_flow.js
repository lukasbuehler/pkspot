const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { initializeApp, deleteApp } = require("firebase/app");
const {
  connectAuthEmulator,
  getAuth,
  signInWithCustomToken,
} = require("firebase/auth");
const {
  connectFirestoreEmulator,
  getFirestore,
} = require("firebase/firestore");
const {
  connectStorageEmulator,
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} = require("firebase/storage");

if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  throw new Error(
    "Refusing to run storage media tests without FIREBASE_STORAGE_EMULATOR_HOST."
  );
}

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    "Refusing to run storage media tests without FIRESTORE_EMULATOR_HOST."
  );
}

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-pkspot";

admin.initializeApp({
  projectId: process.env.GCLOUD_PROJECT,
});

const adminAuth = admin.auth();
const adminDb = admin.firestore();

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const STORAGE_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
const [authHost, authPortValue] = AUTH_HOST.split(":");
const [firestoreHost, firestorePortValue] = FIRESTORE_HOST.split(":");
const [storageHost, storagePortValue] = STORAGE_HOST.split(":");
const authPort = Number(authPortValue);
const firestorePort = Number(firestorePortValue);
const storagePort = Number(storagePortValue);
const PROJECT_ID = process.env.GCLOUD_PROJECT;
const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;
const apps = [];

const USERS = {
  uploader: "media-flow-uploader",
  other: "media-flow-other",
  admin: "media-flow-admin",
  restricted: "media-flow-restricted",
};

async function resetEmulators() {
  const collections = await adminDb.listCollections();
  await Promise.all(
    collections.map((collectionRef) => adminDb.recursiveDelete(collectionRef))
  );

  let pageToken;
  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    if (page.users.length > 0) {
      await adminAuth.deleteUsers(page.users.map((user) => user.uid));
    }
    pageToken = page.pageToken;
  } while (pageToken);
}

async function createClient(label, uid) {
  const app = initializeApp(
    {
      apiKey: "demo-api-key",
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      projectId: PROJECT_ID,
      storageBucket: STORAGE_BUCKET,
    },
    `storage-media-${label}-${Date.now()}-${Math.random()}`
  );
  apps.push(app);

  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}:${authPort}`, {
    disableWarnings: true,
  });

  const db = getFirestore(app);
  connectFirestoreEmulator(db, firestoreHost, firestorePort);

  const storage = getStorage(app);
  connectStorageEmulator(storage, storageHost, storagePort);

  if (uid) {
    const token = await adminAuth.createCustomToken(uid);
    await signInWithCustomToken(auth, token);
  }

  return { app, auth, db, storage, uid };
}

function blobOf(contentType, size = 24) {
  return new Blob([new Uint8Array(size).fill(7)], { type: contentType });
}

async function uploadAs(client, path, contentType, options = {}) {
  const uid = options.metadataUid ?? client.uid;
  const metadata = {
    contentType,
    customMetadata: uid ? { uid } : undefined,
  };

  await uploadBytes(ref(client.storage, path), blobOf(contentType), metadata);
}

async function uploadIntakeAs(
  client,
  uploadId,
  filename,
  contentType,
  destinationFolder,
  destinationFilename,
  options = {}
) {
  const uid = options.metadataUid ?? client.uid;
  const pathUid = options.pathUid ?? client.uid;
  const metadata = {
    contentType,
    customMetadata: {
      ...(uid ? { uid } : {}),
      upload_id: options.uploadIdMetadata ?? uploadId,
      destination_folder: destinationFolder,
      destination_filename: destinationFilename,
      target_kind: options.targetKind ?? destinationFolder,
      ...(options.targetId ? { target_id: options.targetId } : {}),
    },
  };

  await uploadBytes(
    ref(client.storage, `media_intake/${pathUid}/${uploadId}/${filename}`),
    blobOf(contentType),
    metadata
  );
}

async function assertDenied(label, operation) {
  try {
    await operation();
  } catch (error) {
    if (
      error?.code === "storage/unauthorized" ||
      error?.code === "permission-denied"
    ) {
      return;
    }
    throw new Error(
      `${label} failed with ${error?.code || "unknown"} instead of permission denied: ${error.message}`
    );
  }

  throw new Error(`${label} should have been denied, but succeeded`);
}

async function main() {
  console.log("Resetting Auth and Firestore emulators for storage tests...");
  await resetEmulators();

  await adminDb.collection("users").doc(USERS.uploader).set({
    display_name: "Media Flow Uploader",
  });
  await adminDb.collection("users").doc(USERS.other).set({
    display_name: "Other Media User",
  });
  await adminDb.collection("users").doc(USERS.admin).set({
    display_name: "Media Flow Admin",
    is_admin: true,
  });
  await adminDb.collection("users").doc(USERS.restricted).set({
    display_name: "Media Flow Restricted",
    age_policy: {
      participation_state: "read_only_age_restricted",
      source: "android_play_age_signals",
      platform: "android",
    },
  });

  const uploader = await createClient("uploader", USERS.uploader);
  const other = await createClient("other", USERS.other);
  const adminClient = await createClient("admin", USERS.admin);
  const restricted = await createClient("restricted", USERS.restricted);
  const anonymous = await createClient("anonymous");
  const suffix = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;

  console.log("Checking profile picture intake rules...");
  const profilePath = `profile_pictures/${USERS.uploader}`;
  await uploadAs(uploader, profilePath, "image/png");
  await uploadIntakeAs(
    uploader,
    `profile-${suffix}`,
    `profile-${suffix}.png`,
    "image/png",
    "profile_pictures",
    USERS.uploader,
    { targetKind: "profile" }
  );
  await assertDenied("anonymous intake read", () =>
    getDownloadURL(
      ref(
        anonymous.storage,
        `media_intake/${USERS.uploader}/profile-${suffix}/profile-${suffix}.png`
      )
    )
  );

  await assertDenied("profile picture path for another user", () =>
    uploadIntakeAs(
      uploader,
      `profile-other-${suffix}`,
      `profile-other-${suffix}.png`,
      "image/png",
      "profile_pictures",
      USERS.other,
      { targetKind: "profile" }
    )
  );
  await assertDenied("profile picture with forged metadata uid", () =>
    uploadIntakeAs(
      uploader,
      `profile-forged-${suffix}`,
      `profile-forged-${suffix}.png`,
      "image/png",
      "profile_pictures",
      USERS.uploader,
      {
        targetKind: "profile",
        pathUid: USERS.uploader,
        uploadIdMetadata: `profile-forged-${suffix}`,
        metadataUid: USERS.other,
      }
    )
  );
  await assertDenied("profile picture text upload", () =>
    uploadIntakeAs(
      uploader,
      `profile-text-${suffix}`,
      `profile-text-${suffix}.txt`,
      "text/plain",
      "profile_pictures",
      USERS.uploader,
      { targetKind: "profile" }
    )
  );
  await assertDenied("profile picture svg upload", () =>
    uploadIntakeAs(
      uploader,
      `profile-svg-${suffix}`,
      `profile-svg-${suffix}.svg`,
      "image/svg+xml",
      "profile_pictures",
      USERS.uploader,
      { targetKind: "profile" }
    )
  );
  await assertDenied("restricted profile picture upload", () =>
    uploadIntakeAs(
      restricted,
      `profile-restricted-${suffix}`,
      `profile-restricted-${suffix}.png`,
      "image/png",
      "profile_pictures",
      USERS.restricted,
      { targetKind: "profile" }
    )
  );

  console.log("Checking spot media intake rules...");
  const spotImagePath = `spot_pictures/${suffix}.jpg`;
  await uploadAs(uploader, spotImagePath, "image/jpeg");
  await uploadIntakeAs(
    uploader,
    `spot-${suffix}`,
    `spot-${suffix}.jpg`,
    "image/jpeg",
    "spot_pictures",
    `spot-${suffix}`,
    { targetKind: "spot", targetId: "spot-id" }
  );

  await assertDenied("anonymous spot image upload", () =>
    uploadIntakeAs(
      anonymous,
      `anon-${suffix}`,
      `anon-${suffix}.jpg`,
      "image/jpeg",
      "spot_pictures",
      `anon-${suffix}`,
      { targetKind: "spot", targetId: "spot-id" }
    )
  );
  await assertDenied("spot text upload", () =>
    uploadIntakeAs(
      uploader,
      `spot-text-${suffix}`,
      `spot-text-${suffix}.txt`,
      "text/plain",
      "spot_pictures",
      `spot-text-${suffix}`,
      { targetKind: "spot" }
    )
  );
  await assertDenied("spot svg upload", () =>
    uploadIntakeAs(
      uploader,
      `spot-svg-${suffix}`,
      `spot-svg-${suffix}.svg`,
      "image/svg+xml",
      "spot_pictures",
      `spot-svg-${suffix}`,
      { targetKind: "spot" }
    )
  );
  await assertDenied("spot image upload without expected extension", () =>
    uploadIntakeAs(
      uploader,
      `spot-noext-${suffix}`,
      `spot-noext-${suffix}`,
      "image/jpeg",
      "spot_pictures",
      `spot-noext-${suffix}`,
      { targetKind: "spot" }
    )
  );
  await assertDenied("spot image upload with forged metadata uid", () =>
    uploadIntakeAs(
      uploader,
      `spot-forged-${suffix}`,
      `spot-forged-${suffix}.jpg`,
      "image/jpeg",
      "spot_pictures",
      `spot-forged-${suffix}`,
      { targetKind: "spot", metadataUid: USERS.other }
    )
  );
  await assertDenied("restricted spot image upload", () =>
    uploadIntakeAs(
      restricted,
      `spot-restricted-${suffix}`,
      `spot-restricted-${suffix}.jpg`,
      "image/jpeg",
      "spot_pictures",
      `spot-restricted-${suffix}`,
      { targetKind: "spot" }
    )
  );
  await assertDenied("signed-in upload to unknown path", () =>
    uploadAs(uploader, `random_bucket/${suffix}.jpg`, "image/jpeg")
  );

  console.log("Checking post and challenge media paths...");
  await uploadAs(uploader, `post_media/direct-${suffix}.mp4`, "video/mp4");
  await uploadAs(uploader, `challenges/direct-${suffix}.mov`, "video/quicktime");
  await uploadIntakeAs(
    uploader,
    `post-${suffix}`,
    `post-${suffix}.mp4`,
    "video/mp4",
    "post_media",
    `post-${suffix}`,
    { targetKind: "post" }
  );
  await uploadIntakeAs(
    uploader,
    `challenge-${suffix}`,
    `challenge-${suffix}.mov`,
    "video/quicktime",
    "challenges",
    `challenge-${suffix}`,
    { targetKind: "challenge" }
  );
  await assertDenied("restricted post media upload", () =>
    uploadIntakeAs(
      restricted,
      `post-restricted-${suffix}`,
      `post-restricted-${suffix}.mp4`,
      "video/mp4",
      "post_media",
      `post-restricted-${suffix}`,
      { targetKind: "post" }
    )
  );
  await assertDenied("restricted challenge media upload", () =>
    uploadIntakeAs(
      restricted,
      `challenge-restricted-${suffix}`,
      `challenge-restricted-${suffix}.mov`,
      "video/quicktime",
      "challenges",
      `challenge-restricted-${suffix}`,
      { targetKind: "challenge" }
    )
  );
  await assertDenied("post media extension/content type mismatch", () =>
    uploadIntakeAs(
      uploader,
      `post-mismatch-${suffix}`,
      `post-mismatch-${suffix}.mp4`,
      "image/jpeg",
      "post_media",
      `post-mismatch-${suffix}`,
      { targetKind: "post" }
    )
  );
  await assertDenied("challenge non-media upload", () =>
    uploadIntakeAs(
      uploader,
      `challenge-text-${suffix}`,
      `challenge-text-${suffix}.txt`,
      "text/plain",
      "challenges",
      `challenge-text-${suffix}`,
      { targetKind: "challenge" }
    )
  );

  console.log("Checking admin-only event and import media rules...");
  await assertDenied("regular user event media upload", () =>
    uploadIntakeAs(
      uploader,
      `event-${suffix}`,
      `event-${suffix}.webp`,
      "image/webp",
      "event_media",
      `event-${suffix}`,
      { targetKind: "event_media" }
    )
  );
  const eventMediaPath = `event_media/${suffix}.webp`;
  await uploadAs(adminClient, eventMediaPath, "image/webp");
  await uploadIntakeAs(
    adminClient,
    `event-admin-${suffix}`,
    `event-admin-${suffix}.webp`,
    "image/webp",
    "event_media",
    `event-admin-${suffix}`,
    { targetKind: "event_media" }
  );
  await assertDenied("admin event text upload", () =>
    uploadIntakeAs(
      adminClient,
      `event-text-${suffix}`,
      `event-text-${suffix}.txt`,
      "text/plain",
      "event_media",
      `event-text-${suffix}`,
      { targetKind: "event_media" }
    )
  );
  await assertDenied("admin event svg upload", () =>
    uploadIntakeAs(
      adminClient,
      `event-svg-${suffix}`,
      `event-svg-${suffix}.svg`,
      "image/svg+xml",
      "event_media",
      `event-svg-${suffix}`,
      { targetKind: "event_media" }
    )
  );

  await assertDenied("regular user import source upload", () =>
    uploadAs(uploader, `imports/import_${suffix}.kml`, "application/xml")
  );
  await assertDenied("admin import upload with unexpected path", () =>
    uploadAs(adminClient, `imports/${suffix}.kml`, "application/xml")
  );
  await assertDenied("admin import upload with unexpected MIME type", () =>
    uploadAs(adminClient, `imports/import_${suffix}.kml`, "text/plain")
  );
  await uploadAs(adminClient, `imports/import_${suffix}.kml`, "application/xml");
  assert.match(
    await getDownloadURL(ref(adminClient.storage, `imports/import_${suffix}.kml`)),
    /^http/
  );
  await assertDenied("anonymous import source read", () =>
    getDownloadURL(ref(anonymous.storage, `imports/import_${suffix}.kml`))
  );

  // Keep the second signed-in client live so forged-metadata checks exercise
  // a real auth identity instead of a nonexistent uid.
  assert.equal(other.auth.currentUser.uid, USERS.other);

  console.log("Storage media emulator tests passed.");
}

main()
  .catch((error) => {
    console.error("Storage media emulator tests failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all(apps.map((app) => deleteApp(app).catch(() => undefined)));
    await admin.app().delete().catch(() => undefined);
  });
