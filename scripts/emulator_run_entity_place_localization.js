const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const functionsRequire = createRequire(require.resolve("../functions/package.json"));
const admin = functionsRequire("firebase-admin");
const { queueEntityPlace, eventPlaceInput } = require("../functions/lib/functions/src/entityPlaceLocalization");
const { processCommunityPlaces } = require("../functions/lib/functions/src/communityPlaceLocalizationStore");
const { placeFingerprint } = require("../functions/lib/functions/src/communityPlaceNames");
const { publicPlaceNames, entityPlaceKey } = require("../functions/lib/src/scripts/EntityPlaceNames");
const { enrichSharedPlace } = require("../functions/lib/functions/src/sharedPlaceEnrichment");
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith("demo-")) throw Error("Demo Firestore emulator required");
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = admin.firestore();
const input = { countryCode: "DE", locality: "Munich", lat: 48.14, lng: 11.58 };
async function run() {
  for (const collection of ["place_names", "place_name_sources", "place_name_jobs"]) await db.recursiveDelete(db.collection(collection));
  assert.equal(eventPlaceInput({ published: true, visibility: "private", country_code: "DE", locality_string: "Munich" }), undefined);
  assert.equal(eventPlaceInput({ published: true, visibility: "public", listing_tier: "community" }), undefined);
  assert.equal(eventPlaceInput({ published: true, visibility: "public", viewer_policy: { audience: "invited" } }), undefined);
  assert.equal(await queueEntityPlace(db, input), true);
  assert.equal(await queueEntityPlace(db, input), false);
  let calls = 0;
  const counts = await processCommunityPlaces(db, async page => {
    calls++;
    return { source: "geonames", geonamesId: 2867714, names: { it: "Monaco di Baviera" }, center: [48.137, 11.575], fingerprint: placeFingerprint(page), updatedAtMs: 1 };
  }, { pages: "place_name_sources", queue: "place_name_jobs" });
  assert.equal(calls, 1); assert.equal(counts.completed, 1);
  const source = (await db.doc(`place_name_sources/${entityPlaceKey(input)}`).get()).data();
  const projected = publicPlaceNames(source.communityKey, source.place_localization);
  assert.ok(!("bounds_center" in projected)); assert.ok(!("geography" in projected));
  await db.doc(`place_names/${source.communityKey}`).set(projected);
  const reused = await enrichSharedPlace(db, { ...source, communityKey: "different-community-key" }, "must-not-contact-provider");
  assert.equal(reused.names.it, "Monaco di Baviera");
  assert.equal(reused.fingerprint, placeFingerprint({ ...source, communityKey: "different-community-key" }));
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const root = `http://${host}/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`;
  const publicRead = await fetch(`${root}/place_names/${encodeURIComponent(source.communityKey)}`);
  assert.equal(publicRead.status, 200, "Anonymous single-document name read is allowed");
  for (const path of [`place_name_sources/${encodeURIComponent(source.communityKey)}`, `place_name_jobs/${encodeURIComponent(source.communityKey)}`, "place_names"]) {
    assert.equal((await fetch(`${root}/${path}`)).status, 403, `Anonymous read must be denied: ${path}`);
  }
  const write = await fetch(`${root}/place_names/forged`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: { source: { stringValue: "geonames" } } }) });
  assert.equal(write.status, 403, "Anonymous writes are denied");
  console.log("Entity localization emulator passed: deduplication, shared cache, restricted Event exclusion, public projection, and Firestore read/write rules.");
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.terminate());
