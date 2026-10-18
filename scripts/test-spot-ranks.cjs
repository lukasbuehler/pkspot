const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const load = createRequire(require('node:path').resolve('functions/package.json'));
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required');
const admin = load('firebase-admin');
admin.initializeApp({ projectId: 'demo-pkspot' });
const db = admin.firestore();
const { publishSpotRanks } = require('../functions/lib/functions/src/trainingSummaryFunctions.js');

// Months far in the future keep these fixtures apart from other tests.
const run = `${Date.now()}`;
const noonZurich = (date) => Date.parse(`${date}T10:00:00Z`);
async function tally(month, spot, uid, days) {
  await db.doc(`spot_legend_tallies/${month}_${spot}_${uid}`).set({ uid, spot_id: spot, month, verified_days: days, last_ms: 0 });
}
const ranksOf = async (uid, month) => (await db.doc(`users/${uid}/training_ranks/${month}`).get()).data();

test('publishes Olympic ranks with tie counts once three people checked in', async () => {
  const month = '2091-05'; const spot = `rank-${run}`;
  await Promise.all([tally(month, spot, `a-${run}`, 6), tally(month, spot, `b-${run}`, 6),
    tally(month, spot, `c-${run}`, 4), tally(month, spot, `d-${run}`, 1)]);
  await publishSpotRanks(noonZurich('2091-05-20'));
  assert.deepEqual((await ranksOf(`a-${run}`, month)).spots[spot], { status: 'ranked', verified_days: 6, rank: 1, tied_with: 1, legend: true });
  assert.deepEqual((await ranksOf(`c-${run}`, month)).spots[spot], { status: 'ranked', verified_days: 4, rank: 3, tied_with: 0, legend: false });
  assert.equal((await ranksOf(`c-${run}`, month)).final, false);
  // A single verified day is not ranked and gets no document.
  assert.equal(await ranksOf(`d-${run}`, month), undefined);

  // An unchanged night writes nothing.
  const before = await db.doc(`users/c-${run}/training_ranks/${month}`).get();
  await publishSpotRanks(noonZurich('2091-05-21'));
  const unchanged = await db.doc(`users/c-${run}/training_ranks/${month}`).get();
  assert.ok(unchanged.updateTime.isEqual(before.updateTime));

  // When people leave and fewer than three remain, the rank is withdrawn.
  await Promise.all([`b-${run}`, `d-${run}`].map((uid) => db.doc(`spot_legend_tallies/${month}_${spot}_${uid}`).delete()));
  await publishSpotRanks(noonZurich('2091-05-22'));
  assert.deepEqual((await ranksOf(`a-${run}`, month)).spots[spot], { status: 'too_few_people', verified_days: 6 });
});

test('withholds ranks while fewer than three people checked in', async () => {
  const month = '2091-08'; const spot = `few-${run}`;
  await Promise.all([tally(month, spot, `e-${run}`, 5), tally(month, spot, `f-${run}`, 2)]);
  await publishSpotRanks(noonZurich('2091-08-10'));
  assert.deepEqual((await ranksOf(`e-${run}`, month)).spots[spot], { status: 'too_few_people', verified_days: 5 });
});

test('keeps last month open for two days, then finalizes it and deletes its tallies', async () => {
  const month = '2091-10'; const spot = `final-${run}`;
  await Promise.all([tally(month, spot, `g-${run}`, 3), tally(month, spot, `h-${run}`, 2), tally(month, spot, `i-${run}`, 2)]);
  await publishSpotRanks(noonZurich('2091-11-02'));
  assert.equal((await ranksOf(`g-${run}`, month)).final, false);
  await publishSpotRanks(noonZurich('2091-11-03'));
  const final = await ranksOf(`h-${run}`, month);
  assert.equal(final.final, true);
  assert.deepEqual(final.spots[spot], { status: 'ranked', verified_days: 2, rank: 2, tied_with: 1, legend: false });
  const left = await db.collection('spot_legend_tallies').where('month', '==', month).get();
  assert.equal(left.size, 0);
});

after(async () => { await db.terminate(); await admin.app().delete(); });
