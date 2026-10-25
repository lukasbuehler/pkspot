const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const functionsRequire = createRequire(require.resolve("../functions/package.json"));
const admin = functionsRequire("firebase-admin");
const { queueEntityPlace, eventPlaceInput, syncEntityPlace, applyPlaceNamesToEntities } = require("../functions/lib/functions/src/entityPlaceLocalization");
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
    return { source: "geonames", version: 2, geonamesId: 2867714, names: { it: "Monaco di Baviera" }, center: [48.137, 11.575], fingerprint: placeFingerprint(page), updatedAtMs: 1 };
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
  // Names are copied onto Spots and public Events so previews and search need no lookup per card.
  await db.recursiveDelete(db.collection("spots"));
  await db.recursiveDelete(db.collection("events"));
  const spotData = { address: { locality: "Munich", country: { code: "DE", name: "Germany" }, region: { name: "Bavaria" } }, location_raw: { lat: 48.14, lng: 11.58 } };
  const spotRef = db.doc("spots/munich-steps");
  await spotRef.set(spotData);
  const first = await syncEntityPlace(db, spotRef, "spots", spotData);
  assert.equal(first.written, true); assert.equal(first.missingNames, false, "cached Munich names are reused without a lookup");
  let spot = (await spotRef.get()).data();
  assert.equal(spot.place_key, entityPlaceKey(input));
  assert.deepEqual(spot.place_names.locality, { it: "Monaco di Baviera" });
  assert.ok(spot.localized_search_names.includes("Monaco di Baviera"));
  assert.ok(spot.localized_search_names.includes("Munich"));
  assert.equal(spot.address.locality, "Munich", "original address fields stay unchanged");
  assert.equal((await syncEntityPlace(db, spotRef, "spots", spot)).written, false, "unchanged names cause no write");

  // A public Event at the same town and a private one; only the public one is named.
  const eventBase = { publication_state: "published", country_code: "DE", locality_string: "Munich", location_raw: { lat: 48.14, lng: 11.58 } };
  const publicEvent = db.doc("events/public-jam");
  const privateEvent = db.doc("events/private-jam");
  await publicEvent.set({ ...eventBase, visibility: "public" });
  await privateEvent.set({ ...eventBase, visibility: "private" });
  await syncEntityPlace(db, publicEvent, "events", (await publicEvent.get()).data());
  assert.equal((await syncEntityPlace(db, privateEvent, "events", (await privateEvent.get()).data())).written, false);
  assert.ok((await publicEvent.get()).data().localized_search_names.includes("Monaco di Baviera"));
  assert.equal((await privateEvent.get()).data().place_names, undefined, "private Events stay excluded");

  // Updated translations fan out to every entity at the place by key.
  const updated = { ...(await db.doc(`place_names/${source.communityKey}`).get()).data(), names: { it: "Monaco di Baviera", de: "München" } };
  await db.doc(`place_names/${source.communityKey}`).set(updated);
  assert.equal(await applyPlaceNamesToEntities(db, source.communityKey, updated), 2);
  assert.equal((await spotRef.get()).data().place_names.locality.de, "München");
  assert.ok((await publicEvent.get()).data().localized_search_names.includes("München"));

  // Moving the Spot to another town removes the stale aliases.
  const moved = { ...(await spotRef.get()).data(), address: { locality: "Augsburg", country: { code: "DE", name: "Germany" } }, location_raw: { lat: 48.37, lng: 10.9 } };
  await spotRef.set(moved);
  const afterMove = await syncEntityPlace(db, spotRef, "spots", moved);
  assert.equal(afterMove.missingNames, true, "the new town still needs a lookup");
  spot = (await spotRef.get()).data();
  assert.notEqual(spot.place_key, source.communityKey);
  assert.equal(spot.place_names, undefined);
  assert.ok(!spot.localized_search_names.includes("München"));
  assert.ok(spot.localized_search_names.includes("Augsburg"));

  // An Event that becomes private loses its derived fields.
  const nowPrivate = { ...(await publicEvent.get()).data(), visibility: "private" };
  await publicEvent.set(nowPrivate);
  await syncEntityPlace(db, publicEvent, "events", nowPrivate);
  const cleared = (await publicEvent.get()).data();
  assert.equal(cleared.place_key, undefined); assert.equal(cleared.localized_search_names, undefined);

  console.log("Entity localization emulator passed: deduplication, shared cache, restricted Event exclusion, public projection, and Firestore read/write rules, copied names, fan-out, stale alias removal and private Event exclusion.");
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.terminate());
