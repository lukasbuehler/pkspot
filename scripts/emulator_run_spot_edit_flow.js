const assert = require("node:assert/strict");
const admin = require("firebase-admin");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    "Refusing to run spot edit integration tests without FIRESTORE_EMULATOR_HOST."
  );
}

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-pkspot";

admin.initializeApp({
  projectId: process.env.GCLOUD_PROJECT,
});

const db = admin.firestore();
const { Timestamp } = admin.firestore;

const USER = {
  uid: "integration-user-spot-edits",
  display_name: "Spot Edit Integration Tester",
};

const SECOND_USER = {
  uid: "integration-user-other",
  display_name: "Other Integration Tester",
};

const THIRD_USER = {
  uid: "integration-user-third",
  display_name: "Third Integration Tester",
};

const BASE_TIME_MS = Date.UTC(2026, 0, 15, 12, 0, 0);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function resetEmulatorFirestore() {
  const collections = await db.listCollections();
  await Promise.all(collections.map((collection) => db.recursiveDelete(collection)));
}

async function waitFor(predicate, label, timeoutMs = 30000, intervalMs = 250) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const value = await predicate();
    if (value) {
      return value;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

function assertCoordinate(raw, latitude, longitude, label) {
  assert.equal(typeof raw?.lat, "number", `${label}.lat should be a number`);
  assert.equal(typeof raw?.lng, "number", `${label}.lng should be a number`);
  assert.equal(raw.lat, latitude);
  assert.equal(raw.lng, longitude);
}

function timestampAt(offsetMs) {
  return Timestamp.fromMillis(BASE_TIME_MS + offsetMs);
}

function editPayload({ type, data, offsetMs, user = USER, modificationType }) {
  return {
    type,
    timestamp: timestampAt(offsetMs),
    timestamp_raw_ms: BASE_TIME_MS + offsetMs,
    likes: 0,
    approved: false,
    user,
    data,
    ...(modificationType ? { modification_type: modificationType } : {}),
  };
}

async function createEdit(spotId, editId, payload) {
  await db.collection("spots").doc(spotId).collection("edits").doc(editId).set(payload);
  return waitFor(async () => {
    const snap = await db
      .collection("spots")
      .doc(spotId)
      .collection("edits")
      .doc(editId)
      .get();
    const data = snap.data();
    return data?.approved === true ? data : null;
  }, `edit ${spotId}/${editId} approval`);
}

async function createBlockedEdit(spotId, editId, payload, expectedStatus) {
  await db.collection("spots").doc(spotId).collection("edits").doc(editId).set(payload);
  return waitFor(async () => {
    const snap = await db
      .collection("spots")
      .doc(spotId)
      .collection("edits")
      .doc(editId)
      .get();
    const data = snap.data();
    return data?.approved === false && data?.processing_status === expectedStatus
      ? data
      : null;
  }, `edit ${spotId}/${editId} blocked as ${expectedStatus}`);
}

async function getEdit(spotId, editId) {
  const snap = await db
    .collection("spots")
    .doc(spotId)
    .collection("edits")
    .doc(editId)
    .get();
  assert.equal(snap.exists, true, `Expected edit ${spotId}/${editId} to exist`);
  return snap.data();
}

async function getSpot(spotId) {
  const snap = await db.collection("spots").doc(spotId).get();
  assert.equal(snap.exists, true, `Expected spot ${spotId} to exist`);
  return snap.data();
}

async function testCreateSpotFromPlainLocation() {
  const spotId = "integration-create-plain-location";
  await db.collection("spots").doc(spotId).set({});

  await createEdit(
    spotId,
    "create",
    editPayload({
      type: "CREATE",
      offsetMs: 1000,
      data: {
        name: { en: "Integration Plain Location" },
        description: { en: "Created through a real spot edit trigger." },
        location: { latitude: 47.3769, longitude: 8.5417 },
        address: null,
        media: [],
        type: "urban landscape",
        access: "public",
        amenities: { covered: false, lit: true },
        source: "client-should-not-win",
      },
    })
  );

  const spot = await getSpot(spotId);
  assert.deepEqual(spot.name, { en: "Integration Plain Location" });
  assert.equal(spot.source, "pkspot");
  assert.equal(spot.is_iconic, false);
  assertCoordinate(spot.location_raw, 47.3769, 8.5417, "spot.location_raw");
  assert.ok(spot.location, "Expected function to write a Firestore GeoPoint");
  assert.ok(spot.tile_coordinates?.z16, "Expected tile coordinates for map queries");
}

async function testCreateSpotFromRawOnlyLocationAndBounds() {
  const spotId = "integration-create-raw-only-location";
  await db.collection("spots").doc(spotId).set({});

  await createEdit(
    spotId,
    "create-raw-only",
    editPayload({
      type: "CREATE",
      offsetMs: 1500,
      data: {
        name: { en: "Integration Raw Only Location" },
        location_raw: { lat: 52.52, lng: 13.405 },
        bounds_raw: [
          { lat: 52.519, lng: 13.404 },
          { lat: 52.521, lng: 13.406 },
          { lat: 52.522, lng: 13.407 },
        ],
        address: null,
        media: [],
      },
    })
  );

  const spot = await getSpot(spotId);
  assertCoordinate(spot.location_raw, 52.52, 13.405, "spot.location_raw");
  assert.deepEqual(spot.bounds_raw, [
    { lat: 52.519, lng: 13.404 },
    { lat: 52.521, lng: 13.406 },
    { lat: 52.522, lng: 13.407 },
  ]);
  assert.ok(spot.location, "Expected raw-only create to write location");
  assert.ok(Array.isArray(spot.bounds), "Expected raw-only create to write bounds");
}

async function testLocationAndBoundsMobileShapes() {
  const spotId = "integration-mobile-location-edits";
  await db.collection("spots").doc(spotId).set({
    name: { en: "Mobile Shape Base" },
    location: new admin.firestore.GeoPoint(47.0, 8.0),
    location_raw: { lat: 47.0, lng: 8.0 },
    media: [],
    address: null,
    source: "pkspot",
  });

  await createEdit(
    spotId,
    "update-internal-geopoint-shape",
    editPayload({
      type: "UPDATE",
      offsetMs: 2000,
      data: {
        location: { _latitude: 48.2082, _longitude: 16.3738 },
        bounds: [
          { _latitude: 48.208, _longitude: 16.373 },
          { latitude: 48.209, longitude: 16.374 },
          { lat: 48.21, lng: 16.375 },
        ],
      },
      modificationType: "OVERWRITE",
    })
  );

  let spot = await getSpot(spotId);
  assertCoordinate(spot.location_raw, 48.2082, 16.3738, "spot.location_raw");
  assert.deepEqual(spot.bounds_raw, [
    { lat: 48.208, lng: 16.373 },
    { lat: 48.209, lng: 16.374 },
    { lat: 48.21, lng: 16.375 },
  ]);

  await createEdit(
    spotId,
    "update-raw-only-location",
    editPayload({
      type: "UPDATE",
      offsetMs: 3000,
      data: {
        location_raw: { lat: 46.2044, lng: 6.1432 },
        bounds_raw: [
          { lat: 46.204, lng: 6.143 },
          { lat: 46.205, lng: 6.144 },
          { lat: 46.206, lng: 6.145 },
        ],
      },
      modificationType: "OVERWRITE",
    })
  );

  spot = await getSpot(spotId);
  assertCoordinate(spot.location_raw, 46.2044, 6.1432, "spot.location_raw");
  assert.deepEqual(spot.bounds_raw, [
    { lat: 46.204, lng: 6.143 },
    { lat: 46.205, lng: 6.144 },
    { lat: 46.206, lng: 6.145 },
  ]);
  assert.ok(spot.tile_coordinates?.z16, "Expected raw-only location to update tiles");
}

async function testSourceAndSystemFieldsAreIgnoredOnUpdate() {
  const spotId = "integration-source-protection";
  await db.collection("spots").doc(spotId).set({
    name: { en: "Protected Base" },
    location: new admin.firestore.GeoPoint(47.0, 8.0),
    location_raw: { lat: 47.0, lng: 8.0 },
    media: [],
    address: null,
    source: "pkspot",
    rating: 4.2,
    num_reviews: 8,
    is_iconic: false,
  });

  await createEdit(
    spotId,
    "protected-update",
    editPayload({
      type: "UPDATE",
      offsetMs: 3500,
      data: {
        source: "malicious-import",
        rating: 1,
        num_reviews: 999,
        is_iconic: true,
        name: { en: "Protected Updated" },
      },
      modificationType: "OVERWRITE",
    })
  );

  const spot = await getSpot(spotId);
  assert.deepEqual(spot.name, { en: "Protected Updated" });
  assert.equal(spot.source, "pkspot");
  assert.equal(spot.rating, 4.2);
  assert.equal(spot.num_reviews, 8);
  assert.equal(spot.is_iconic, false);
}

async function testMergedAndDeletedFields() {
  const spotId = "integration-merge-delete-edits";
  await db.collection("spots").doc(spotId).set({
    name: { en: "Merge Base" },
    location: new admin.firestore.GeoPoint(47.0, 8.0),
    location_raw: { lat: 47.0, lng: 8.0 },
    media: [],
    address: null,
    external_references: {
      website_url: "https://old.example",
      google_maps_place_id: "old-place",
    },
    amenities: {
      covered: false,
      lit: true,
      toilets: true,
    },
    source: "pkspot",
  });

  await createEdit(
    spotId,
    "merge-delete",
    editPayload({
      type: "UPDATE",
      offsetMs: 4000,
      data: {
        name: { en: "Merge Updated" },
        description: { en: "Nested fields should merge and delete correctly." },
        external_references: {
          website_url: "https://new.example",
          google_maps_place_id: null,
        },
        amenities: {
          covered: true,
          toilets: null,
        },
      },
      modificationType: "OVERWRITE",
    })
  );

  const spot = await getSpot(spotId);
  assert.deepEqual(spot.name, { en: "Merge Updated" });
  assert.equal(spot.external_references.website_url, "https://new.example");
  assert.equal("google_maps_place_id" in spot.external_references, false);
  assert.equal(spot.amenities.covered, true);
  assert.equal(spot.amenities.lit, true);
  assert.equal("toilets" in spot.amenities, false);
  assert.ok(spot.updated_at, "Expected UPDATE edits to stamp updated_at");
}

async function testMediaAppendAndOverwrite() {
  const spotId = "integration-media-edits";
  await db.collection("spots").doc(spotId).set({
    name: { en: "Media Base" },
    location: new admin.firestore.GeoPoint(47.0, 8.0),
    location_raw: { lat: 47.0, lng: 8.0 },
    media: [
      {
        src: "https://example.test/old.jpg",
        type: "image",
        uid: USER.uid,
        isInStorage: false,
      },
    ],
    address: null,
    source: "pkspot",
  });

  await createEdit(
    spotId,
    "append-media",
    editPayload({
      type: "UPDATE",
      offsetMs: 5000,
      data: {
        media: [
          {
            src: "https://example.test/old.jpg",
            type: "image",
            uid: USER.uid,
            isInStorage: false,
          },
          {
            src: "https://example.test/new.jpg",
            type: "image",
            uid: USER.uid,
            isInStorage: false,
          },
        ],
      },
    })
  );

  let spot = await getSpot(spotId);
  assert.deepEqual(
    spot.media.map((item) => item.src),
    ["https://example.test/old.jpg", "https://example.test/new.jpg"]
  );

  await createEdit(
    spotId,
    "overwrite-media",
    editPayload({
      type: "UPDATE",
      offsetMs: 6000,
      data: {
        media: [
          {
            src: "https://example.test/replacement.jpg",
            type: "image",
            uid: USER.uid,
            isInStorage: false,
          },
        ],
      },
      modificationType: "OVERWRITE",
    })
  );

  spot = await getSpot(spotId);
  assert.deepEqual(
    spot.media.map((item) => item.src),
    ["https://example.test/replacement.jpg"]
  );
}

async function testEmptyMediaAppendDoesNotDeleteExistingMedia() {
  const spotId = "integration-empty-media-append";
  await db.collection("spots").doc(spotId).set({
    name: { en: "Empty Media Append Base" },
    location: new admin.firestore.GeoPoint(47.0, 8.0),
    location_raw: { lat: 47.0, lng: 8.0 },
    media: [
      {
        src: "https://example.test/keep.jpg",
        type: "image",
        uid: USER.uid,
        isInStorage: false,
      },
    ],
    address: null,
    source: "pkspot",
  });

  await createEdit(
    spotId,
    "empty-media-append",
    editPayload({
      type: "UPDATE",
      offsetMs: 6500,
      data: { media: [] },
    })
  );

  const spot = await getSpot(spotId);
  assert.deepEqual(
    spot.media.map((item) => item.src),
    ["https://example.test/keep.jpg"]
  );
}

async function testInvalidLocationEditDoesNotMutateSpot() {
  const spotId = "integration-invalid-location";
  await db.collection("spots").doc(spotId).set({
    name: { en: "Invalid Location Base" },
    location: new admin.firestore.GeoPoint(47.0, 8.0),
    location_raw: { lat: 47.0, lng: 8.0 },
    media: [],
    address: null,
    source: "pkspot",
  });

  await db
    .collection("spots")
    .doc(spotId)
    .collection("edits")
    .doc("invalid-location")
    .set(
      editPayload({
        type: "UPDATE",
        offsetMs: 50,
        data: { location: { latitude: "47.1", longitude: 8.1 } },
      })
    );

  await sleep(1500);

  const edit = await getEdit(spotId, "invalid-location");
  const spot = await getSpot(spotId);
  assert.equal(edit.approved, false);
  assert.equal(edit.processing_status, "ERROR");
  assert.equal(edit.blocked_reason, "Invalid location format");
  assertCoordinate(spot.location_raw, 47.0, 8.0, "spot.location_raw");
}

async function testActivityQueriesUseRawTimestampDeterministically() {
  const otherSpotId = "integration-other-user-activity";
  await db.collection("spots").doc(otherSpotId).set({
    name: { en: "Other User Activity" },
    location: new admin.firestore.GeoPoint(47.0, 8.0),
    location_raw: { lat: 47.0, lng: 8.0 },
    media: [],
    address: null,
    source: "pkspot",
  });

  await createEdit(
    otherSpotId,
    "other-user-edit",
    editPayload({
      type: "UPDATE",
      offsetMs: 7000,
      user: SECOND_USER,
      data: { description: { en: "This edit should not appear in the user query." } },
    })
  );

  const globalSnapshot = await db
    .collectionGroup("edits")
    .orderBy("timestamp_raw_ms", "desc")
    .limit(4)
    .get();
  const globalIds = globalSnapshot.docs.map((doc) => doc.id);

  assert.deepEqual(globalIds.slice(0, 2), ["other-user-edit", "empty-media-append"]);

  const userSnapshot = await db
    .collectionGroup("edits")
    .where("user.uid", "==", USER.uid)
    .orderBy("timestamp_raw_ms", "desc")
    .limit(3)
    .get();
  const userIds = userSnapshot.docs.map((doc) => doc.id);

  assert.deepEqual(userIds, ["empty-media-append", "overwrite-media", "append-media"]);

  const firstPage = await db
    .collectionGroup("edits")
    .where("user.uid", "==", USER.uid)
    .orderBy("timestamp_raw_ms", "desc")
    .limit(2)
    .get();
  const secondPage = await db
    .collectionGroup("edits")
    .where("user.uid", "==", USER.uid)
    .orderBy("timestamp_raw_ms", "desc")
    .startAfter(firstPage.docs[firstPage.docs.length - 1])
    .limit(2)
    .get();

  assert.deepEqual(
    firstPage.docs.map((doc) => doc.id),
    ["empty-media-append", "overwrite-media"]
  );
  assert.deepEqual(
    secondPage.docs.map((doc) => doc.id),
    ["append-media", "merge-delete"]
  );
}

async function testForcedVotingFlowAppliesOnlyAfterEligibleVotes() {
  const spotId = "integration-forced-voting";
  const editId = "forced-vote-update";
  await db.collection("spots").doc(spotId).set({
    name: { en: "Voting Base" },
    location: new admin.firestore.GeoPoint(47.0, 8.0),
    location_raw: { lat: 47.0, lng: 8.0 },
    media: [],
    address: null,
    source: "pkspot",
    edit_policy: { force_voting: true },
  });

  const oldEnoughForAutoApproval = Date.now() - 25 * 60 * 60 * 1000;
  const blockedEdit = await createBlockedEdit(
    spotId,
    editId,
    {
      ...editPayload({
        type: "UPDATE",
        offsetMs: 8000,
        data: {
          name: { en: "Voting Applied" },
          location_raw: { lat: 45.5017, lng: -73.5673 },
        },
        modificationType: "OVERWRITE",
      }),
      timestamp: Timestamp.fromMillis(oldEnoughForAutoApproval),
      timestamp_raw_ms: oldEnoughForAutoApproval,
    },
    "VOTING_FORCED_TEST"
  );

  assert.equal(blockedEdit.vote_summary.total_count, 0);
  let spot = await getSpot(spotId);
  assert.deepEqual(spot.name, { en: "Voting Base" });

  await db
    .collection("spots")
    .doc(spotId)
    .collection("edits")
    .doc(editId)
    .collection("votes")
    .doc(USER.uid)
    .set({
      value: 1,
      vote: "yes",
      user: USER,
      timestamp: timestampAt(8100),
      timestamp_raw_ms: BASE_TIME_MS + 8100,
    });

  await waitFor(async () => {
    const edit = await getEdit(spotId, editId);
    return edit.vote_summary?.total_count === 1 ? edit : null;
  }, "single vote summary");

  spot = await getSpot(spotId);
  assert.deepEqual(spot.name, { en: "Voting Base" });

  await db
    .collection("spots")
    .doc(spotId)
    .collection("edits")
    .doc(editId)
    .collection("votes")
    .doc(THIRD_USER.uid)
    .set({
      value: 1,
      vote: "yes",
      user: THIRD_USER,
      timestamp: timestampAt(8200),
      timestamp_raw_ms: BASE_TIME_MS + 8200,
    });

  const approvedEdit = await waitFor(async () => {
    const edit = await getEdit(spotId, editId);
    return edit.approved === true && edit.processing_status === "APPROVED_VOTING"
      ? edit
      : null;
  }, "forced voting edit approval");

  spot = await getSpot(spotId);
  assert.deepEqual(spot.name, { en: "Voting Applied" });
  assertCoordinate(spot.location_raw, 45.5017, -73.5673, "spot.location_raw");
  assert.equal(approvedEdit.approval_reason, "vote_write");
  assert.equal(approvedEdit.vote_summary.yes_count, 2);
  assert.equal(approvedEdit.vote_summary.no_count, 0);
  assert.equal(approvedEdit.vote_summary.submitter_vote, "yes");
  assert.equal(approvedEdit.vote_summary.eligible_for_auto_approval, true);
}

async function testForcedVotingRejectsWithoutSubmitterSupport() {
  const spotId = "integration-forced-voting-no-submitter";
  const editId = "forced-vote-without-submitter";
  await db.collection("spots").doc(spotId).set({
    name: { en: "Voting No Submitter Base" },
    location: new admin.firestore.GeoPoint(47.0, 8.0),
    location_raw: { lat: 47.0, lng: 8.0 },
    media: [],
    address: null,
    source: "pkspot",
    edit_policy: { force_voting: true },
  });

  const oldEnoughForAutoApproval = Date.now() - 25 * 60 * 60 * 1000;
  await createBlockedEdit(
    spotId,
    editId,
    {
      ...editPayload({
        type: "UPDATE",
        offsetMs: 8500,
        data: { name: { en: "Should Not Apply" } },
      }),
      timestamp: Timestamp.fromMillis(oldEnoughForAutoApproval),
      timestamp_raw_ms: oldEnoughForAutoApproval,
    },
    "VOTING_FORCED_TEST"
  );

  for (const voter of [SECOND_USER, THIRD_USER]) {
    await db
      .collection("spots")
      .doc(spotId)
      .collection("edits")
      .doc(editId)
      .collection("votes")
      .doc(voter.uid)
      .set({
        value: 1,
        vote: "yes",
        user: voter,
        timestamp: timestampAt(8600),
        timestamp_raw_ms: BASE_TIME_MS + 8600,
      });
  }

  const edit = await waitFor(async () => {
    const latest = await getEdit(spotId, editId);
    return latest.vote_summary?.total_count === 2 ? latest : null;
  }, "non-submitter vote summary");
  const spot = await getSpot(spotId);

  assert.equal(edit.approved, false);
  assert.equal(edit.processing_status, "VOTING_FORCED_TEST");
  assert.equal(edit.vote_summary.submitter_vote, null);
  assert.equal(edit.vote_summary.eligible_for_auto_approval, false);
  assert.deepEqual(spot.name, { en: "Voting No Submitter Base" });
}

async function testUserContributionCounters() {
  const userSnap = await db.collection("users").doc(USER.uid).get();
  const data = userSnap.data();

  assert.equal(data?.spot_creates_count, 2);
  assert.equal(data?.spot_edits_count, 10);
  assert.equal(data?.media_added_count, 3);
}

async function testLeaderboardsReflectApprovedEdits() {
  const editedLeaderboard = await db.collection("leaderboards").doc("spots_edited").get();
  const createdLeaderboard = await db.collection("leaderboards").doc("spots_created").get();
  const mediaLeaderboard = await db.collection("leaderboards").doc("media_added").get();

  const editedEntry = editedLeaderboard
    .data()
    ?.entries.find((entry) => entry.uid === USER.uid);
  const createdEntry = createdLeaderboard
    .data()
    ?.entries.find((entry) => entry.uid === USER.uid);
  const mediaEntry = mediaLeaderboard
    .data()
    ?.entries.find((entry) => entry.uid === USER.uid);

  assert.equal(editedEntry?.count, 10);
  assert.equal("profile_picture" in editedEntry, false);
  assert.equal(createdEntry?.count, 2);
  assert.equal(mediaEntry?.count, 3);
}

async function main() {
  console.log("Resetting Firestore emulator...");
  await resetEmulatorFirestore();

  console.log("Running spot creation/edit integration flow...");
  await testCreateSpotFromPlainLocation();
  await testCreateSpotFromRawOnlyLocationAndBounds();
  await testLocationAndBoundsMobileShapes();
  await testSourceAndSystemFieldsAreIgnoredOnUpdate();
  await testMergedAndDeletedFields();
  await testMediaAppendAndOverwrite();
  await testEmptyMediaAppendDoesNotDeleteExistingMedia();
  await testInvalidLocationEditDoesNotMutateSpot();
  await testActivityQueriesUseRawTimestampDeterministically();
  await testForcedVotingFlowAppliesOnlyAfterEligibleVotes();
  await testForcedVotingRejectsWithoutSubmitterSupport();
  await testUserContributionCounters();
  await testLeaderboardsReflectApprovedEdits();

  console.log("Spot edit integration flow passed.");
}

main()
  .then(() => admin.app().delete())
  .catch(async (error) => {
    console.error(error);
    await admin.app().delete();
    process.exit(1);
  });
