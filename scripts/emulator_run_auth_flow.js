const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { initializeApp, deleteApp } = require("firebase/app");
const {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} = require("firebase/auth");
const {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  updateDoc,
} = require("firebase/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    "Refusing to run auth flow tests without FIRESTORE_EMULATOR_HOST."
  );
}

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-pkspot";

admin.initializeApp({
  projectId: process.env.GCLOUD_PROJECT,
});

const adminDb = admin.firestore();
const adminAuth = admin.auth();

const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const [firestoreHost, firestorePortValue] = FIRESTORE_HOST.split(":");
const [authHost, authPortValue] = AUTH_HOST.split(":");
const firestorePort = Number(firestorePortValue);
const authPort = Number(authPortValue);
const PROJECT_ID = process.env.GCLOUD_PROJECT;
const apps = [];

const TEST_USER = {
  email: "auth-flow-user@example.test",
  password: "correct horse battery staple",
  displayName: "Auth Flow User",
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

function createClient(label) {
  const app = initializeApp(
    {
      apiKey: "demo-api-key",
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      projectId: PROJECT_ID,
    },
    `auth-flow-${label}-${Date.now()}-${Math.random()}`
  );
  apps.push(app);

  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}:${authPort}`, {
    disableWarnings: true,
  });

  const db = getFirestore(app);
  connectFirestoreEmulator(db, firestoreHost, firestorePort);

  return { app, auth, db };
}

async function assertDenied(label, operation) {
  try {
    await operation();
  } catch (error) {
    if (error?.code === "permission-denied") {
      return;
    }
    throw new Error(
      `${label} failed with ${error?.code || "unknown"} instead of permission-denied: ${error.message}`
    );
  }

  throw new Error(`${label} should have been denied, but succeeded`);
}

async function main() {
  console.log("Resetting Auth and Firestore emulators for auth flow tests...");
  await resetEmulators();

  const primary = createClient("primary");
  const anonymous = createClient("anonymous");

  console.log("Creating disposable email/password user...");
  const created = await createUserWithEmailAndPassword(
    primary.auth,
    TEST_USER.email,
    TEST_USER.password
  );
  assert.ok(created.user.uid, "Created user should have a uid");
  assert.equal(created.user.email, TEST_USER.email);

  await updateProfile(created.user, { displayName: TEST_USER.displayName });
  await sendEmailVerification(created.user);

  const adminUser = await adminAuth.getUser(created.user.uid);
  assert.equal(adminUser.email, TEST_USER.email);
  assert.equal(adminUser.displayName, TEST_USER.displayName);

  console.log("Creating self-owned public and private profile documents...");
  await setDoc(doc(primary.db, `users/${created.user.uid}`), {
    display_name: TEST_USER.displayName,
    verified_email: false,
  });
  await setDoc(doc(primary.db, `users/${created.user.uid}/private_data/main`), {
    settings: { maps: "googlemaps" },
  });

  const publicProfile = await getDoc(
    doc(anonymous.db, `users/${created.user.uid}`)
  );
  assert.equal(publicProfile.exists(), true, "Public profile should be readable");
  assert.equal(publicProfile.data().display_name, TEST_USER.displayName);

  const privateProfile = await getDoc(
    doc(primary.db, `users/${created.user.uid}/private_data/main`)
  );
  assert.equal(privateProfile.exists(), true, "Private data should be readable by owner");
  assert.deepEqual(privateProfile.data().settings, { maps: "googlemaps" });

  await assertDenied("anonymous private data read", () =>
    getDoc(doc(anonymous.db, `users/${created.user.uid}/private_data/main`))
  );
  await assertDenied("creating another user's profile", () =>
    setDoc(doc(primary.db, "users/someone-else"), {
      display_name: "Someone Else",
    })
  );
  await assertDenied("creating protected user counters", () =>
    setDoc(doc(primary.db, `users/${created.user.uid}-protected`), {
      display_name: "Protected",
      signup_number: 1,
    })
  );
  await assertDenied("updating protected user counters", () =>
    updateDoc(doc(primary.db, `users/${created.user.uid}`), {
      signup_number: 1,
    })
  );

  console.log("Signing out and signing back in with email/password...");
  await signOut(primary.auth);
  assert.equal(primary.auth.currentUser, null);

  const signedIn = await signInWithEmailAndPassword(
    primary.auth,
    TEST_USER.email,
    TEST_USER.password
  );
  assert.equal(signedIn.user.uid, created.user.uid);

  await sendPasswordResetEmail(primary.auth, TEST_USER.email);

  console.log("Deleting disposable auth user...");
  await deleteUser(signedIn.user);
  await assert.rejects(
    () => adminAuth.getUser(created.user.uid),
    /no user record|auth\/user-not-found/i
  );

  console.log("Auth emulator flow tests passed.");
}

main()
  .catch((error) => {
    console.error("Auth emulator flow tests failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all(apps.map((app) => deleteApp(app).catch(() => undefined)));
  });
