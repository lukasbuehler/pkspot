const assert = require("node:assert/strict");
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

if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
) {
  throw new Error(
    "Refusing to run user profile tests without Auth and Firestore emulators."
  );
}

process.env.GCLOUD_PROJECT =
  process.env.GCLOUD_PROJECT || "demo-pkspot";

const projectId = process.env.GCLOUD_PROJECT;
admin.initializeApp({ projectId });
const db = admin.firestore();
const authAdmin = admin.auth();
const clientApps = [];

const emulatorAddress = (value) => {
  const [host, portValue] = value.split(":");
  const port = Number(portValue);
  if (!host || !Number.isInteger(port)) {
    throw new Error(`Invalid emulator address: ${value}`);
  }
  return { host, port };
};

const authEmulator = emulatorAddress(
  process.env.FIREBASE_AUTH_EMULATOR_HOST
);
const functionsEmulator = emulatorAddress(
  process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5001"
);

async function createCallableClient(uid) {
  const app = initializeApp(
    {
      apiKey: "demo-api-key",
      authDomain: `${projectId}.firebaseapp.com`,
      projectId,
    },
    `user-profile-${uid || "anonymous"}-${Date.now()}-${Math.random()}`
  );
  clientApps.push(app);

  if (uid) {
    await authAdmin.createUser({ uid });
    const auth = getAuth(app);
    connectAuthEmulator(
      auth,
      `http://${authEmulator.host}:${authEmulator.port}`,
      { disableWarnings: true }
    );
    await signInWithCustomToken(
      auth,
      await authAdmin.createCustomToken(uid)
    );
  }

  const functions = getFunctions(app, "europe-west1");
  connectFunctionsEmulator(
    functions,
    functionsEmulator.host,
    functionsEmulator.port
  );
  return {
    getProfile: httpsCallable(functions, "getUserProfile"),
    backfill: httpsCallable(functions, "backfillPublicUserProfiles"),
    cutover: httpsCallable(
      functions,
      "activateUserProfilePrivacyCutover"
    ),
  };
}

