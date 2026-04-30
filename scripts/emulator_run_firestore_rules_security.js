const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const {
  initializeApp,
  deleteApp,
} = require("firebase/app");
const {
  collection,
  collectionGroup,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  updateDoc,
  where,
} = require("firebase/firestore");
const {
  connectAuthEmulator,
  getAuth,
  signInWithCustomToken,
  signOut,
} = require("firebase/auth");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    "Refusing to run Firestore rules security tests without FIRESTORE_EMULATOR_HOST."
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

if (!firestoreHost || !Number.isInteger(firestorePort)) {
  throw new Error(`Invalid FIRESTORE_EMULATOR_HOST: ${FIRESTORE_HOST}`);
}

if (!authHost || !Number.isInteger(authPort)) {
  throw new Error(`Invalid FIREBASE_AUTH_EMULATOR_HOST: ${AUTH_HOST}`);
}

const apps = [];

async function resetEmulatorFirestore() {
  const collections = await adminDb.listCollections();
  await Promise.all(collections.map((collectionRef) => adminDb.recursiveDelete(collectionRef)));
}

async function createClient(uid) {
  const app = initializeApp(
    {
      apiKey: "demo-api-key",
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      projectId: PROJECT_ID,
    },
    `rules-test-${uid ?? "anon"}-${Date.now()}-${Math.random()}`
  );
  apps.push(app);

  const db = getFirestore(app);
  connectFirestoreEmulator(db, firestoreHost, firestorePort);

  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}:${authPort}`, {
    disableWarnings: true,
  });

  if (uid) {
    const token = await adminAuth.createCustomToken(uid);
    await signInWithCustomToken(auth, token);
  } else {
    await signOut(auth);
  }

  return { app, auth, db, uid };
}

async function assertAllowed(label, operation) {
  try {
    return await operation();
  } catch (error) {
    throw new Error(`${label} should have been allowed, but failed: ${error.message}`);
  }
}

async function assertDenied(label, operation) {
  try {
    await operation();
  } catch (error) {
    if (error?.code === "permission-denied") {
      return;
    }
    throw new Error(`${label} failed with ${error?.code || "unknown"} instead of permission-denied: ${error.message}`);
  }

  throw new Error(`${label} should have been denied, but succeeded`);
}

async function seedSecurityFixture() {
  const batch = adminDb.batch();
  batch.set(adminDb.doc("spots/public-spot"), {
    name: { en: "Public Spot" },
    source: "pkspot",
  });
  batch.set(adminDb.doc("spots/public-spot/edits/public-edit"), {
    type: "UPDATE",
    user: { uid: "owner" },
    timestamp_raw_ms: 1,
  });
  batch.set(adminDb.doc("spots/public-spot/reviews/owner"), {
    rating: 4,
    user: { uid: "owner" },
  });
  batch.set(adminDb.doc("spots/public-spot/challenges/future-owner"), {
    release_date: admin.firestore.Timestamp.fromMillis(Date.now() + 86_400_000),
    user: { uid: "owner" },
  });
  batch.set(adminDb.doc("spot_clusters/z16_1_1"), { spots: [] });
  batch.set(adminDb.doc("spot_slugs/public-spot"), { spot_id: "public-spot" });
  batch.set(adminDb.doc("events/event-1"), { title: { en: "Public Event" } });
  batch.set(adminDb.doc("event_slugs/public-event"), { event_id: "event-1" });
  batch.set(adminDb.doc("series/series-1"), { name: "Public Series" });
  batch.set(adminDb.doc("community_pages/ch-zurich"), { title: "Zurich" });
  batch.set(adminDb.doc("community_slugs/zurich"), { key: "ch-zurich" });
  batch.set(adminDb.doc("leaderboards/spots_edited"), { entries: [] });
  batch.set(adminDb.doc("users/owner"), {
    display_name: "Owner",
    is_admin: false,
    spot_edits_count: 4,
  });
  batch.set(adminDb.doc("users/admin"), {
    display_name: "Admin",
    is_admin: true,
  });
  batch.set(adminDb.doc("users/owner/private_data/profile"), {
    bookmarks: ["public-spot"],
  });
  batch.set(adminDb.doc("users/owner/check_ins/check-in-1"), {
    spot_id: "public-spot",
  });
  batch.set(adminDb.doc("users/owner/following/other"), {
    created_at_raw_ms: 1,
  });
  batch.set(adminDb.doc("users/owner/followers/other"), {
    created_at_raw_ms: 1,
  });
  batch.set(adminDb.doc("posts/post-1"), {
    user: { uid: "owner" },
    text: "hello",
  });
  batch.set(adminDb.doc("posts/post-1/likes/owner"), {
    user: { uid: "owner" },
  });
  batch.set(adminDb.doc("imports/import-owner"), {
    user: { uid: "owner" },
    status: "READY",
  });
  batch.set(adminDb.doc("imports/import-owner/chunks/chunk-1"), {
    rows: [{ name: "Spot" }],
  });
  await batch.commit();
}

async function testPublicReadSurface(anon) {
  await assertAllowed("anonymous spot read", () => getDoc(doc(anon.db, "spots/public-spot")));
  await assertAllowed("anonymous edit read", () =>
    getDoc(doc(anon.db, "spots/public-spot/edits/public-edit"))
  );
  await assertAllowed("anonymous collection group edits read", async () => {
    const snapshot = await getDocs(collectionGroup(anon.db, "edits"));
    assert.ok(snapshot.docs.some((item) => item.id === "public-edit"));
  });
  await assertAllowed("anonymous spot cluster read", () =>
    getDoc(doc(anon.db, "spot_clusters/z16_1_1"))
  );
  await assertAllowed("anonymous event read", () => getDoc(doc(anon.db, "events/event-1")));
  await assertAllowed("anonymous series read", () => getDoc(doc(anon.db, "series/series-1")));
  await assertAllowed("anonymous community page read", () =>
    getDoc(doc(anon.db, "community_pages/ch-zurich"))
  );
  await assertAllowed("anonymous leaderboard read", () =>
    getDoc(doc(anon.db, "leaderboards/spots_edited"))
  );
}

async function testSpotWriteGuards(anon, owner, other, adminUser) {
  await assertDenied("anonymous spot placeholder create", () =>
    setDoc(doc(anon.db, "spots/anon-created"), {})
  );
  await assertAllowed("authenticated empty spot placeholder create", () =>
    setDoc(doc(owner.db, "spots/owner-placeholder"), {})
  );
  await assertDenied("authenticated direct spot create with data", () =>
    setDoc(doc(owner.db, "spots/direct-data"), {
      name: { en: "Bypass" },
      rating: 5,
    })
  );
  await assertDenied("authenticated direct spot update", () =>
    updateDoc(doc(owner.db, "spots/public-spot"), { rating: 5 })
  );
  await assertDenied("non-admin spot delete", () =>
    deleteDoc(doc(owner.db, "spots/public-spot"))
  );
  await assertAllowed("admin spot delete", async () => {
    await setDoc(doc(adminUser.db, "spots/admin-delete-target"), {});
    await deleteDoc(doc(adminUser.db, "spots/admin-delete-target"));
  });

  await assertAllowed("owner review create", () =>
    setDoc(doc(owner.db, "spots/owner-placeholder/reviews/owner"), {
      rating: 5,
      user: { uid: "owner" },
    })
  );
  await assertDenied("review impersonation create", () =>
    setDoc(doc(other.db, "spots/public-spot/reviews/owner"), {
      rating: 5,
      user: { uid: "owner" },
    })
  );
  await assertDenied("invalid review rating create", () =>
    setDoc(doc(owner.db, "spots/public-spot/reviews/bad-rating"), {
      rating: 99,
      user: { uid: "owner" },
    })
  );

  await assertAllowed("owner spot edit create", () =>
    setDoc(doc(owner.db, "spots/public-spot/edits/owner-edit"), {
      type: "UPDATE",
      user: { uid: "owner" },
      data: { name: { en: "Allowed via function path" } },
    })
  );
  await assertDenied("spot edit impersonation create", () =>
    setDoc(doc(other.db, "spots/public-spot/edits/impersonated-edit"), {
      type: "UPDATE",
      user: { uid: "owner" },
      data: { name: { en: "Nope" } },
    })
  );
  await assertDenied("client spot edit update", () =>
    updateDoc(doc(owner.db, "spots/public-spot/edits/owner-edit"), {
      approved: true,
    })
  );
  await assertDenied("non-admin spot edit delete", () =>
    deleteDoc(doc(owner.db, "spots/public-spot/edits/owner-edit"))
  );

  await assertAllowed("owner vote create", () =>
    setDoc(doc(owner.db, "spots/public-spot/edits/public-edit/votes/owner"), {
      value: 1,
      vote: "yes",
      user: { uid: "owner" },
    })
  );
  await assertDenied("vote document id impersonation", () =>
    setDoc(doc(other.db, "spots/public-spot/edits/public-edit/votes/owner"), {
      value: 1,
      vote: "yes",
      user: { uid: "other" },
    })
  );
  await assertDenied("vote payload impersonation", () =>
    setDoc(doc(other.db, "spots/public-spot/edits/public-edit/votes/other"), {
      value: 1,
      vote: "yes",
      user: { uid: "owner" },
    })
  );
}

async function testUserPrivacyAndPrivilegeEscalation(anon, owner, other) {
  await assertAllowed("anonymous public user profile read", () =>
    getDoc(doc(anon.db, "users/owner"))
  );
  await assertDenied("user creates a profile under another uid", () =>
    setDoc(doc(owner.db, "users/new-owner-profile"), {
      display_name: "Not actually own id should fail",
    })
  );
  await assertAllowed("owner updates own display name", () =>
    updateDoc(doc(owner.db, "users/owner"), {
      display_name: "Owner Updated",
    })
  );
  await assertDenied("owner escalates is_admin", () =>
    updateDoc(doc(owner.db, "users/owner"), {
      is_admin: true,
    })
  );
  await assertDenied("owner edits protected contribution counters", () =>
    updateDoc(doc(owner.db, "users/owner"), {
      spot_edits_count: 9999,
    })
  );
  await assertDenied("user updates another user's profile", () =>
    updateDoc(doc(other.db, "users/owner"), {
      display_name: "Compromised",
    })
  );
  await assertAllowed("owner reads own private data", () =>
    getDoc(doc(owner.db, "users/owner/private_data/profile"))
  );
  await assertDenied("other user reads owner private data", () =>
    getDoc(doc(other.db, "users/owner/private_data/profile"))
  );
  await assertDenied("anonymous reads owner private data", () =>
    getDoc(doc(anon.db, "users/owner/private_data/profile"))
  );
  await assertAllowed("owner reads own check-ins", () =>
    getDocs(collection(owner.db, "users/owner/check_ins"))
  );
  await assertDenied("other user reads owner check-ins", () =>
    getDocs(collection(other.db, "users/owner/check_ins"))
  );
  await assertAllowed("owner reads own following", () =>
    getDocs(collection(owner.db, "users/owner/following"))
  );
  await assertDenied("other user reads owner following", () =>
    getDocs(collection(other.db, "users/owner/following"))
  );
  await assertAllowed("other user writes owner follower edge for themself", () =>
    setDoc(doc(other.db, "users/owner/followers/other"), {
      created_at_raw_ms: 2,
    })
  );
  await assertDenied("other user writes owner follower edge for third party", () =>
    setDoc(doc(other.db, "users/owner/followers/attacker-controlled"), {
      created_at_raw_ms: 2,
    })
  );
}

async function testReadOnlyBackendCollections(owner) {
  for (const [label, path] of [
    ["spot cluster", "spot_clusters/z16_1_2"],
    ["event", "events/client-event"],
    ["event slug", "event_slugs/client-event"],
    ["series", "series/client-series"],
    ["community page", "community_pages/client-community"],
    ["community slug", "community_slugs/client-community"],
    ["leaderboard", "leaderboards/client-board"],
  ]) {
    await assertDenied(`client write to ${label}`, () =>
      setDoc(doc(owner.db, path), { attacker: true })
    );
  }
}

async function testPostAndImportGuards(anon, owner, other) {
  await assertAllowed("authenticated post create without like_count", () =>
    setDoc(doc(owner.db, "posts/owner-post"), {
      user: { uid: "owner" },
      text: "ok",
    })
  );
  await assertDenied("post create with forged like_count", () =>
    setDoc(doc(owner.db, "posts/like-count-forgery"), {
      user: { uid: "owner" },
      text: "nope",
      like_count: 999,
    })
  );
  await assertDenied("post create impersonating another user", () =>
    setDoc(doc(other.db, "posts/impersonated-post"), {
      user: { uid: "owner" },
      text: "nope",
    })
  );
  await assertDenied("anonymous reads post likes", () =>
    getDocs(collection(anon.db, "posts/post-1/likes"))
  );
  await assertAllowed("authenticated reads post likes", () =>
    getDocs(collection(owner.db, "posts/post-1/likes"))
  );

  await assertAllowed("owner import create", () =>
    setDoc(doc(owner.db, "imports/new-import"), {
      user: { uid: "owner" },
      status: "CREATED",
    })
  );
  await assertDenied("import create impersonating owner", () =>
    setDoc(doc(other.db, "imports/forged-import"), {
      user: { uid: "owner" },
      status: "CREATED",
    })
  );
  await assertAllowed("owner reads own import chunks", () =>
    getDocs(collection(owner.db, "imports/import-owner/chunks"))
  );
  await assertDenied("other user reads owner import chunks", () =>
    getDocs(collection(other.db, "imports/import-owner/chunks"))
  );
  await assertAllowed("owner creates own import chunk", () =>
    setDoc(doc(owner.db, "imports/import-owner/chunks/new-chunk"), {
      rows: [],
    })
  );
  await assertDenied("other user creates owner import chunk", () =>
    setDoc(doc(other.db, "imports/import-owner/chunks/evil-chunk"), {
      rows: [],
    })
  );
}

async function testChallengeVisibility(anon, owner, other) {
  await assertAllowed("challenge owner reads unreleased challenge", () =>
    getDoc(doc(owner.db, "spots/public-spot/challenges/future-owner"))
  );
  await assertDenied("other user reads unreleased challenge", () =>
    getDoc(doc(other.db, "spots/public-spot/challenges/future-owner"))
  );
  await assertDenied("anonymous reads unreleased challenge", () =>
    getDoc(doc(anon.db, "spots/public-spot/challenges/future-owner"))
  );
  await assertAllowed("owner challenge write", () =>
    setDoc(doc(owner.db, "spots/public-spot/challenges/owner-challenge"), {
      user: { uid: "owner" },
      title: "Precision",
    })
  );
  await assertDenied("challenge impersonation write", () =>
    setDoc(doc(other.db, "spots/public-spot/challenges/forged-challenge"), {
      user: { uid: "owner" },
      title: "Nope",
    })
  );
}

async function testQueriesDoNotBypassRules(owner, other) {
  await assertAllowed("owner private data query", async () => {
    const snapshot = await getDocs(collection(owner.db, "users/owner/private_data"));
    assert.equal(snapshot.size, 1);
  });
  await assertDenied("other user private data query", () =>
    getDocs(collection(other.db, "users/owner/private_data"))
  );
}

async function cleanupApps() {
  await Promise.all(apps.map((app) => deleteApp(app)));
}

async function main() {
  console.log("Resetting Firestore emulator for rules security tests...");
  await resetEmulatorFirestore();
  await seedSecurityFixture();

  const anon = await createClient(null);
  const owner = await createClient("owner");
  const other = await createClient("other");
  const adminUser = await createClient("admin");

  console.log("Running Firestore rules security tests...");
  await testPublicReadSurface(anon);
  await testSpotWriteGuards(anon, owner, other, adminUser);
  await testUserPrivacyAndPrivilegeEscalation(anon, owner, other);
  await testReadOnlyBackendCollections(owner);
  await testPostAndImportGuards(anon, owner, other);
  await testChallengeVisibility(anon, owner, other);
  await testQueriesDoNotBypassRules(owner, other);

  console.log("Firestore rules security tests passed.");
}

main()
  .then(async () => {
    await cleanupApps();
    await admin.app().delete();
  })
  .catch(async (error) => {
    console.error(error);
    await cleanupApps();
    await admin.app().delete();
    process.exit(1);
  });
