const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const load = createRequire(require('node:path').resolve('functions/package.json'));
const admin = load('firebase-admin');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required');
admin.initializeApp({ projectId: 'demo-pkspot' });
const api = require('../functions/lib/functions/src/eventAuthoringFunctions.js');
const db = admin.firestore();
const input = { name: 'Test Jam', startsAt: '2026-11-01T12:00:00Z', endsAt: '2026-11-01T14:00:00Z', timeZone: 'Europe/Zurich' };
const call = (fn, uid, data) => api[fn].run({auth: uid ? {uid} : undefined, data});
after(async () => { await admin.app().delete(); });
test('unverified admin creates formal event; ordinary unverified user cannot', async () => {
  await db.doc('users/author-admin').set({is_admin:true});
  await db.doc('users/author-user').set({is_admin:false});
  const result = await call('createFormalEvent', 'author-admin', input);
  assert.equal((await db.doc(`events/${result.eventId}`).get()).data().listing_tier, 'formal');
  await assert.rejects(call('createFormalEvent', 'author-user', input), {code:'permission-denied'});
});
test('unverified user submits a private suggestion and staff can review it', async () => {
  const result = await call('submitEventSuggestion', 'author-user', input);
  assert.equal((await db.doc(`event_suggestions/${result.suggestionId}`).get()).data().status, 'submitted');
  await call('reviewEventSuggestion', 'author-admin', {suggestionId:result.suggestionId, outcome:'rejected'});
  assert.equal((await db.doc(`event_suggestions/${result.suggestionId}`).get()).data().status, 'rejected');
  await assert.rejects(call('submitEventSuggestion', undefined, input), {code:'unauthenticated'});
});
