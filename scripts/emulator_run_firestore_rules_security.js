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
  addDoc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  Timestamp,
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

async function createClient(uid, email) {
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
    if (email) {
      await adminAuth.createUser({ uid, email });
    }
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
  batch.set(adminDb.doc("events/event-1"), {
    name: "Public Event",
    published: true,
    end: admin.firestore.Timestamp.fromMillis(Date.now() + 86_400_000),
    organizer: {
      type: "organization",
      organization: { id: "pk-spot", name: "PK Spot", slug: "pk-spot" },
    },
  });
  batch.set(adminDb.doc("events/event-1/live_updates/update-1"), {
    event_id: "event-1",
    type: "schedule_change",
    title: "Schedule updated",
    status: "published",
    created_at: admin.firestore.Timestamp.now(),
    created_by: "admin",
    published_at: admin.firestore.Timestamp.now(),
  });
  batch.set(adminDb.doc("events/unpublished-event"), {
    name: "Draft Event",
    published: false,
  });
  batch.set(adminDb.doc("events/unlisted-event"), {
    name: "Unlisted Event",
    publication_state: "published",
    published: true,
    visibility: "unlisted",
  });
  batch.set(adminDb.doc("events/private-event"), {
    name: "Private Event",
    publication_state: "published",
    published: true,
    visibility: "private",
    discoverability: { audience: "none" },
    owner: { type: "user", user_id: "owner" },
    viewer_policy: { audience: "invited" },
  });
  batch.set(adminDb.doc("events/private-event/access/other"), {
    user_id: "other",
    role: "viewer",
    granted_by: "owner",
    time_created: admin.firestore.Timestamp.now(),
    time_updated: admin.firestore.Timestamp.now(),
  });
  batch.set(adminDb.doc("events/member-event"), {
    name: "Organization Member Event",
    publication_state: "published",
    published: true,
    visibility: "private",
    discoverability: {
      audience: "organization_members",
      organization_id: "pk-spot",
    },
    owner: { type: "organization", organization_id: "pk-spot" },
    viewer_policy: {
      audience: "organization_members",
      organization_id: "pk-spot",
    },
  });
  batch.set(adminDb.doc("event_discovery/event-1"), {
    name: "Public Event",
    publication_state: "published",
    published: true,
    visibility: "public",
  });
  batch.set(adminDb.doc("events/unpublished-event/live_updates/update-1"), {
    event_id: "unpublished-event",
    type: "general_update",
    title: "Hidden update",
    status: "published",
    created_at: admin.firestore.Timestamp.now(),
    created_by: "admin",
    published_at: admin.firestore.Timestamp.now(),
  });
  batch.set(adminDb.doc("event_slugs/public-event"), { event_id: "event-1" });
  batch.set(adminDb.doc("event_slugs/unlisted-event"), {
    event_id: "unlisted-event",
  });
  batch.set(adminDb.doc("event_slugs/private-event"), {
    event_id: "private-event",
  });
  batch.set(adminDb.doc("event_slugs/draft-event"), {
    event_id: "unpublished-event",
  });
  batch.set(adminDb.doc("series/series-1"), { name: "Public Series" });
  batch.set(adminDb.doc("community_pages/ch-zurich"), { title: "Zurich" });
  batch.set(adminDb.doc("community_pages/ch-zurich/private_info/link_cards"), {
    infoCards: [
      {
        id: "zurich-chat",
        title: { en: "Zurich chat" },
        category: "chat",
      },
    ],
  });
  batch.set(adminDb.doc("community_slugs/zurich"), { key: "ch-zurich" });
  batch.set(adminDb.doc("leaderboards/spots_edited"), { entries: [] });
  batch.set(adminDb.doc("organizations/pk-spot"), {
    name: "PK Spot",
    slug: "pk-spot",
    active: true,
  });
  batch.set(adminDb.doc("organizations/pk-spot/members/owner"), {
    role: "reviewer",
    user: { uid: "owner", display_name: "Owner" },
  });
  batch.set(adminDb.doc("organizations/pk-spot/members/org-manager"), {
    role: "owner",
    user: { uid: "org-manager", display_name: "Organization Manager" },
  });
  batch.set(adminDb.doc("organizations/pk-spot/members/org-member"), {
    role: "member",
    user: { uid: "org-member", display_name: "Organization Member" },
  });
  batch.set(adminDb.doc("organizations/wpf"), {
    name: "World's Parkour Family",
    slug: "wpf",
    active: true,
  });
  batch.set(adminDb.doc("spots/verified-spot"), {
    name: { en: "Verified Spot" },
    source: "pkspot",
    stewardship: {
      organization_ids: ["pk-spot", "wpf"],
      organizations: {
        "pk-spot": {
          status: "active",
          organization_id: "pk-spot",
          organization: { id: "pk-spot", name: "PK Spot", slug: "pk-spot" },
          stewarded_by_user_id: "admin",
        },
        wpf: {
          status: "active",
          organization_id: "wpf",
          organization: { id: "wpf", name: "World's Parkour Family", slug: "wpf" },
          stewarded_by_user_id: "admin",
        },
      },
    },
  });
  batch.set(adminDb.doc("organizations/pk-spot/verified_spots/verified-spot"), {
    spot_id: "verified-spot",
    spot_name: { en: "Verified Spot" },
    status: "active",
    organization_id: "pk-spot",
    organization: { id: "pk-spot", name: "PK Spot", slug: "pk-spot" },
    stewarded_by_user_id: "admin",
  });
  batch.set(adminDb.doc("organizations/wpf/verified_spots/verified-spot"), {
    spot_id: "verified-spot",
    spot_name: { en: "Verified Spot" },
    status: "active",
    organization_id: "wpf",
    organization: { id: "wpf", name: "World's Parkour Family", slug: "wpf" },
    stewarded_by_user_id: "admin",
  });
  batch.set(adminDb.doc("spots/managed-spot"), {
    name: { en: "Managed Gym" },
    source: "pkspot",
    management: {
      status: "managed",
      organization_id: "pk-spot",
      organization: { id: "pk-spot", name: "PK Spot", slug: "pk-spot" },
      managed_by_user_id: "admin",
      lock_edits: true,
    },
  });
  batch.set(adminDb.doc("organizations/pk-spot/managed_spots/managed-spot"), {
    spot_id: "managed-spot",
    spot_name: { en: "Managed Gym" },
    status: "managed",
    organization_id: "pk-spot",
    organization: { id: "pk-spot", name: "PK Spot", slug: "pk-spot" },
    managed_by_user_id: "admin",
    lock_edits: true,
  });
  batch.set(adminDb.doc("organizations/pk-spot/used_spots/public-spot"), {
    spot_id: "public-spot",
    spot_name: { en: "Public Spot" },
    status: "active",
    organization_id: "pk-spot",
    organization: { id: "pk-spot", name: "PK Spot", slug: "pk-spot" },
    added_by_user_id: "admin",
  });
  batch.set(adminDb.doc("spots/verified-spot/edits/private-pending"), {
    type: "UPDATE",
    user: { uid: "other" },
    timestamp_raw_ms: 2,
    visibility: "private",
    review_status: "pending",
    review_organization_id: "pk-spot",
    review_organization_ids: ["pk-spot", "wpf"],
  });
  batch.set(adminDb.doc("users/owner"), {
    display_name: "Owner",
    home_spots: ["legacy-home"],
    is_admin: false,
    spot_edits_count: 4,
    socials: {
      other: [
        {
          name: "Manual link",
          url: "https://example.com/manual",
        },
      ],
    },
  });
  batch.set(adminDb.doc("users/other"), {
    display_name: "Other",
    is_admin: false,
  });
  batch.set(adminDb.doc("users/attacker"), {
    display_name: "Attacker",
    is_admin: false,
  });
  batch.set(adminDb.doc("users/admin"), {
    display_name: "Admin",
    is_admin: true,
  });
  batch.set(adminDb.doc("users/adult"), {
    display_name: "Adult",
    is_admin: false,
    account_privacy: "public",
    profile_visibility: "public",
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
  });
  batch.set(adminDb.doc("users/restricted"), {
    display_name: "Restricted",
    is_admin: false,
    age_policy: {
      participation_state: "read_only_age_restricted",
      source: "android_play_age_signals",
      platform: "android",
      signal_updated_at: admin.firestore.Timestamp.now(),
    },
  });
  batch.set(adminDb.doc("users/org-manager"), {
    display_name: "Organization Manager",
    is_admin: false,
  });
  batch.set(adminDb.doc("users/org-member"), {
    display_name: "Organization Member",
    is_admin: false,
  });
  batch.set(adminDb.doc("public_user_profiles/adult"), {
    display_name: "Adult",
    public_profile_enabled: true,
    public_search: true,
    profile_access: "full",
    profile_projection_version: 1,
  });
  batch.set(
    adminDb.doc(
      "users/adult/age_assurance_records/test-verification"
    ),
    {
      verification_id: "test-verification",
      outcome: "verified",
    }
  );
  batch.set(adminDb.doc("age_assurance_challenges/test-challenge"), {
    uid: "adult",
    nonce_hash: "private",
  });
  batch.set(adminDb.doc("users/restricted/private_data/profile"), {
    bookmarks: ["public-spot"],
  });
  batch.set(adminDb.doc("users/owner/private_data/profile"), {
    bookmarks: ["public-spot"],
  });
  batch.set(adminDb.doc("users/owner/check_ins/check-in-1"), {
    spot_id: "public-spot",
  });
  const notificationNow = Date.now();
  batch.set(adminDb.doc("users/owner/notifications/notification-1"), {
    type: "follow_request",
    source_path: "users/owner/follow_requests/other",
    dedupe_key: "notification-1",
    path: "/profile",
    payload: { requester_name: "Other" },
    active: true,
    created_at: admin.firestore.Timestamp.fromMillis(notificationNow),
    created_at_raw_ms: notificationNow,
    available_at: admin.firestore.Timestamp.fromMillis(notificationNow),
    available_at_raw_ms: notificationNow,
    expires_at: admin.firestore.Timestamp.fromMillis(notificationNow + 86_400_000),
    expires_at_raw_ms: notificationNow + 86_400_000,
    updated_at_raw_ms: notificationNow,
  });
  batch.set(adminDb.doc("users/owner/following/other"), {
    created_at_raw_ms: 1,
  });
  batch.set(adminDb.doc("users/owner/followers/other"), {
    created_at_raw_ms: 1,
  });
  batch.set(adminDb.doc("users/other/following/owner"), {
    created_at_raw_ms: 1,
  });
  batch.set(adminDb.doc("users/other/followers/owner"), {
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

async function testPublicReadSurface(
  anon,
  owner,
  other,
  attacker,
  orgMember,
  adminUser
) {
  await assertAllowed("anonymous spot read", () => getDoc(doc(anon.db, "spots/public-spot")));
  await assertAllowed("anonymous edit read", () =>
    getDoc(doc(anon.db, "spots/public-spot/edits/public-edit"))
  );
  await assertDenied("anonymous collection group edits read", () =>
    getDocs(collectionGroup(anon.db, "edits"))
  );
  await assertAllowed("admin collection group edits read", async () => {
    const snapshot = await getDocs(collectionGroup(adminUser.db, "edits"));
    assert.ok(snapshot.docs.some((item) => item.id === "public-edit"));
  });
  await assertAllowed("anonymous spot cluster read", () =>
    getDoc(doc(anon.db, "spot_clusters/z16_1_1"))
  );
  await assertAllowed("anonymous event read", () => getDoc(doc(anon.db, "events/event-1")));
  await assertAllowed("anonymous known unlisted event read", () =>
    getDoc(doc(anon.db, "events/unlisted-event"))
  );
  await assertDenied("anonymous private event read", () =>
    getDoc(doc(anon.db, "events/private-event"))
  );
  await assertAllowed("event owner reads their private event", () =>
    getDoc(doc(owner.db, "events/private-event"))
  );
  await assertAllowed("explicit viewer reads private event", () =>
    getDoc(doc(other.db, "events/private-event"))
  );
  await assertDenied("ungranted user cannot directly read private event", () =>
    getDoc(doc(attacker.db, "events/private-event"))
  );
  await assertAllowed("organization member reads member event", () =>
    getDoc(doc(orgMember.db, "events/member-event"))
  );
  await assertDenied("non-member cannot directly read member event", () =>
    getDoc(doc(attacker.db, "events/member-event"))
  );
  await assertDenied("anonymous draft event read", () =>
    getDoc(doc(anon.db, "events/unpublished-event"))
  );
  await assertAllowed("legacy clients can temporarily enumerate canonical events", () =>
    getDocs(collection(owner.db, "events"))
  );
  await assertAllowed("admins can list canonical events", () =>
    getDocs(collection(adminUser.db, "events"))
  );
  await assertAllowed("anonymous known public slug read", () =>
    getDoc(doc(anon.db, "event_slugs/public-event"))
  );
  await assertAllowed("anonymous known unlisted slug read", () =>
    getDoc(doc(anon.db, "event_slugs/unlisted-event"))
  );
  await assertDenied("anonymous private slug read", () =>
    getDoc(doc(anon.db, "event_slugs/private-event"))
  );
  await assertAllowed("event owner reads private slug", () =>
    getDoc(doc(owner.db, "event_slugs/private-event"))
  );
  await assertAllowed("explicit viewer reads private slug", () =>
    getDoc(doc(other.db, "event_slugs/private-event"))
  );
  await assertDenied("anonymous draft slug read", () =>
    getDoc(doc(anon.db, "event_slugs/draft-event"))
  );
  await assertDenied("regular users cannot enumerate event slugs", () =>
    getDocs(collection(owner.db, "event_slugs"))
  );
  await assertAllowed("anonymous event discovery list", async () => {
    const snapshot = await getDocs(collection(anon.db, "event_discovery"));
    assert.deepEqual(snapshot.docs.map((item) => item.id), ["event-1"]);
  });
  await assertAllowed("anonymous series read", () => getDoc(doc(anon.db, "series/series-1")));
  await assertAllowed("anonymous community page read", () =>
    getDoc(doc(anon.db, "community_pages/ch-zurich"))
  );
  await assertDenied("anonymous community private info read", () =>
    getDoc(doc(anon.db, "community_pages/ch-zurich/private_info/link_cards"))
  );
  await assertAllowed("authenticated community private info read", () =>
    getDoc(doc(owner.db, "community_pages/ch-zurich/private_info/link_cards"))
  );
  await assertAllowed("admin community private info read", () =>
    getDoc(doc(adminUser.db, "community_pages/ch-zurich/private_info/link_cards"))
  );
  await assertAllowed("anonymous leaderboard read", () =>
    getDoc(doc(anon.db, "leaderboards/spots_edited"))
  );
  await assertAllowed("anonymous organization collection read", async () => {
    const snapshot = await getDocs(collection(anon.db, "organizations"));
    assert.ok(snapshot.docs.some((item) => item.id === "pk-spot"));
  });
  await assertAllowed("anonymous organization document read", () =>
    getDoc(doc(anon.db, "organizations/pk-spot"))
  );
  await assertAllowed("anonymous organization verified spots read", () =>
    getDoc(doc(anon.db, "organizations/pk-spot/verified_spots/verified-spot"))
  );
}

async function testSpotWriteGuards(anon, owner, other, adminUser) {
  await assertDenied("anonymous spot placeholder create", () =>
    setDoc(doc(anon.db, "spots/anon-created"), {})
  );
  await assertAllowed("authenticated empty spot placeholder create", () =>
    setDoc(doc(owner.db, "spots/owner-placeholder"), {})
  );
  await assertAllowed("authenticated generated spot placeholder create", () =>
    addDoc(collection(owner.db, "spots"), {})
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
  await assertDenied("review text create", () =>
    setDoc(doc(owner.db, "spots/public-spot/reviews/review-with-text"), {
      rating: 5,
      user: { uid: "owner" },
      comment: { text: "Public prose", locale: "en" },
    })
  );

  await assertAllowed("owner spot edit create", () =>
    setDoc(doc(owner.db, "spots/public-spot/edits/owner-edit"), {
      type: "UPDATE",
      user: { uid: "owner" },
      data: { name: { en: "Allowed via function path" } },
    })
  );
  await assertDenied("stewarded spot public edit create", () =>
    setDoc(doc(owner.db, "spots/verified-spot/edits/public-forbidden"), {
      type: "UPDATE",
      user: { uid: "owner" },
      visibility: "public",
      data: { name: { en: "Should be private" } },
    })
  );
  await assertAllowed("stewarded spot private edit create", () =>
    setDoc(doc(owner.db, "spots/verified-spot/edits/private-allowed"), {
      type: "UPDATE",
      user: { uid: "owner" },
      visibility: "private",
      data: { name: { en: "Review me" } },
    })
  );
  await assertDenied("managed spot public edit create", () =>
    setDoc(doc(owner.db, "spots/managed-spot/edits/public-forbidden"), {
      type: "UPDATE",
      user: { uid: "owner" },
      visibility: "public",
      data: { name: { en: "Should be private" } },
    })
  );
  await assertAllowed("managed spot private edit create", () =>
    setDoc(doc(owner.db, "spots/managed-spot/edits/private-allowed"), {
      type: "UPDATE",
      user: { uid: "owner" },
      visibility: "private",
      data: { name: { en: "Review me" } },
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

  await assertAllowed("owner production spot create flow", async () => {
    await setDoc(doc(owner.db, "spots/owner-production-create"), {});
    await addDoc(collection(owner.db, "spots/owner-production-create/edits"), {
      type: "CREATE",
      timestamp_raw_ms: Date.now(),
      user: { uid: "owner", display_name: "Owner" },
      data: {
        name: { en: "Production Create Shape" },
        location_raw: { lat: 47.3769, lng: 8.5417 },
        media: [],
        type: "outdoor",
        access: "public",
        amenities: { covered: false, lit: true },
      },
    });
  });
  await assertDenied("production spot create edit impersonation", async () => {
    await setDoc(doc(other.db, "spots/other-production-create"), {});
    await addDoc(collection(other.db, "spots/other-production-create/edits"), {
      type: "CREATE",
      timestamp_raw_ms: Date.now(),
      user: { uid: "owner", display_name: "Owner" },
      data: {
        name: { en: "Forged Create Shape" },
        location_raw: { lat: 47.3769, lng: 8.5417 },
      },
    });
  });

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

async function testOrganizationGuards(anon, owner, other, adminUser) {
  await assertDenied("anonymous organization membership read", () =>
    getDoc(doc(anon.db, "organizations/pk-spot/members/owner"))
  );
  await assertAllowed("reviewer reads own organization membership", () =>
    getDoc(doc(owner.db, "organizations/pk-spot/members/owner"))
  );
  await assertDenied("unrelated user reads organization membership", () =>
    getDoc(doc(other.db, "organizations/pk-spot/members/owner"))
  );
  await assertAllowed("organization member lists its organization roster", async () => {
    const snapshot = await getDocs(
      collection(owner.db, "organizations/pk-spot/members")
    );
    assert.ok(snapshot.docs.some((item) => item.id === "owner"));
  });
  await assertAllowed("admin reads organization membership", () =>
    getDoc(doc(adminUser.db, "organizations/pk-spot/members/owner"))
  );
  await assertDenied("regular user creates organization", () =>
    setDoc(doc(owner.db, "organizations/forged-org"), {
      name: "Forged",
      slug: "forged",
      active: true,
    })
  );
  await assertAllowed("admin creates organization", () =>
    setDoc(doc(adminUser.db, "organizations/admin-created-org"), {
      name: "Admin Created",
      slug: "admin-created",
      active: true,
    })
  );
  await assertDenied("regular user creates organization member", () =>
    setDoc(doc(owner.db, "organizations/pk-spot/members/other"), {
      role: "owner",
      user: { uid: "other" },
    })
  );
  await assertAllowed("admin creates organization member", () =>
    setDoc(doc(adminUser.db, "organizations/pk-spot/members/admin-added"), {
      role: "reviewer",
      user: { uid: "admin-added" },
    })
  );
  await assertDenied("admin cannot directly write organization verified spots index", () =>
    setDoc(doc(adminUser.db, "organizations/pk-spot/verified_spots/manual"), {
      spot_id: "manual",
    })
  );
  await assertAllowed("anonymous organization managed spots read", () =>
    getDoc(doc(anon.db, "organizations/pk-spot/managed_spots/managed-spot"))
  );
  await assertDenied("admin cannot directly write organization managed spots index", () =>
    setDoc(doc(adminUser.db, "organizations/pk-spot/managed_spots/manual"), {
      spot_id: "manual",
    })
  );
  await assertAllowed("anonymous organization used spots read", () =>
    getDoc(doc(anon.db, "organizations/pk-spot/used_spots/public-spot"))
  );
  await assertDenied("admin cannot directly write organization used spots index", () =>
    setDoc(doc(adminUser.db, "organizations/pk-spot/used_spots/manual"), {
      spot_id: "manual",
    })
  );
}

async function testPrivateOrganizationReviewEdits(anon, owner, other, adminUser) {
  await assertDenied("anonymous cannot read private org review edit", () =>
    getDoc(doc(anon.db, "spots/verified-spot/edits/private-pending"))
  );
  await assertAllowed("submitter can read own private org review edit", () =>
    getDoc(doc(other.db, "spots/verified-spot/edits/private-pending"))
  );
  await assertAllowed("organization reviewer can read private org review edit", () =>
    getDoc(doc(owner.db, "spots/verified-spot/edits/private-pending"))
  );
  await assertAllowed("admin can read private org review edit", () =>
    getDoc(doc(adminUser.db, "spots/verified-spot/edits/private-pending"))
  );
}

async function testUserPrivacyAndPrivilegeEscalation(anon, owner, other, fresh, attacker) {
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
  await assertDenied("owner cannot change legacy Home Spots", () =>
    updateDoc(doc(owner.db, "users/owner"), {
      home_spots: ["new-home"],
    })
  );
  await assertAllowed("owner updates allowed social handles", () =>
    updateDoc(doc(owner.db, "users/owner"), {
      "socials.instagram_handle": "owner",
      "socials.youtube_handle": "@owner",
      "socials.tiktok_handle": "owner",
      "socials.discord_url": "https://discord.gg/example",
    })
  );
  await assertAllowed("owner updates profile access scaffold fields", () =>
    updateDoc(doc(owner.db, "users/owner"), {
      account_privacy: "private",
      profile_visibility: "mutuals",
    })
  );
  await assertDenied("owner cannot write unknown profile access state", () =>
    updateDoc(doc(owner.db, "users/owner"), {
      account_privacy: "friends-only",
    })
  );
  await assertDenied("private account cannot use public profile visibility", () =>
    updateDoc(doc(owner.db, "users/owner"), {
      profile_visibility: "public",
    })
  );
  await assertDenied("owner cannot change manual custom profile links", () =>
    updateDoc(doc(owner.db, "users/owner"), {
      "socials.other": [
        {
          name: "Injected",
          url: "https://attacker.example",
        },
      ],
    })
  );
  await assertDenied("new profile cannot include custom profile links", () =>
    setDoc(doc(fresh.db, "users/fresh"), {
      display_name: "Fresh",
      socials: {
        other: [
          {
            name: "Injected",
            url: "https://attacker.example",
          },
        ],
      },
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
  await assertAllowed("owner writes private temperature preference", () =>
    setDoc(
      doc(owner.db, "users/owner/private_data/main"),
      { settings: { temperature_unit: "fahrenheit" } },
      { merge: true }
    )
  );
  await assertDenied("other user writes owner temperature preference", () =>
    setDoc(
      doc(other.db, "users/owner/private_data/main"),
      { settings: { temperature_unit: "celsius" } },
      { merge: true }
    )
  );
  await assertAllowed("owner removes private temperature test data", () =>
    deleteDoc(doc(owner.db, "users/owner/private_data/main"))
  );
  await assertAllowed("owner reads own check-ins", () =>
    getDocs(collection(owner.db, "users/owner/check_ins"))
  );
  await assertDenied("other user reads owner check-ins", () =>
    getDocs(collection(other.db, "users/owner/check_ins"))
  );
  await assertAllowed("owner writes own community follow", () =>
    setDoc(doc(owner.db, "users/owner/community_follows/locality:ch:zh:zurich"), {
      community_key: "locality:ch:zh:zurich",
    })
  );
  await assertAllowed("owner reads own community follows", () =>
    getDocs(collection(owner.db, "users/owner/community_follows"))
  );
  await assertDenied("other user reads owner community follows", () =>
    getDocs(collection(other.db, "users/owner/community_follows"))
  );
  await assertAllowed("owner writes own session record", () =>
    setDoc(doc(owner.db, "users/owner/session_records/session-1"), {
      owner_id: "owner",
    })
  );
  await assertAllowed("owner reads own session records", () =>
    getDocs(collection(owner.db, "users/owner/session_records"))
  );
  await assertDenied("other user reads owner session records", () =>
    getDocs(collection(other.db, "users/owner/session_records"))
  );
  await assertDenied("owner cannot forge a session record owner", () =>
    setDoc(doc(owner.db, "users/owner/session_records/forged"), {
      owner_id: "other",
    })
  );
  await assertAllowed("owner reads own following", () =>
    getDocs(collection(owner.db, "users/owner/following"))
  );
  await assertDenied("other user reads owner following", () =>
    getDocs(collection(other.db, "users/owner/following"))
  );
  await assertAllowed("other user writes public following edge for themself", () =>
    setDoc(doc(other.db, "users/other/following/admin"), {
      created_at_raw_ms: 2,
    })
  );
  await assertAllowed("other user writes public follower edge for themself", () =>
    setDoc(doc(other.db, "users/admin/followers/other"), {
      created_at_raw_ms: 2,
    })
  );
  await assertDenied("other user cannot directly follow private account", () =>
    setDoc(doc(other.db, "users/other/following/owner"), {
      display_name: "Owner Updated",
      start_following: Timestamp.now(),
      start_following_raw_ms: Date.now(),
    })
  );
  await assertDenied("other user cannot directly write private account follower edge", () =>
    setDoc(doc(other.db, "users/owner/followers/other"), {
      display_name: "Other",
      start_following: Timestamp.now(),
      start_following_raw_ms: Date.now(),
    })
  );
  await assertAllowed("other user creates follow request for private account", () =>
    setDoc(doc(other.db, "users/owner/follow_requests/other"), {
      display_name: "Other",
      requested_at: Timestamp.now(),
      requested_at_raw_ms: Date.now(),
    })
  );
  await assertDenied("anonymous cannot create follow request", () =>
    setDoc(doc(anon.db, "users/owner/follow_requests/anonymous"), {
      display_name: "Anonymous",
      requested_at: Timestamp.now(),
      requested_at_raw_ms: Date.now(),
    })
  );
  await assertDenied("attacker cannot create follow request for another requester id", () =>
    setDoc(doc(attacker.db, "users/owner/follow_requests/other"), {
      display_name: "Other",
      requested_at: Timestamp.now(),
      requested_at_raw_ms: Date.now(),
    })
  );
  await assertDenied("user cannot request to follow themself", () =>
    setDoc(doc(owner.db, "users/owner/follow_requests/owner"), {
      display_name: "Owner",
      requested_at: Timestamp.now(),
      requested_at_raw_ms: Date.now(),
    })
  );
  await assertDenied("follow request cannot include extra fields", () =>
    setDoc(doc(attacker.db, "users/owner/follow_requests/attacker"), {
      display_name: "Attacker",
      role: "approved",
      requested_at: Timestamp.now(),
      requested_at_raw_ms: Date.now(),
    })
  );
  await assertDenied("follow request cannot include oversized profile picture", () =>
    setDoc(doc(attacker.db, "users/owner/follow_requests/attacker"), {
      display_name: "Attacker",
      profile_picture: "x".repeat(501),
      requested_at: Timestamp.now(),
      requested_at_raw_ms: Date.now(),
    })
  );
  await assertAllowed("owner reads follow requests", () =>
    getDocs(collection(owner.db, "users/owner/follow_requests"))
  );
  await assertAllowed("requester reads own follow request", () =>
    getDoc(doc(other.db, "users/owner/follow_requests/other"))
  );
  await assertDenied("third party cannot read someone else's follow request", () =>
    getDoc(doc(attacker.db, "users/owner/follow_requests/other"))
  );
  await assertDenied("anonymous cannot read follow request", () =>
    getDoc(doc(anon.db, "users/owner/follow_requests/other"))
  );
  await assertDenied("other user cannot request to follow public account", () =>
    setDoc(doc(other.db, "users/admin/follow_requests/other"), {
      display_name: "Other",
      requested_at: Timestamp.now(),
      requested_at_raw_ms: Date.now(),
    })
  );
  await assertDenied("requester cannot approve their own private follow request", () =>
    setDoc(doc(other.db, "users/other/following/owner"), {
      display_name: "Owner Updated",
      start_following: Timestamp.now(),
      start_following_raw_ms: Date.now(),
    })
  );
  await assertDenied("profile owner cannot approve requester with forged target display name", () =>
    setDoc(doc(owner.db, "users/other/following/owner"), {
      display_name: "Forged Owner",
      start_following: Timestamp.now(),
      start_following_raw_ms: Date.now(),
    })
  );
  await assertDenied("profile owner cannot approve requester with forged requester display name", () =>
    setDoc(doc(owner.db, "users/owner/followers/other"), {
      display_name: "Forged Requester",
      start_following: Timestamp.now(),
      start_following_raw_ms: Date.now(),
    })
  );
  await assertDenied("profile owner cannot approve user without a follow request", () =>
    setDoc(doc(owner.db, "users/attacker/following/owner"), {
      display_name: "Owner Updated",
      start_following: Timestamp.now(),
      start_following_raw_ms: Date.now(),
    })
  );
  await assertDenied("attacker cannot approve another user's follow request", () =>
    setDoc(doc(attacker.db, "users/other/following/owner"), {
      display_name: "Owner Updated",
      start_following: Timestamp.now(),
      start_following_raw_ms: Date.now(),
    })
  );
  await assertAllowed("owner approves requested following edge", () =>
    setDoc(doc(owner.db, "users/other/following/owner"), {
      display_name: "Owner Updated",
      start_following: Timestamp.now(),
      start_following_raw_ms: Date.now(),
    })
  );
  await assertAllowed("owner approves requested follower edge", () =>
    setDoc(doc(owner.db, "users/owner/followers/other"), {
      display_name: "Other",
      start_following: Timestamp.now(),
      start_following_raw_ms: Date.now(),
    })
  );
  await assertDenied("third party cannot delete someone else's follow request", () =>
    deleteDoc(doc(attacker.db, "users/owner/follow_requests/other"))
  );
  await assertAllowed("owner deletes approved follow request", () =>
    deleteDoc(doc(owner.db, "users/owner/follow_requests/other"))
  );
  await assertDenied("other user writes owner follower edge for third party", () =>
    setDoc(doc(other.db, "users/owner/followers/attacker-controlled"), {
      created_at_raw_ms: 2,
    })
  );
}

async function testPublicUserProfileGuards(
  anon,
  adult,
  restricted,
  adminUser
) {
  await assertAllowed("anonymous reads public user projection", () =>
    getDoc(doc(anon.db, "public_user_profiles/adult"))
  );
  await assertDenied("profile owner cannot forge public projection", () =>
    setDoc(doc(adult.db, "public_user_profiles/adult"), {
      display_name: "Forged",
    })
  );
  await assertDenied("admin client cannot forge public projection", () =>
    setDoc(doc(adminUser.db, "public_user_profiles/forged"), {
      display_name: "Forged",
    })
  );
  await assertDenied("profile owner cannot read age assurance audit records", () =>
    getDoc(
      doc(
        adult.db,
        "users/adult/age_assurance_records/test-verification"
      )
    )
  );
  await assertAllowed("admin reads age assurance audit records", () =>
    getDoc(
      doc(
        adminUser.db,
        "users/adult/age_assurance_records/test-verification"
      )
    )
  );
  await assertDenied("admin cannot read one-time age assurance challenges", () =>
    getDoc(
      doc(
        adminUser.db,
        "age_assurance_challenges/test-challenge"
      )
    )
  );
  await assertAllowed("verified adult enables public profile and search", () =>
    updateDoc(doc(adult.db, "users/adult"), {
      public_profile_enabled: true,
      public_search: true,
    })
  );
  await assertDenied("user without verified adult eligibility cannot enable public profile", () =>
    updateDoc(doc(restricted.db, "users/restricted"), {
      public_profile_enabled: true,
    })
  );
  await assertDenied("public search requires public profile opt-in", () =>
    updateDoc(doc(adult.db, "users/adult"), {
      public_profile_enabled: false,
      public_search: true,
    })
  );
}

async function testUserProfilePrivacyCutover(
  anon,
  owner,
  other,
  adminUser
) {
  await adminDb.doc("maintenance/user-profile-privacy").set({
    completed: true,
    minimum_supported_client_version: "1.1.4",
  });

  await assertDenied("anonymous raw user profile read after cutover", () =>
    getDoc(doc(anon.db, "users/owner"))
  );
  await assertDenied("other user raw profile read after cutover", () =>
    getDoc(doc(other.db, "users/owner"))
  );
  await assertAllowed("owner raw profile read after cutover", () =>
    getDoc(doc(owner.db, "users/owner"))
  );
  await assertAllowed("admin raw profile read after cutover", () =>
    getDoc(doc(adminUser.db, "users/owner"))
  );
  await assertAllowed("public projection stays readable after cutover", () =>
    getDoc(doc(anon.db, "public_user_profiles/adult"))
  );
}

async function testUserReportGuards(anon, owner, other) {
  await assertAllowed("signed-in user creates profile report", () =>
    addDoc(collection(owner.db, "user_reports"), {
      reportedUser: {
        uid: "other",
        display_name: "Other",
      },
      reason: "spam_or_malicious_links",
      comment: "Suspicious profile link.",
      user: {
        uid: "owner",
        display_name: "Owner",
      },
      createdAt: Timestamp.now(),
      sourcePath: "/en/u/other",
    })
  );
  await assertDenied("anonymous cannot create profile report", () =>
    addDoc(collection(anon.db, "user_reports"), {
      reportedUser: {
        uid: "other",
      },
      reason: "other",
      user: {
        uid: "anonymous",
      },
      createdAt: Timestamp.now(),
    })
  );
  await assertDenied("reporter cannot spoof profile report user", () =>
    addDoc(collection(owner.db, "user_reports"), {
      reportedUser: {
        uid: "other",
      },
      reason: "other",
      user: {
        uid: "other",
      },
      createdAt: Timestamp.now(),
    })
  );
  await assertDenied("profile report reason must be known", () =>
    addDoc(collection(other.db, "user_reports"), {
      reportedUser: {
        uid: "owner",
      },
      reason: "whatever",
      user: {
        uid: "other",
      },
      createdAt: Timestamp.now(),
    })
  );
  await assertDenied("client cannot read profile reports", () =>
    getDocs(collection(owner.db, "user_reports"))
  );
}

async function testAgePolicyParticipationGuards(restricted) {
  await assertAllowed("restricted user reads public profile", () =>
    getDoc(doc(restricted.db, "users/owner"))
  );
  await assertAllowed("restricted user writes private saved spots", () =>
    setDoc(doc(restricted.db, "users/restricted/private_data/profile"), {
      bookmarks: ["public-spot", "verified-spot"],
      visited_spots: ["public-spot"],
    })
  );
  await assertDenied("restricted user edits public profile fields", () =>
    updateDoc(doc(restricted.db, "users/restricted"), {
      biography: "Public profile update should be blocked",
    })
  );
  await assertAllowed("restricted user can update block list", () =>
    updateDoc(doc(restricted.db, "users/restricted"), {
      blocked_users: ["other"],
    })
  );
  await assertDenied("restricted user cannot create spot placeholder", () =>
    setDoc(doc(restricted.db, "spots/restricted-new-spot"), {})
  );
  await assertDenied("restricted user cannot create public spot edit", () =>
    addDoc(collection(restricted.db, "spots/public-spot/edits"), {
      type: "UPDATE",
      user: { uid: "restricted" },
      data: { description: { en: "blocked" } },
    })
  );
  await assertDenied("restricted user cannot create spot review", () =>
    setDoc(doc(restricted.db, "spots/public-spot/reviews/restricted"), {
      rating: 5,
      user: { uid: "restricted" },
    })
  );
  await assertDenied("restricted user cannot follow another user", () =>
    setDoc(doc(restricted.db, "users/restricted/following/owner"), {
      created_at_raw_ms: 3,
    })
  );
  await assertDenied("restricted user cannot create public post", () =>
    setDoc(doc(restricted.db, "posts/restricted-post"), {
      user: { uid: "restricted" },
      text: "blocked",
    })
  );
  await assertDenied("restricted user cannot RSVP to event", () =>
    setDoc(doc(restricted.db, "events/event-1/rsvps/restricted"), {
      user_id: "restricted",
      event_id: "event-1",
      rsvp: "going",
      time_updated: Timestamp.now(),
    })
  );
}

async function testReadOnlyBackendCollections(owner, adminUser) {
  for (const [label, path] of [
    ["spot cluster", "spot_clusters/z16_1_2"],
    ["event", "events/client-event"],
    ["event slug", "event_slugs/client-event"],
    ["event discovery", "event_discovery/client-event"],
    ["series", "series/client-series"],
    ["community page", "community_pages/client-community"],
    [
      "community private info",
      "community_pages/client-community/private_info/link_cards",
    ],
    ["community slug", "community_slugs/client-community"],
    ["leaderboard", "leaderboards/client-board"],
  ]) {
    await assertDenied(`client write to ${label}`, () =>
      setDoc(doc(owner.db, path), { attacker: true })
    );
  }

  await assertDenied("admin cannot bypass community knowledge edits", () =>
    updateDoc(doc(adminUser.db, "community_pages/ch-zurich"), {
      infoCards: [{ id: "bypass", title: { en: "Bypass" } }],
    })
  );
  await assertDenied("admin cannot bypass private community knowledge edits", () =>
    updateDoc(
      doc(adminUser.db, "community_pages/ch-zurich/private_info/link_cards"),
      { infoCards: [{ id: "bypass", title: { en: "Bypass" } }] }
    )
  );
  await assertAllowed("admin can still request a community merge", () =>
    updateDoc(doc(adminUser.db, "community_pages/ch-zurich"), {
      merge_into: {
        target_community_key: "ch-bern",
        info_cards: "skip",
        status: "pending",
      },
    })
  );
}

async function testCommunityEditGuards(
  anon,
  owner,
  other,
  restricted,
  adminUser
) {
  const communityKey = "ch-zurich";
  const suggestionRef = await assertAllowed("owner community knowledge edit create", () =>
    addDoc(collection(owner.db, `community_pages/${communityKey}/edits`), {
      target_type: "community",
      target_id: communityKey,
      schema_version: 1,
      type: "UPDATE",
      edit_kind: "knowledge",
      operation: "UPSERT_KNOWLEDGE_CARD",
      data: {
        card: {
          id: "zurich-chat",
          title: { en: "Zurich chat" },
          category: "chat",
        },
      },
      status: "pending",
      approved: false,
      visibility: "private",
      review_policy: "admin",
      user: { uid: "owner", display_name: "Owner" },
      timestamp: Timestamp.now(),
      timestamp_raw_ms: Date.now(),
      community_display_name: "Zurich",
      community_path: "/map/communities/zurich",
    })
  );

  await assertDenied("anonymous cannot read pending community edits", () =>
    getDoc(doc(anon.db, suggestionRef.path))
  );
  await assertAllowed("submitter reads own pending community edit", () =>
    getDoc(doc(owner.db, suggestionRef.path))
  );
  await assertDenied("other user cannot read pending community edits", () =>
    getDoc(doc(other.db, suggestionRef.path))
  );
  await assertAllowed("admin reads pending community edits", () =>
    getDoc(doc(adminUser.db, suggestionRef.path))
  );
  await assertDenied("clients cannot update community edit review state", () =>
    updateDoc(doc(adminUser.db, suggestionRef.path), {
      status: "approved",
      reviewed_by: { uid: "admin", display_name: "Admin" },
      reviewed_at: Timestamp.now(),
    })
  );
  await assertDenied("clients cannot delete community edit history", () =>
    deleteDoc(doc(adminUser.db, suggestionRef.path))
  );
  await assertDenied("user cannot create approved community edit", () =>
    addDoc(collection(owner.db, `community_pages/${communityKey}/edits`), {
      target_type: "community",
      target_id: communityKey,
      schema_version: 1,
      type: "UPDATE",
      edit_kind: "knowledge",
      operation: "UPSERT_KNOWLEDGE_CARD",
      data: {
        card: {
          id: "bad-status",
          title: { en: "Bad status" },
        },
      },
      status: "approved",
      approved: true,
      visibility: "public",
      review_policy: "admin",
      user: { uid: "owner" },
      timestamp: Timestamp.now(),
      timestamp_raw_ms: Date.now(),
    })
  );
  await assertDenied("community edit user spoofing", () =>
    addDoc(collection(other.db, `community_pages/${communityKey}/edits`), {
      target_type: "community",
      target_id: communityKey,
      schema_version: 1,
      type: "UPDATE",
      edit_kind: "knowledge",
      operation: "UPSERT_KNOWLEDGE_CARD",
      data: {
        card: {
          id: "spoof",
          title: { en: "Spoof" },
        },
      },
      status: "pending",
      approved: false,
      visibility: "private",
      review_policy: "admin",
      user: { uid: "owner" },
      timestamp: Timestamp.now(),
      timestamp_raw_ms: Date.now(),
    })
  );
  await assertDenied("restricted user cannot create community edit", () =>
    addDoc(collection(restricted.db, `community_pages/${communityKey}/edits`), {
      target_type: "community",
      target_id: communityKey,
      schema_version: 1,
      type: "UPDATE",
      edit_kind: "knowledge",
      operation: "UPSERT_KNOWLEDGE_CARD",
      data: {
        card: {
          id: "restricted",
          title: { en: "Restricted" },
        },
      },
      status: "pending",
      approved: false,
      visibility: "private",
      review_policy: "admin",
      user: { uid: "restricted" },
      timestamp: Timestamp.now(),
      timestamp_raw_ms: Date.now(),
    })
  );

  await assertAllowed("legacy suggestion writes remain compatible", () =>
    addDoc(collection(owner.db, "community_card_suggestions"), {
      community_key: communityKey,
      status: "pending",
      created_by: { uid: "owner" },
      created_at: Timestamp.now(),
      card: {
        id: "legacy",
        title: { en: "Legacy" },
      },
    })
  );
}

async function testContactMessageGuards(anon, owner, other) {
  const anonymousMessageRef = await assertAllowed("anonymous contact message create", () =>
    addDoc(collection(anon.db, "contact_messages"), {
      message: "I have a spot map to share.",
      contact_info: "hello@example.com",
      topic: "spot-import",
      analytics: {
        posthog_distinct_id: "ph-test-distinct",
        posthog_session_id: "ph-test-session",
      },
      locale: "en",
      source_path: "/contact?topic=spot-import",
      user_agent: "rules-test",
      createdAt: Timestamp.now(),
    })
  );

  await assertDenied("anonymous contact message read", () =>
    getDoc(anonymousMessageRef)
  );
  await assertDenied("anonymous contact message update", () =>
    updateDoc(anonymousMessageRef, {
      message: "changed",
    })
  );
  await assertDenied("anonymous contact message delete", () =>
    deleteDoc(anonymousMessageRef)
  );

  await assertAllowed("authenticated contact message create", () =>
    addDoc(collection(owner.db, "contact_messages"), {
      message: "I want to help test.",
      contact_info: "owner@example.com",
      topic: "crew",
      auth_email: "owner@example.com",
      user: {
        uid: "owner",
        email: "owner@example.com",
        display_name: "Owner",
      },
      createdAt: Timestamp.now(),
    })
  );

  await assertDenied("contact message user spoofing", () =>
    addDoc(collection(other.db, "contact_messages"), {
      message: "I am someone else.",
      contact_info: "other@example.com",
      user: {
        uid: "owner",
      },
      createdAt: Timestamp.now(),
    })
  );

  await assertDenied("contact message oversized analytics", () =>
    addDoc(collection(anon.db, "contact_messages"), {
      message: "hello",
      contact_info: "hello@example.com",
      analytics: {
        posthog_distinct_id: "x".repeat(201),
      },
      createdAt: Timestamp.now(),
    })
  );

  await assertDenied("contact message missing contact info", () =>
    addDoc(collection(anon.db, "contact_messages"), {
      message: "hello",
      createdAt: Timestamp.now(),
    })
  );

  await assertDenied("contact message oversized body", () =>
    addDoc(collection(anon.db, "contact_messages"), {
      message: "x".repeat(4001),
      contact_info: "hello@example.com",
      createdAt: Timestamp.now(),
    })
  );
}

async function testEventWriteGuards(owner, other, orgManager, adminUser) {
  await assertDenied("regular user cannot update legacy ownerless event", () =>
    updateDoc(doc(owner.db, "events/event-1"), {
      name: "Unauthorized legacy event edit",
    })
  );
  await assertAllowed("admin can update legacy ownerless event", () =>
    updateDoc(doc(adminUser.db, "events/event-1"), {
      venue_string: "Admin-updated legacy venue",
    })
  );

  await assertAllowed("user creates a globally public event they own", () =>
    setDoc(doc(owner.db, "events/owner-event"), {
      name: "Owner Event",
      owner: { type: "user", user_id: "owner" },
      created_by: { uid: "owner", username: "Owner" },
      visibility: "public",
      discoverability: { audience: "global" },
      priority: "normal",
    })
  );
  await assertAllowed("owner edits their event", () =>
    updateDoc(doc(owner.db, "events/owner-event"), {
      venue_string: "Owner-updated venue",
    })
  );
  await assertDenied("owner cannot write a timestamp-shaped audit map", () =>
    updateDoc(doc(owner.db, "events/owner-event"), {
      time_updated: { seconds: 1_785_000_000, nanoseconds: 0 },
    })
  );
  await assertAllowed("owner can write a real event audit timestamp", () =>
    updateDoc(doc(owner.db, "events/owner-event"), {
      time_updated: Timestamp.now(),
    })
  );
  await assertDenied("owner cannot create an event with map audit timestamps", () =>
    setDoc(doc(owner.db, "events/owner-event-map-timestamp"), {
      name: "Owner Event With Map Timestamp",
      owner: { type: "user", user_id: "owner" },
      created_by: { uid: "owner" },
      visibility: "public",
      discoverability: { audience: "global" },
      time_updated: { seconds: 1_785_000_000, nanoseconds: 0 },
    })
  );
  await assertDenied("unrelated user cannot edit an owned event", () =>
    updateDoc(doc(other.db, "events/owner-event"), {
      venue_string: "Forged venue",
    })
  );
  await assertDenied("owner cannot edit platform priority", () =>
    updateDoc(doc(owner.db, "events/owner-event"), {
      priority: "featured",
    })
  );
  await assertDenied("owner cannot transfer ownership", () =>
    updateDoc(doc(owner.db, "events/owner-event"), {
      owner: { type: "user", user_id: "other" },
    })
  );
  await assertDenied("private creation remains disabled during compatibility", () =>
    setDoc(doc(owner.db, "events/owner-private-event"), {
      name: "Owner Private Event",
      owner: { type: "user", user_id: "owner" },
      created_by: { uid: "owner" },
      visibility: "private",
      discoverability: { audience: "none" },
      viewer_policy: { audience: "invited" },
    })
  );
  await assertDenied("unlisted creation remains disabled during compatibility", () =>
    setDoc(doc(owner.db, "events/owner-unlisted-event"), {
      name: "Owner Unlisted Event",
      owner: { type: "user", user_id: "owner" },
      created_by: { uid: "owner" },
      visibility: "unlisted",
      discoverability: { audience: "none" },
    })
  );
  await assertAllowed("owner grants collaborator access", () =>
    setDoc(doc(owner.db, "events/owner-event/access/other"), {
      user_id: "other",
      role: "collaborator",
      granted_by: "owner",
      time_created: Timestamp.now(),
      time_updated: Timestamp.now(),
    })
  );
  await assertAllowed("collaborator edits event content", () =>
    updateDoc(doc(other.db, "events/owner-event"), {
      venue_string: "Collaborator-updated venue",
    })
  );
  await assertDenied("collaborator cannot grant event access", () =>
    setDoc(doc(other.db, "events/owner-event/access/attacker"), {
      user_id: "attacker",
      role: "viewer",
      granted_by: "other",
      time_created: Timestamp.now(),
      time_updated: Timestamp.now(),
    })
  );
  await assertAllowed("organization manager creates organization event", () =>
    setDoc(doc(orgManager.db, "events/org-event"), {
      name: "Organization Event",
      owner: { type: "organization", organization_id: "pk-spot" },
      created_by: { uid: "org-manager" },
      visibility: "public",
      discoverability: { audience: "global" },
    })
  );
  await assertAllowed("organization manager edits organization event", () =>
    updateDoc(doc(orgManager.db, "events/org-event"), {
      venue_string: "Managed venue",
    })
  );
  await assertDenied("organization reviewer cannot edit organization event", () =>
    updateDoc(doc(owner.db, "events/org-event"), {
      venue_string: "Reviewer venue",
    })
  );
  await assertAllowed("admin creates event with editable fields", () =>
    setDoc(doc(adminUser.db, "events/admin-event"), {
      name: "Admin Event",
      owner: { type: "user", user_id: "admin" },
      created_by: { uid: "admin", username: "Admin" },
      location_raw: { lat: 47.3769, lng: 8.5417 },
      organizer: {
        type: "organization",
        organization: {
          id: "pk-spot",
          name: "PK Spot",
          slug: "pk-spot",
        },
      },
    })
  );
  await assertDenied("admin cannot create an ownerless event", () =>
    setDoc(doc(adminUser.db, "events/admin-ownerless-event"), {
      name: "Ownerless Event",
      created_by: { uid: "admin" },
    })
  );
  await assertDenied("admin cannot create event with computed bounds center", () =>
    setDoc(doc(adminUser.db, "events/admin-computed-create"), {
      name: "Admin Computed Create",
      owner: { type: "user", user_id: "admin" },
      created_by: { uid: "admin" },
      bounds_center: [47.3769, 8.5417],
    })
  );
  await assertDenied("admin cannot forge event creator audit data", () =>
    setDoc(doc(adminUser.db, "events/admin-forged-creator"), {
      name: "Forged creator",
      owner: { type: "user", user_id: "admin" },
      created_by: { uid: "someone-else" },
    })
  );
  await assertDenied("admin cannot change event creator audit data", () =>
    updateDoc(doc(adminUser.db, "events/admin-event"), {
      created_by: { uid: "someone-else" },
    })
  );
  await assertAllowed("admin can write event raw location fallback", () =>
    updateDoc(doc(adminUser.db, "events/admin-event"), {
      location_raw: { lat: 47.37, lng: 8.55 },
    })
  );
  await assertDenied("admin cannot write event canonical location", () =>
    updateDoc(doc(adminUser.db, "events/admin-event"), {
      location: { lat: 47.37, lng: 8.55 },
    })
  );
  await assertDenied("admin cannot update event computed radius", () =>
    updateDoc(doc(adminUser.db, "events/admin-event"), {
      bounds_radius_m: 2500,
    })
  );
  await assertDenied("admin cannot update event RSVP aggregate", () =>
    updateDoc(doc(adminUser.db, "events/admin-event"), {
      rsvp_counts: { going: 99, interested: 99, notgoing: 0, total: 198 },
    })
  );
  await assertAllowed("admin can update event editable fields", () =>
    updateDoc(doc(adminUser.db, "events/admin-event"), {
      location_raw: { lat: 47.37, lng: 8.55 },
    })
  );
}

async function testEventRsvpPrivacy(anon, owner, other, adminUser) {
  await assertDenied("anonymous cannot RSVP to event", () =>
    setDoc(doc(anon.db, "events/event-1/rsvps/anon"), {
      user_id: "anon",
      event_id: "event-1",
      rsvp: "going",
      time_updated: Timestamp.now(),
    })
  );
  await assertAllowed("user writes own event RSVP", () =>
    setDoc(doc(owner.db, "events/event-1/rsvps/owner"), {
      user_id: "owner",
      event_id: "event-1",
      rsvp: "going",
      time_updated: Timestamp.now(),
    })
  );
  await assertDenied("user cannot write another user's event RSVP", () =>
    setDoc(doc(owner.db, "events/event-1/rsvps/other"), {
      user_id: "other",
      event_id: "event-1",
      rsvp: "interested",
      time_updated: Timestamp.now(),
    })
  );
  await assertDenied("user cannot forge event RSVP event id", () =>
    setDoc(doc(owner.db, "events/event-1/rsvps/owner"), {
      user_id: "owner",
      event_id: "other-event",
      rsvp: "going",
      time_updated: Timestamp.now(),
    })
  );
  await assertDenied("user cannot write invalid event RSVP value", () =>
    setDoc(doc(owner.db, "events/event-1/rsvps/owner"), {
      user_id: "owner",
      event_id: "event-1",
      rsvp: "maybe",
      time_updated: Timestamp.now(),
    })
  );
  await assertDenied("anonymous cannot read event RSVP", () =>
    getDoc(doc(anon.db, "events/event-1/rsvps/owner"))
  );
  await assertAllowed("user reads own event RSVP", () =>
    getDoc(doc(owner.db, "events/event-1/rsvps/owner"))
  );
  await assertAllowed("mutual friend reads event RSVP", () =>
    getDoc(doc(other.db, "events/event-1/rsvps/owner"))
  );
  await assertAllowed("admin reads event RSVP", () =>
    getDoc(doc(adminUser.db, "events/event-1/rsvps/owner"))
  );
}

async function testEventLiveUpdateGuards(anon, owner, other, adminUser) {
  const subscriptionPath = "events/event-1/live_update_subscribers/owner";
  await assertDenied("anonymous cannot subscribe to event live updates", () =>
    setDoc(doc(anon.db, "events/event-1/live_update_subscribers/anon"), {
      user_id: "anon",
      active: true,
      subscribed_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    })
  );
  await assertAllowed("user subscribes to own event live updates", () =>
    setDoc(doc(owner.db, subscriptionPath), {
      user_id: "owner",
      active: true,
      subscribed_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    })
  );
  await assertAllowed("user disables own event live updates", () =>
    updateDoc(doc(owner.db, subscriptionPath), {
      active: false,
      updated_at: Timestamp.now(),
    })
  );
  await assertAllowed("user keeps only reminders for their event", () =>
    updateDoc(doc(owner.db, subscriptionPath), {
      event_reminders: true,
      updated_at: Timestamp.now(),
    })
  );
  await assertDenied("event reminder preference must be boolean", () =>
    updateDoc(doc(owner.db, subscriptionPath), {
      event_reminders: "yes",
      updated_at: Timestamp.now(),
    })
  );
  await assertDenied("user cannot subscribe another attendee", () =>
    setDoc(doc(owner.db, "events/event-1/live_update_subscribers/other"), {
      user_id: "other",
      active: true,
      subscribed_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    })
  );
  await assertDenied("user cannot transfer a live update subscription", () =>
    updateDoc(doc(owner.db, subscriptionPath), {
      user_id: "other",
      updated_at: Timestamp.now(),
    })
  );
  await assertDenied("other attendee cannot read a user's subscription", () =>
    getDoc(doc(other.db, subscriptionPath))
  );
  await assertAllowed("public can read published event live updates", () =>
    getDoc(doc(anon.db, "events/event-1/live_updates/update-1"))
  );
  await assertDenied("public cannot read unpublished event live updates", () =>
    getDoc(doc(anon.db, "events/unpublished-event/live_updates/update-1"))
  );
  const forgedUpdate = {
    event_id: "event-1",
    type: "general_update",
    title: "Forged",
    status: "published",
    created_at: Timestamp.now(),
    created_by: "owner",
    published_at: Timestamp.now(),
  };
  await assertDenied("attendee cannot publish a live update directly", () =>
    setDoc(doc(owner.db, "events/event-1/live_updates/forged-owner"), forgedUpdate)
  );
  await assertDenied("admin cannot bypass the trusted live update callable", () =>
    setDoc(doc(adminUser.db, "events/event-1/live_updates/forged-admin"), forgedUpdate)
  );
  await assertDenied("clients cannot read live update cooldown state", () =>
    getDoc(doc(owner.db, "events/event-1/live_update_state/publishing"))
  );
}

async function testPostAndImportGuards(anon, owner, other, adminUser) {
  await assertDenied("legacy feed post creation stays disabled", () =>
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
  await assertDenied("legacy post likes stay disabled", () =>
    setDoc(doc(owner.db, "posts/post-1/likes/other-like"), {
      user: { uid: "owner" },
    })
  );
  await assertAllowed("post owner can delete historical post", () =>
    deleteDoc(doc(owner.db, "posts/post-1"))
  );

  await assertDenied("anonymous import metadata read", () =>
    getDoc(doc(anon.db, "imports/import-owner"))
  );
  await assertAllowed("admin import metadata read", () =>
    getDoc(doc(adminUser.db, "imports/import-owner"))
  );
  await assertDenied("regular user import create", () =>
    setDoc(doc(owner.db, "imports/new-import"), {
      user: { uid: "owner" },
      status: "CREATED",
    })
  );
  await assertAllowed("admin import create", () =>
    setDoc(doc(adminUser.db, "imports/admin-import"), {
      user: { uid: "admin" },
      status: "CREATED",
    })
  );
  await assertDenied("regular user import update", () =>
    updateDoc(doc(owner.db, "imports/import-owner"), {
      status: "COMPLETED",
    })
  );
  await assertAllowed("admin import update", () =>
    updateDoc(doc(adminUser.db, "imports/import-owner"), {
      status: "PROCESSING",
    })
  );
  await assertDenied("import create impersonating owner", () =>
    setDoc(doc(other.db, "imports/forged-import"), {
      user: { uid: "owner" },
      status: "CREATED",
    })
  );
  await assertDenied("owner reads own import chunks", () =>
    getDocs(collection(owner.db, "imports/import-owner/chunks"))
  );
  await assertDenied("other user reads owner import chunks", () =>
    getDocs(collection(other.db, "imports/import-owner/chunks"))
  );
  await assertAllowed("admin reads import chunks", () =>
    getDocs(collection(adminUser.db, "imports/import-owner/chunks"))
  );
  await assertDenied("owner creates own import chunk", () =>
    setDoc(doc(owner.db, "imports/import-owner/chunks/new-chunk"), {
      rows: [],
    })
  );
  await assertAllowed("admin creates import chunk", () =>
    setDoc(doc(adminUser.db, "imports/import-owner/chunks/admin-chunk"), {
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
  await assertDenied("owner challenge write while submissions are closed", () =>
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

async function testReportPrivacy(anon, owner, other, adminUser) {
  const spotReport = {
    spot: { id: "public-spot", name: "Public Spot" },
    reason: "torn down",
    user: { uid: "owner", display_name: "Owner" },
    createdAt: new Date(),
  };
  const spotReportRef = doc(
    owner.db,
    "spots/public-spot/reports/private-report"
  );
  await assertAllowed("owner creates spot report before privacy migration", () =>
    setDoc(spotReportRef, spotReport)
  );
  await assertAllowed("spot report remains readable before warning migration", () =>
    getDoc(doc(other.db, "spots/public-spot/reports/private-report"))
  );
  await adminDb.doc("maintenance/spot-report-privacy").set({
    completed: true,
  });
  await assertDenied("reporter cannot read raw report after migration", () =>
    getDoc(spotReportRef)
  );
  await assertDenied("other user cannot read spot report", () =>
    getDoc(doc(other.db, "spots/public-spot/reports/private-report"))
  );
  await assertDenied("anonymous cannot read spot report", () =>
    getDoc(doc(anon.db, "spots/public-spot/reports/private-report"))
  );
  await assertAllowed("admin reads spot report", () =>
    getDoc(doc(adminUser.db, "spots/public-spot/reports/private-report"))
  );

  const mediaReport = {
    kind: "media",
    media: { type: "image", src: "https://example.com/image.jpg" },
    reason: "unsafe",
    comment: "",
    user: { uid: "owner", display_name: "Owner" },
    createdAt: new Date(),
  };
  await assertAllowed("owner creates root media report", () =>
    setDoc(doc(owner.db, "reports/media-report"), mediaReport)
  );
  await assertAllowed("legacy client includes its authenticated account email", () =>
    setDoc(doc(owner.db, "media_reports/legacy-authenticated-report"), {
      ...mediaReport,
      user: {
        uid: "owner",
        email: "owner@example.com",
      },
    })
  );
  await assertDenied("authenticated reporter cannot spoof report email", () =>
    setDoc(doc(owner.db, "reports/spoofed-email"), {
      ...mediaReport,
      user: {
        uid: "owner",
        email: "victim@example.com",
      },
    })
  );
  await assertAllowed("affected guest can create a serious media report", () =>
    setDoc(doc(anon.db, "reports/anonymous-media-report"), {
      ...mediaReport,
      reason: "person did not consent",
      user: {
        email: "reporter@example.com",
      },
    })
  );
  await assertDenied("guest cannot create a media quality report", () =>
    setDoc(doc(anon.db, "reports/anonymous-quality-report"), {
      ...mediaReport,
      reason: "duplicate",
      user: {
        email: "reporter@example.com",
      },
    })
  );
  await assertDenied("non-admin cannot read root media report", () =>
    getDoc(doc(owner.db, "reports/media-report"))
  );
  await assertAllowed("admin reads root media report", () =>
    getDoc(doc(adminUser.db, "reports/media-report"))
  );
  await assertAllowed("admin collection group includes root and nested reports", async () => {
    const reports = await getDocs(collectionGroup(adminUser.db, "reports"));
    const paths = reports.docs.map((item) => item.ref.path);
    assert.ok(paths.includes("reports/media-report"));
    assert.ok(paths.includes("spots/public-spot/reports/private-report"));
  });
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

async function testNotificationRegistrationGuards(anon, owner, other, adminUser) {
  const registration = {
    token: "valid-fcm-registration-token-for-rules-test",
    platform: "android",
    app_version: "1.2.0",
    locale: "en",
    permission_state: "granted",
    enabled: true,
    created_at_raw_ms: Date.now(),
    last_seen_at_raw_ms: Date.now(),
  };
  const ownerPath = "users/owner/notification_registrations/device-1";

  await assertAllowed("owner creates notification registration", () =>
    setDoc(doc(owner.db, ownerPath), registration)
  );
  await assertAllowed("owner reads notification registration", () =>
    getDoc(doc(owner.db, ownerPath))
  );
  await assertDenied("other user reads notification registration", () =>
    getDoc(doc(other.db, ownerPath))
  );
  await assertDenied("admin reads user notification registration", () =>
    getDoc(doc(adminUser.db, ownerPath))
  );
  await assertDenied("anonymous creates notification registration", () =>
    setDoc(doc(anon.db, "users/owner/notification_registrations/anon"), registration)
  );
  await assertDenied("owner creates malformed notification registration", () =>
    setDoc(doc(owner.db, "users/owner/notification_registrations/bad"), {
      ...registration,
      platform: "desktop",
    })
  );
  await assertDenied("clients read notification intents", () =>
    getDoc(doc(owner.db, "notification_intents/private-intent"))
  );
  await assertDenied("clients create notification intents", () =>
    setDoc(doc(owner.db, "notification_intents/forged-intent"), {
      recipient_uid: "owner",
    })
  );

  const notificationPath = "users/owner/notifications/notification-1";
  await assertAllowed("owner reads in-app notification", () =>
    getDoc(doc(owner.db, notificationPath))
  );
  await assertAllowed("owner lists in-app notifications", () =>
    getDocs(collection(owner.db, "users/owner/notifications"))
  );
  await assertAllowed("owner marks in-app notification read", () =>
    updateDoc(doc(owner.db, notificationPath), { read_at_raw_ms: Date.now() })
  );
  await assertAllowed("owner dismisses in-app notification", () =>
    updateDoc(doc(owner.db, notificationPath), {
      dismissed_at_raw_ms: Date.now(),
    })
  );
  await assertDenied("other user reads in-app notification", () =>
    getDoc(doc(other.db, notificationPath))
  );
  await assertDenied("admin reads user in-app notification", () =>
    getDoc(doc(adminUser.db, notificationPath))
  );
  await assertDenied("anonymous reads in-app notification", () =>
    getDoc(doc(anon.db, notificationPath))
  );
  await assertDenied("owner changes server-owned notification fields", () =>
    updateDoc(doc(owner.db, notificationPath), { active: false })
  );
  await assertDenied("owner creates in-app notification", () =>
    setDoc(doc(owner.db, "users/owner/notifications/forged"), {
      active: true,
      read_at_raw_ms: Date.now(),
    })
  );
  await assertDenied("owner deletes in-app notification", () =>
    deleteDoc(doc(owner.db, notificationPath))
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
  const owner = await createClient("owner", "owner@example.com");
  const other = await createClient("other");
  const attacker = await createClient("attacker");
  const fresh = await createClient("fresh");
  const restricted = await createClient("restricted");
  const adult = await createClient("adult");
  const orgManager = await createClient("org-manager");
  const orgMember = await createClient("org-member");
  const adminUser = await createClient("admin");

  console.log("Running Firestore rules security tests...");
  await testPublicReadSurface(
    anon,
    owner,
    other,
    attacker,
    orgMember,
    adminUser
  );
  await testSpotWriteGuards(anon, owner, other, adminUser);
  await testOrganizationGuards(anon, owner, other, adminUser);
  await testPrivateOrganizationReviewEdits(anon, owner, other, adminUser);
  await testUserPrivacyAndPrivilegeEscalation(anon, owner, other, fresh, attacker);
  await testPublicUserProfileGuards(anon, adult, restricted, adminUser);
  await testUserReportGuards(anon, owner, other);
  await testAgePolicyParticipationGuards(restricted);
  await testReadOnlyBackendCollections(owner, adminUser);
  await testCommunityEditGuards(anon, owner, other, restricted, adminUser);
  await testContactMessageGuards(anon, owner, other);
  await testEventWriteGuards(owner, other, orgManager, adminUser);
  await testEventRsvpPrivacy(anon, owner, other, adminUser);
  await testEventLiveUpdateGuards(anon, owner, other, adminUser);
  await testPostAndImportGuards(anon, owner, other, adminUser);
  await testChallengeVisibility(anon, owner, other);
  await testReportPrivacy(anon, owner, other, adminUser);
  await testQueriesDoNotBypassRules(owner, other);
  await testNotificationRegistrationGuards(anon, owner, other, adminUser);
  await testUserProfilePrivacyCutover(anon, owner, other, adminUser);

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
