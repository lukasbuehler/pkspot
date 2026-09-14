const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const functionsRequire = createRequire(require.resolve("../functions/package.json"));
const admin = functionsRequire("firebase-admin");
const { enqueueCommunityPlace, processCommunityPlaces, enqueueCommunityPlaceBatch } = require("../functions/lib/functions/src/communityPlaceLocalizationStore");
const { placeFingerprint, GeoNamesError } = require("../functions/lib/functions/src/communityPlaceNames");

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith("demo-")) {
  throw new Error("This test requires a demo project and the Firestore emulator.");
}
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = admin.firestore();
const pageRef = db.doc("community_pages/locality:de:munich");
const parentRef = db.doc("community_pages/country:de");
const jobRef = db.doc("community_place_localization_jobs/locality:de:munich");
const seed = {
  communityKey: pageRef.id, scope: "locality", published: true, displayName: "Munich",
  bounds_center: [48.14, 11.58], geography: { countryCode: "DE", localityName: "Munich", regionName: "Bavaria" },
  relationships: { parentKeys: [parentRef.id] },
  counts: { totalSpots: 7 }, place_name_overrides: { it: "Reviewed name" },
};
const enrichment = (page) => ({ source: "geonames", geonamesId: 2867714, names: { it: "Monaco di Baviera" }, fingerprint: placeFingerprint(page), updatedAtMs: Date.now() });
async function run() {
  await db.recursiveDelete(db.collection("community_place_localization_jobs"));
  await db.recursiveDelete(db.collection("community_pages"));
  await pageRef.set(seed);
  await parentRef.set({ scope: "country", published: true, childCommunities: [{ communityKey: pageRef.id, displayName: "Munich", totalSpotCount: 7 }] });
  assert.equal(await enqueueCommunityPlace(db, pageRef.id), true);
  assert.equal(await enqueueCommunityPlace(db, pageRef.id), false);
  let calls = 0;
  const enrich = async (page) => {
    calls++;
    await pageRef.update({ "counts.totalSpots": 8 });
    return enrichment(page);
  };
  const batches = await Promise.all([processCommunityPlaces(db, enrich), processCommunityPlaces(db, enrich)]);
  assert.equal(calls, 1, "The lease prevents concurrent requests for the same page");
  assert.equal(batches.reduce((n, result) => n + result.completed, 0), 1);
  const saved = (await pageRef.get()).data();
  assert.equal(saved.counts.totalSpots, 8);
  assert.equal(saved.place_name_overrides.it, "Reviewed name");
  assert.equal(saved.place_localization.names.it, "Monaco di Baviera");
  assert.equal((await parentRef.get()).data().childCommunities[0].place_localization.names.it, "Monaco di Baviera");
  assert.equal((await jobRef.get()).exists, false);
  assert.equal(await enqueueCommunityPlace(db, pageRef.id), false);

  await enqueueCommunityPlace(db, pageRef.id, true);
  await processCommunityPlaces(db, async (page) => {
    await pageRef.update({ "geography.localityName": "Berlin" });
    return { ...enrichment(page), names: { it: "Incorrect stale result" } };
  });
  assert.equal((await pageRef.get()).data().place_localization.names.it, "Monaco di Baviera", "In-flight stale response must not overwrite names");
  await pageRef.update({ "geography.localityName": "Munich" });
  await enqueueCommunityPlace(db, pageRef.id, true);
  assert.deepEqual(await processCommunityPlaces(db, async () => null), { completed: 0, review: 1, failed: 0 });
  assert.equal((await jobRef.get()).data().status, "needs-review");
  assert.deepEqual(await processCommunityPlaces(db, async () => { throw Error("Must not repeat ambiguous lookup"); }), { completed: 0, review: 0, failed: 0 });

  await enqueueCommunityPlace(db, pageRef.id, true);
  assert.deepEqual(await processCommunityPlaces(db, async () => { throw new GeoNamesError("quota"); }), { completed: 0, review: 0, failed: 1 });
  assert.equal((await jobRef.get()).data().lastError, "quota");
  assert.ok((await jobRef.get()).data().nextAttemptAt.toMillis() > Date.now());
  const backfill = await enqueueCommunityPlaceBatch(db);
  assert.equal(backfill.queued, 0);
  assert.equal(backfill.nextCursor, null);
  console.log("Community localization emulator checks passed: persistence, leases, parent summaries, overrides, stale responses, ambiguity and retries.");
}
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.terminate());
