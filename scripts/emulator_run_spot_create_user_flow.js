const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { initializeApp, deleteApp } = require("firebase/app");
const {
  collection,
  connectFirestoreEmulator,
  doc,
  addDoc,
  getDoc,
  getFirestore,
  setDoc,
  Timestamp,
  updateDoc,
} = require("firebase/firestore");
const {
  connectAuthEmulator,
  getAuth,
  signInWithCustomToken,
} = require("firebase/auth");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    "Refusing to run spot create user-flow tests without FIRESTORE_EMULATOR_HOST."
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

const USER = {
  uid: "spot-create-flow-user",
  display_name: "Spot Create Flow User",
};
const OTHER_USER = {
  uid: "spot-create-flow-other",
  display_name: "Other Flow User",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function resetEmulatorFirestore() {
  const collections = await adminDb.listCollections();
  await Promise.all(
    collections.map((collectionRef) => adminDb.recursiveDelete(collectionRef))
  );
}

async function createClient(uid) {
  const app = initializeApp(
    {
      apiKey: "demo-api-key",
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      projectId: PROJECT_ID,
    },
    `spot-create-flow-${uid}-${Date.now()}-${Math.random()}`
  );
  apps.push(app);

  const db = getFirestore(app);
  connectFirestoreEmulator(db, firestoreHost, firestorePort);

  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}:${authPort}`, {
    disableWarnings: true,
  });

  const token = await adminAuth.createCustomToken(uid);
  await signInWithCustomToken(auth, token);

  return { app, auth, db, uid };
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

function localizedText(text) {
  const now = Timestamp.now();
  return {
    text,
    provider: "user",
    timestamp: now,
  };
}

function buildRichSpotEditData() {
  return {
    name: {
      en: localizedText("Something Park"),
    },
    location: { latitude: 47.3769, longitude: 8.5417 },
    location_raw: { lat: 47.3769, lng: 8.5417 },
    description: {
      en: localizedText("A realistic user-created park spot from the emulator flow."),
    },
    media: [],
    type: "park",
    access: "public",
    amenities: {
      covered: false,
      lit: true,
      water: false,
    },
    bounds: [
      { latitude: 47.3767, longitude: 8.5415 },
      { latitude: 47.377, longitude: 8.5415 },
      { latitude: 47.377, longitude: 8.542 },
      { latitude: 47.3767, longitude: 8.542 },
    ],
    hide_streetview: false,
  };
}

function buildMinimalNamedSpotEditData() {
  return {
    name: {
      en: localizedText("Minimal Rail Spot"),
    },
    location: { latitude: 46.948, longitude: 7.4474 },
    location_raw: { lat: 46.948, lng: 7.4474 },
    media: [],
    type: "other",
    access: "other",
    amenities: {},
    hide_streetview: false,
  };
}

function buildLocationOnlySpotEditData() {
  return {
    name: {
      en: localizedText("Location Only Park"),
    },
    location: { latitude: 47.5596, longitude: 7.5886 },
    media: [],
    type: "park",
    access: "public",
    amenities: {},
    hide_streetview: false,
  };
}

function buildReportedProductionPayloadData() {
  return {
    name: {
      de: localizedText("Park"),
    },
    location: {
      latitude: 43.125069239165526,
      longitude: 141.43403324056948,
      type: "firestore/geoPoint/1.0",
    },
    location_raw: {
      lat: 43.125069239165526,
      lng: 141.43403324056948,
    },
    media: [],
    type: "other",
    access: "other",
    amenities: {},
    hide_streetview: false,
  };
}

function buildRawOnlySpotEditData() {
  return {
    name: {
      en: localizedText("Raw Shape Park"),
    },
    location_raw: { lat: 47.0502, lng: 8.3093 },
    description: {
      en: localizedText("Uses raw location and raw bounds only."),
    },
    media: [],
    type: "park",
    access: "public",
    amenities: {
      covered: false,
    },
    bounds_raw: [
      { lat: 47.05, lng: 8.309 },
      { lat: 47.0504, lng: 8.309 },
      { lat: 47.0504, lng: 8.3097 },
    ],
    hide_streetview: true,
  };
}

function buildGooglePlaceSpotEditData() {
  return {
    name: {
      en: localizedText("Google Place Spot"),
    },
    location: { _latitude: 48.1372, _longitude: 11.5756 },
    location_raw: { lat: 48.1372, lng: 11.5756 },
    media: [],
    type: "urban landscape",
    access: "public",
    amenities: {
      lit: null,
      covered: false,
    },
    external_references: {
      google_maps_place_id: "ChIJ-emulator-place",
    },
  };
}

const allowedCreatePayloadCases = [
  {
    label: "rich Something Park payload",
    buildData: buildRichSpotEditData,
    expected: {
      name: "Something Park",
      lat: 47.3769,
      lng: 8.5417,
      type: "park",
      access: "public",
      hasBounds: true,
      hideStreetview: false,
    },
  },
  {
    label: "minimal named payload",
    buildData: buildMinimalNamedSpotEditData,
    expected: {
      name: "Minimal Rail Spot",
      lat: 46.948,
      lng: 7.4474,
      type: "other",
      access: "other",
      hasBounds: false,
      hideStreetview: false,
    },
  },
  {
    label: "location-only payload",
    buildData: buildLocationOnlySpotEditData,
    expected: {
      name: "Location Only Park",
      lat: 47.5596,
      lng: 7.5886,
      type: "park",
      access: "public",
      hasBounds: false,
      hideStreetview: false,
    },
  },
  {
    label: "reported production de-only payload",
    buildData: buildReportedProductionPayloadData,
    expected: {
      name: "Park",
      locale: "de",
      lat: 43.125069239165526,
      lng: 141.43403324056948,
      type: "other",
      access: "other",
      hasBounds: false,
      hideStreetview: false,
    },
  },
  {
    label: "raw-only location and bounds payload",
    buildData: buildRawOnlySpotEditData,
    expected: {
      name: "Raw Shape Park",
      lat: 47.0502,
      lng: 8.3093,
      type: "park",
      access: "public",
      hasBounds: true,
      hideStreetview: true,
    },
  },
  {
    label: "native GeoPoint-shaped Google place payload",
    buildData: buildGooglePlaceSpotEditData,
    expected: {
      name: "Google Place Spot",
      lat: 48.1372,
      lng: 11.5756,
      type: "urban landscape",
      access: "public",
      hasBounds: false,
    },
  },
];

async function seedUsers(client) {
  await setDoc(doc(client.db, "users", USER.uid), {
    display_name: USER.display_name,
    verified_email: true,
  });
  await adminDb.collection("users").doc(OTHER_USER.uid).set({
    display_name: OTHER_USER.display_name,
    verified_email: true,
  });
}

async function createSpotThroughClientEdit(client, payloadCase) {
  const spotRef = doc(collection(client.db, "spots"));
  await setDoc(spotRef, {});

  const editRef = await addDoc(collection(client.db, `spots/${spotRef.id}/edits`), {
    type: "CREATE",
    timestamp: Timestamp.now(),
    timestamp_raw_ms: Date.now(),
    user: {
      uid: USER.uid,
      display_name: USER.display_name,
    },
    data: payloadCase.buildData(),
  });

  const edit = await waitFor(async () => {
    const snapshot = await getDoc(editRef);
    const data = snapshot.data();
    return data?.approved === true ? data : null;
  }, `${payloadCase.label} CREATE edit approval`);

  const spot = await waitFor(async () => {
    const snapshot = await getDoc(spotRef);
    const data = snapshot.data();
    const locale = payloadCase.expected.locale ?? "en";
    if (data?.name?.[locale]?.text !== payloadCase.expected.name) {
      return null;
    }
    if (
      payloadCase.expected.hasBounds &&
      (!data.bounds_center ||
        typeof data.bounds_center.latitude !== "number" ||
        typeof data.bounds_center.longitude !== "number" ||
        typeof data.bounds_radius_m !== "number")
    ) {
      return null;
    }
    return data;
  }, `${payloadCase.label} materialized spot`);

  const locale = payloadCase.expected.locale ?? "en";
  assert.equal(edit.processing_status, "APPROVED_IMMEDIATE");
  assert.equal(spot.source, "pkspot");
  assert.equal(spot.is_iconic, false);
  assert.equal(spot.name[locale].text, payloadCase.expected.name);
  assert.equal(spot.location_raw.lat, payloadCase.expected.lat);
  assert.equal(spot.location_raw.lng, payloadCase.expected.lng);
  assert.ok(spot.location, "Expected cloud function to write a GeoPoint location");
  assert.equal(spot.location.latitude, payloadCase.expected.lat);
  assert.equal(spot.location.longitude, payloadCase.expected.lng);
  assert.ok(spot.tile_coordinates?.z16, "Expected cloud function to write tile coordinates");
  assert.deepEqual(spot.media, []);
  assert.equal(spot.type, payloadCase.expected.type);
  assert.equal(spot.access, payloadCase.expected.access);
  if (payloadCase.expected.hasBounds) {
    assert.ok(Array.isArray(spot.bounds), "Expected GeoPoint bounds");
    assert.ok(Array.isArray(spot.bounds_raw), "Expected raw bounds");
    assert.ok(
      spot.bounds_center &&
        typeof spot.bounds_center.latitude === "number" &&
        typeof spot.bounds_center.longitude === "number",
      "Expected Typesense bounds_center to be a Firestore GeoPoint"
    );
    assert.equal(typeof spot.bounds_radius_m, "number");
  } else {
    assert.equal("bounds" in spot, false);
  }
  if ("hideStreetview" in payloadCase.expected) {
    assert.equal(spot.hide_streetview, payloadCase.expected.hideStreetview);
  }

  return spotRef;
}

async function testRealUserCanCreateSpotThroughEditFlow(client) {
  await seedUsers(client);

  await assertDenied("direct user spot create with materialized data", () =>
    setDoc(doc(client.db, "spots/direct-materialized-spot"), {
      ...buildRichSpotEditData(),
      source: "pkspot",
    })
  );

  let lastSpotRef = null;
  for (const payloadCase of allowedCreatePayloadCases) {
    console.log(`Creating spot with ${payloadCase.label}...`);
    lastSpotRef = await createSpotThroughClientEdit(client, payloadCase);
  }

  const impersonatedSpotRef = doc(collection(client.db, "spots"));
  await setDoc(impersonatedSpotRef, {});
  await assertDenied("CREATE edit impersonating another user", () =>
    addDoc(collection(client.db, `spots/${impersonatedSpotRef.id}/edits`), {
      type: "CREATE",
      timestamp: Timestamp.now(),
      timestamp_raw_ms: Date.now(),
      user: {
        uid: OTHER_USER.uid,
        display_name: OTHER_USER.display_name,
      },
      data: buildRichSpotEditData(),
    })
  );

  const noLocationSpotRef = doc(collection(client.db, "spots"));
  await setDoc(noLocationSpotRef, {});
  const noLocationEditRef = await addDoc(collection(client.db, `spots/${noLocationSpotRef.id}/edits`), {
    type: "CREATE",
    timestamp: Timestamp.now(),
    timestamp_raw_ms: Date.now(),
    user: {
      uid: USER.uid,
      display_name: USER.display_name,
    },
    data: {
      name: { en: localizedText("No Location Spot") },
      media: [],
      type: "other",
      access: "other",
      amenities: {},
    },
  });
  const noLocationEdit = await waitFor(async () => {
    const snapshot = await getDoc(noLocationEditRef);
    const data = snapshot.data();
    return data?.approved === true ? data : null;
  }, "no-location CREATE edit approval");
  assert.equal(noLocationEdit.processing_status, "APPROVED_IMMEDIATE");

  await assertDenied("direct user spot update after materialization", () =>
    updateDoc(lastSpotRef, { source: "client-forged" })
  );

  const expectedCreates = allowedCreatePayloadCases.length + 1;
  const user = await waitFor(async () => {
    const snapshot = await getDoc(doc(client.db, "users", USER.uid));
    const data = snapshot.data();
    return data?.spot_creates_count === expectedCreates &&
      data?.spot_edits_count === expectedCreates
      ? data
      : null;
  }, "user contribution counters");

  assert.equal(user.spot_creates_count, expectedCreates);
  assert.equal(user.spot_edits_count, expectedCreates);
}

async function cleanupApps() {
  await Promise.all(apps.map((app) => deleteApp(app)));
}

async function main() {
  console.log("Resetting Firestore emulator for spot create user-flow tests...");
  await resetEmulatorFirestore();

  const client = await createClient(USER.uid);

  console.log("Running real signed-in spot creation flow...");
  await testRealUserCanCreateSpotThroughEditFlow(client);

  console.log("Spot create user-flow tests passed.");
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
