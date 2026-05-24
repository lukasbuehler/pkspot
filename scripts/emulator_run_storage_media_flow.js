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

  const uploader = await createClient("uploader", USERS.uploader);
  const other = await createClient("other", USERS.other);
  const adminClient = await createClient("admin", USERS.admin);
  const anonymous = await createClient("anonymous");
  const suffix = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;

  console.log("Checking profile picture owner rules...");
  const profilePath = `profile_pictures/${USERS.uploader}`;
  await uploadAs(uploader, profilePath, "image/png");
  assert.match(await getDownloadURL(ref(anonymous.storage, profilePath)), /^http/);
  await deleteObject(ref(uploader.storage, profilePath));

  await assertDenied("profile picture path for another user", () =>
    uploadAs(uploader, `profile_pictures/${USERS.other}`, "image/png")
  );
  await assertDenied("profile picture with forged metadata uid", () =>
    uploadAs(uploader, `profile_pictures/${USERS.uploader}`, "image/png", {
      metadataUid: USERS.other,
    })
  );
  await assertDenied("profile picture text upload", () =>
    uploadAs(uploader, `profile_pictures/${USERS.uploader}.txt`, "text/plain")
  );
  await assertDenied("profile picture svg upload", () =>
    uploadAs(uploader, `profile_pictures/${USERS.uploader}`, "image/svg+xml")
  );

  console.log("Checking spot media upload rules...");
  const spotImagePath = `spot_pictures/${suffix}.jpg`;
  await uploadAs(uploader, spotImagePath, "image/jpeg");
  assert.match(await getDownloadURL(ref(anonymous.storage, spotImagePath)), /^http/);

  await assertDenied("anonymous spot image upload", () =>
    uploadAs(anonymous, `spot_pictures/anon-${suffix}.jpg`, "image/jpeg")
  );
  await assertDenied("spot text upload", () =>
    uploadAs(uploader, `spot_pictures/${suffix}.txt`, "text/plain")
  );
  await assertDenied("spot svg upload", () =>
    uploadAs(uploader, `spot_pictures/${suffix}.svg`, "image/svg+xml")
  );
  await assertDenied("spot image upload without expected extension", () =>
    uploadAs(uploader, `spot_pictures/${suffix}`, "image/jpeg")
  );
  await assertDenied("spot image upload with forged metadata uid", () =>
    uploadAs(uploader, `spot_pictures/forged-${suffix}.jpg`, "image/jpeg", {
      metadataUid: USERS.other,
    })
  );
  await assertDenied("signed-in upload to unknown path", () =>
    uploadAs(uploader, `random_bucket/${suffix}.jpg`, "image/jpeg")
  );

  console.log("Checking post and challenge media paths...");
  await uploadAs(uploader, `post_media/${suffix}.mp4`, "video/mp4");
  await uploadAs(uploader, `challenges/${suffix}.mov`, "video/quicktime");
  await assertDenied("post media extension/content type mismatch", () =>
    uploadAs(uploader, `post_media/mismatch-${suffix}.mp4`, "image/jpeg")
  );
  await assertDenied("challenge non-media upload", () =>
    uploadAs(uploader, `challenges/${suffix}.txt`, "text/plain")
  );

  console.log("Checking admin-only event and import media rules...");
  await assertDenied("regular user event media upload", () =>
    uploadAs(uploader, `event_media/${suffix}.webp`, "image/webp")
  );
  await uploadAs(adminClient, `event_media/${suffix}.webp`, "image/webp");
  await assertDenied("admin event text upload", () =>
    uploadAs(adminClient, `event_media/${suffix}.txt`, "text/plain")
  );
  await assertDenied("admin event svg upload", () =>
    uploadAs(adminClient, `event_media/${suffix}.svg`, "image/svg+xml")
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
