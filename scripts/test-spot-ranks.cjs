const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const load = createRequire(require('node:path').resolve('functions/package.json'));
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required');
const admin = load('firebase-admin');
admin.initializeApp({ projectId: 'demo-pkspot' });
const db = admin.firestore();
const { publishSpotRanks, setLocalLegendParticipation, rebuildTrainingMonths } = require('../functions/lib/functions/src/trainingSummaryFunctions.js');

// Months far in the future keep these fixtures apart from other tests.
const run = `${Date.now()}`;
const noonZurich = (date) => Date.parse(`${date}T10:00:00Z`);
async function tally(month, spot, uid, days) {
  await db.doc(`users/${uid}/training_settings/local_legend`).set({enabled: true, decided_at_raw_ms: 0, enabled_since_raw_ms: 0});
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

test('check-in removal withdraws ranks only on publication and respects the three-account threshold', async () => {
  const month = '2091-06'; const spot = `deleted-${run}`;
  const users = ['delete-a', 'delete-b', 'delete-c'].map(uid => `${uid}-${run}`);
  await Promise.all(users.map(uid => tally(month, spot, uid, 3)));
  await publishSpotRanks(noonZurich('2091-06-20'));
  await db.doc(`spot_legend_tallies/${month}_${spot}_${users[2]}`).update({verified_days: 0});
  assert.equal((await ranksOf(users[0], month)).spots[spot].rank, 1);
  assert.equal((await ranksOf(users[2], month)).spots[spot].rank, 1);
  await publishSpotRanks(noonZurich('2091-06-21'));
  assert.equal((await ranksOf(users[0], month)).spots[spot].status, 'too_few_people');
  assert.equal((await ranksOf(users[0], month)).spots[spot].rank, undefined);
  assert.equal((await ranksOf(users[2], month)).spots[spot], undefined);
});

test('withdrawal clears the whole current month, preserves history, and rejoining never imports older visits', async () => {
  const uid = `withdraw-${run}`;
  const now = Date.now(); const month = new Date(now).toISOString().slice(0, 7);
  const call = enabled => setLocalLegendParticipation.run({auth: {uid}, data: {enabled}});
  await db.doc(`users/${uid}/session_records/before`).set({
    source: 'check_in', started_at_raw_ms: now - 1000, time_zone: 'Europe/Zurich',
    spot_visits: [{spot_id: 'withdraw-spot', check_in_id: 'old', arrived_at_raw_ms: now - 1000, verified: true}],
  });
  await call(true);
  const ref = db.doc(`users/${uid}/training_settings/local_legend`);
  const since = (await ref.get()).get('enabled_since_raw_ms');
  await call(true);
  assert.equal((await ref.get()).get('enabled_since_raw_ms'), since);
  const tallyRef = db.doc(`spot_legend_tallies/${month}_withdraw-spot_${uid}`);
  assert.equal((await tallyRef.get()).get('verified_days'), 0);
  const rank = {version: 1, month, final: false, computed_at_raw_ms: now,
    spots: {one: {status: 'ranked', verified_days: 2, rank: 1}, two: {status: 'ranked', verified_days: 2, rank: 2}}};
  await db.doc(`users/${uid}/training_ranks/${month}`).set(rank);
  await db.doc(`users/${uid}/training_ranks/2020-01`).set({...rank, month: '2020-01', final: true});
  await call(false);
  assert.equal(await ranksOf(uid, month), undefined);
  assert.ok(await ranksOf(uid, '2020-01'));
  assert.equal((await tallyRef.get()).exists, false);
  assert.equal((await db.doc(`users/${uid}/training_months/${month}`).get()).get('spots.withdraw-spot.verified_days'), 1);
  // A legacy off-state may still have retained a current rank.
  await db.doc(`users/${uid}/training_ranks/${month}`).set(rank);
  await call(true);
  assert.equal(await ranksOf(uid, month), undefined);
  assert.ok((await ref.get()).get('enabled_since_raw_ms') > since);
  assert.equal((await tallyRef.get()).get('verified_days'), 0);
  // A new confirmed visit in the same session is eligible; the older one is not.
  const after = Date.now();
  await db.doc(`users/${uid}/session_records/before`).update({spot_visits: [
    {spot_id: 'withdraw-spot', check_in_id: 'old', arrived_at_raw_ms: now - 1000, verified: true},
    {spot_id: 'new-spot', check_in_id: 'new', arrived_at_raw_ms: after, verified: true},
  ]});
  await rebuildTrainingMonths(uid, [month]);
  assert.equal((await db.doc(`spot_legend_tallies/${month}_new-spot_${uid}`).get()).get('verified_days'), 1);
  assert.equal((await tallyRef.get()).get('verified_days'), 0);
});

test('account purge does not recreate empty tallies for a still-enabled setting', async () => {
  const uid = `purged-${run}`; const now = Date.now();
  const month = new Date(now).toISOString().slice(0, 7);
  await tally(month, 'purged-spot', uid, 2);
  await db.doc(`users/${uid}/training_months/${month}`).set({month, spots: {'purged-spot': {verified_days: 2}}});
  await rebuildTrainingMonths(uid, [month], {purge: true});
  assert.equal((await db.doc(`spot_legend_tallies/${month}_purged-spot_${uid}`).get()).exists, false);
  assert.equal((await db.doc(`users/${uid}/training_months/${month}`).get()).exists, false);
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
