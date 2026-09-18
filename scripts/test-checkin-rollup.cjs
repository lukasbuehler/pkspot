const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const load = createRequire(require('node:path').resolve('functions/package.json'));
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required');
const admin = load('firebase-admin');
admin.initializeApp({ projectId: 'demo-pkspot' });
const db = admin.firestore();
const { recomputeCheckInActivity } = require('../functions/lib/functions/src/checkInFunctions.js');
const { Timestamp, Query } = load('firebase-admin/firestore');
const now = Timestamp.now();
const root = `rollup-${Date.now()}`;
async function contribution(spot, id, owner, eligibility = 'accepted', at = now) {
  await db.doc(`spots/${spot}/check_in_aggregate_contributions/${id}`).set({ owner_id: owner, eligibility, accepted_at: at });
}
async function enqueue(spot) { await db.doc(`check_in_activity_rollups/${spot}`).set({ spot_id: spot, next_rollup_at: Timestamp.fromMillis(0), revision: admin.firestore.FieldValue.increment(1) }, { merge: true }); }
test('rollup counts distinct accepted accounts only and removes expired activity', async () => {
  await Promise.all([contribution(root, 'a', 'one'), contribution(root, 'duplicate', 'one'),
    contribution(root, 'excluded', 'two', 'excluded'), contribution(root, 'old', 'three', 'accepted', Timestamp.fromMillis(1))]);
  await enqueue(root); await recomputeCheckInActivity.run({});
  assert.equal((await db.doc(`spot_activity_public/${root}`).get()).exists, false);
  assert.equal((await db.doc(`spots/${root}/check_in_aggregate_contributions/old`).get()).exists, false);
  await contribution(root, 'b', 'two'); await enqueue(root); await recomputeCheckInActivity.run({});
  assert.equal((await db.doc(`spot_activity_public/${root}`).get()).data().status, 'recently_trained');
});
test('a concurrent contribution is recomputed rather than overwritten by the old rollup', async () => {
  const spot = `${root}-race`; await contribution(spot, 'a', 'one'); await enqueue(spot);
  const original = Query.prototype.get; let injected = false;
  Query.prototype.get = async function (...args) {
    const snapshot = await original.apply(this, args);
    if (!injected && snapshot.docs?.some(doc => doc.ref.path === `spots/${spot}/check_in_aggregate_contributions/a`)) {
      injected = true; await contribution(spot, 'b', 'two'); await enqueue(spot);
    }
    return snapshot;
  };
  try { await recomputeCheckInActivity.run({}); } finally { Query.prototype.get = original; }
  assert.equal(injected, true);
  assert.equal((await db.doc(`spot_activity_public/${spot}`).get()).data().status, 'recently_trained');
});
after(async () => { await db.terminate(); await admin.app().delete(); });