async function waitForDocument(path, shouldExist = true, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await db.doc(path).get();
    if (snapshot.exists === shouldExist) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Timed out waiting for ${path} to ${
      shouldExist ? "exist" : "be deleted"
    }`
  );
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

async function main() {
  const now = admin.firestore.Timestamp.now();
  await Promise.all([
    db.doc("users/public-adult").set({
      display_name: "Public Adult",
      biography: "Visible biography",
      profile_picture: "profile_pictures/public.jpg",
      home_city: "London",
      verified_email: true,
      blocked_users: ["viewer"],
      account_privacy: "public",
      profile_visibility: "public",
      public_profile_enabled: true,
      public_search: true,
      age_policy: {
        participation_state: "allowed",
        source: "android_play_age_signals",
        platform: "android",
        adult_eligibility: "verified",
        age_range: { lower: 18 },
        assurance: {
          signal_version: 3,
          evidence_strength: "independently_checked",
          client_integrity: "play_integrity_request_bound",
          app_id: "test-android-app",
          status: "active",
          approval_basis:
            "google_play:platform_age_signal:tier_c:request_bound:v1",
          limitation: "platform_account_or_device_may_be_shared",
          age_range_source: "tier_c",
        },
      },
      creationDate: now,
    }),
    db.doc("users/private-adult").set({
      display_name: "Private Adult",
      biography: "Follower biography",
      profile_picture: "profile_pictures/private.jpg",
      home_city: "Bristol",
      account_privacy: "private",
      profile_visibility: "followers",
      public_profile_enabled: false,
      public_search: false,
      age_policy: {
        participation_state: "allowed",
        source: "manual",
        platform: "web",
        age_range: { lower: 18 },
      },
    }),
    db.doc("users/minor").set({
      display_name: "Minor",
      biography: "Must remain hidden",
      profile_picture: "profile_pictures/minor.jpg",
      home_city: "Manchester",
      account_privacy: "public",
      profile_visibility: "public",
      public_profile_enabled: true,
      public_search: true,
      age_policy: {
        participation_state: "allowed",
        source: "manual",
        platform: "web",
        age_range: { lower: 13, upper: 17 },
      },
    }),
    db.doc("users/viewer").set({
      display_name: "Viewer",
      is_admin: false,
    }),
    db.doc("users/admin").set({
      display_name: "Admin",
      is_admin: true,
    }),
    db.doc("users/private-adult/followers/viewer").set({
      display_name: "Viewer",
    }),
  ]);

  const [anonymous, viewer, moderator] = await Promise.all([
    createCallableClient(),
    createCallableClient("viewer"),
    createCallableClient("admin"),
  ]);

  const publicResult = await anonymous.getProfile({
    user_id: "public-adult",
  });
  assert.equal(publicResult.data.profile_access, "full");
  assert.equal(publicResult.data.home_city, "London");
  assert.equal(publicResult.data.verified_email, undefined);
  assert.equal(publicResult.data.blocked_users, undefined);

  const privateAnonymousResult = await anonymous.getProfile({
    user_id: "private-adult",
  });
  assert.deepEqual(privateAnonymousResult.data, {
    uid: "private-adult",
    display_name: "Private Adult",
    account_privacy: "private",
    profile_visibility: "followers",
    public_profile_enabled: false,
    public_search: false,
    profile_access: "limited",
  });

  const privateFollowerResult = await viewer.getProfile({
    user_id: "private-adult",
  });
  assert.equal(privateFollowerResult.data.profile_access, "full");
  assert.equal(privateFollowerResult.data.home_city, "Bristol");

  const minorResult = await anonymous.getProfile({ user_id: "minor" });
  assert.equal(minorResult.data.profile_access, "limited");
  assert.equal(minorResult.data.profile_picture, undefined);
  assert.equal(minorResult.data.home_city, undefined);

  const moderatorResult = await moderator.getProfile({ user_id: "minor" });
  assert.equal(moderatorResult.data.profile_access, "full");

  const publicProjection = await waitForDocument(
    "public_user_profiles/public-adult"
  );
  assert.equal(publicProjection.data().public_search, true);
  assert.equal(publicProjection.data().verified_email, undefined);
  await waitForDocument("public_user_profiles/minor", false);

  // A delayed older event may have recreated a stale projection. Any later
  // source event must reconcile from current state, even when both event
  // snapshots still describe a private user.
  await db.doc("public_user_profiles/private-adult").set({
    display_name: "Stale public projection",
    profile_access: "full",
  });
  await waitForDocument("public_user_profiles/private-adult");
  await db.doc("users/private-adult").update({spot_edits_count: 1});
  await waitForDocument("public_user_profiles/private-adult", false);

  await db.doc("users/public-adult").update({
    public_profile_enabled: false,
    public_search: false,
  });
  await waitForDocument("public_user_profiles/public-adult", false);

  await assertCallableRejected(
    () => viewer.backfill({ dry_run: false }),
    "functions/permission-denied"
  );
  const dryRun = await moderator.backfill({ dry_run: true });
  assert.equal(dryRun.data.dry_run, true);
  assert.equal(
    (await db.doc("maintenance/user-profile-projection").get()).exists,
    false
  );

  const backfill = await moderator.backfill({ dry_run: false });
  assert.equal(backfill.data.dry_run, false);
  assert.equal(
    (await db.doc("maintenance/user-profile-projection").get()).data()
      .completed,
    true
  );

  await assertCallableRejected(
    () =>
      moderator.cutover({
        confirmation: "wrong",
        minimum_supported_client_version: "1.1.4",
      }),
    "functions/failed-precondition"
  );
  const cutover = await moderator.cutover({
    confirmation: "restrict-legacy-user-profile-reads",
    minimum_supported_client_version: "1.1.4",
  });
  assert.equal(cutover.data.ok, true);

  console.log("User profile privacy emulator tests passed.");
}

main()
  .then(async () => {
    await Promise.all(clientApps.map((app) => deleteApp(app)));
    await admin.app().delete();
  })
  .catch(async (error) => {
    console.error(error);
    await Promise.all(clientApps.map((app) => deleteApp(app)));
    await admin.app().delete();
    process.exit(1);
  });
