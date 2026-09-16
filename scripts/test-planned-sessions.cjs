const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const load = createRequire(require('node:path').resolve('functions/package.json'));
const admin = load('firebase-admin');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required');
process.env.PLANNED_SESSIONS_ENABLED = 'true';
admin.initializeApp({ projectId: 'demo-pkspot' });
const { plannedSessions, plannedSessionReminderAllowed, refreshPlannedSessionPlans, schedulePlannedSessionReminder, deletePlannedSessionData } = require('../functions/lib/functions/src/plannedSessionFunctions.js');
const db = admin.firestore();
const call = (uid, data) => plannedSessions.run({ data, auth: uid ? { uid, token: {} } : undefined });
const adult = { adult_eligibility: 'verified', age_range: { lower: 18 }, assurance: { status: 'active', approval_basis: 'tested', client_integrity: 'apple_app_attest_request_bound' } };
let id, communityId;
const details = { title: 'Training', notes: '', spotId: 'session-test-spot', startsAt: Date.now() + 3600000, endsAt: Date.now() + 7200000, timeZone: 'Europe/Zurich', audience: 'private' };
before(async () => {
  for (const [uid, age_policy] of [['host', {}], ['friend', {}], ['stranger', {}], ['adult', adult]]) await db.doc(`users/${uid}`).set({ display_name: uid, age_policy });
  await db.doc('spots/session-test-spot').set({ name: 'Test Spot' });
  await db.doc('users/host/following/friend').set({});
  await db.doc('users/friend/following/host').set({});
});
after(async () => { await admin.app().delete(); });
test('unverified host can plan privately, not publish to community', async () => {
  id = (await call('host', { action: 'create', session: details })).id;
  await assert.rejects(call('host', { action: 'create', session: { ...details, audience: 'community' } }), { code: 'permission-denied' });
});
test('forwarded private links reveal nothing; explicit mutual invitation grants access', async () => {
  for (const uid of [undefined, 'stranger', 'friend']) await assert.rejects(call(uid, { action: 'get', id }), { code: 'permission-denied' });
  await assert.rejects(call('host', { action: 'invite', id, uid: 'stranger' }), { code: 'permission-denied' });
  await call('host', { action: 'invite', id, uid: 'friend' });
  assert.equal((await call('friend', { action: 'get', id })).session.title, 'Training');
});
test('ending mutual following also ends private invitation access', async () => {
  await db.doc('users/friend/following/host').delete();
  await assert.rejects(call('friend', { action: 'get', id }), { code: 'permission-denied' });
  await db.doc('users/friend/following/host').set({});
});
test('private save is not attendance and has no public count or owner notification', async () => {
  await call('friend', { action: 'save', id, plan: { saved: true, reminder: true, attendance: 'private' } });
  assert.deepEqual(await call('host', { action: 'attendees', id }), []);
  const host = await call('host', { action: 'get', id });
  assert.equal(host.mine.reminder, false);
  assert.equal(JSON.stringify(host).includes('friend'), false);
  assert.equal((await db.doc(`planned_sessions/${id}`).get()).data().rsvp_counts, undefined);
});
test('private attendee explicitly shares only with host', async () => {
  await call('friend', { action: 'save', id, plan: { saved: true, reminder: true, attendance: 'visible' } });
  assert.deepEqual(await call('host', { action: 'attendees', id }), [{ uid: 'friend', name: 'friend' }]);
  await assert.rejects(call('friend', { action: 'attendees', id }), { code: 'permission-denied' });
  await db.doc('users/friend/following/host').delete();
  assert.deepEqual(await call('host', { action: 'attendees', id }), []);
  await db.doc('users/friend/following/host').set({});
});
test('revocation invalidates reads, attendance, and queued reminders', async () => {
  assert.equal(await plannedSessionReminderAllowed('friend', id, '1'), true);
  await call('host', { action: 'revoke', id, uid: 'friend' });
  await assert.rejects(call('friend', { action: 'get', id }), { code: 'permission-denied' });
  assert.equal(await plannedSessionReminderAllowed('friend', id, '1'), false);
  assert.deepEqual(await call('host', { action: 'attendees', id }), []);
});
test('adult public details are link-readable, discovery and attendance remain gated', async () => {
  communityId = (await call('adult', { action: 'create', session: { ...details, audience: 'community' } })).id;
  const anonymous = await call(undefined, { action: 'get', id: communityId });
  assert.equal(anonymous.session.title, 'Training');
  assert.equal(anonymous.session.ownerUid, '');
  assert.equal(anonymous.mine, null);
  await assert.rejects(call('friend', { action: 'list', scope: 'community' }), { code: 'permission-denied' });
  assert.equal((await call('adult', { action: 'list', scope: 'community' })).length, 1);
  await call('friend', { action: 'save', id: communityId, plan: { saved: true, reminder: true, attendance: 'private' } });
  await assert.rejects(call('friend', { action: 'save', id: communityId, plan: { saved: true, reminder: true, attendance: 'visible' } }), { code: 'permission-denied' });
  await assert.rejects(call('friend', { action: 'attendees', id: communityId }), { code: 'permission-denied' });
});
test('block on either side invalidates private access and reminders', async () => {
  await db.doc('users/friend').update({ blocked_users: ['adult'] });
  await assert.rejects(call('friend', { action: 'get', id: communityId }), { code: 'permission-denied' });
  assert.equal(await plannedSessionReminderAllowed('friend', communityId, '1'), false);
  await db.doc('users/friend').update({ blocked_users: [] });
});
test('edits invalidate old reminders and refresh private plans with latest revision', async () => {
  const updated = { ...details, audience: 'community', startsAt: details.startsAt + 60000, endsAt: details.endsAt + 60000 };
  await call('adult', { action: 'update', id: communityId, session: updated });
  assert.equal(await plannedSessionReminderAllowed('friend', communityId, '1'), false);
  await refreshPlannedSessionPlans.run({ params: { id: communityId } });
  const plan = await db.doc(`users/friend/session_plans/${communityId}`).get();
  assert.equal(plan.data().revision, 2);
  await schedulePlannedSessionReminder.run({ params: { id: communityId, uid: 'friend' }, data: { after: plan } });
  assert.equal(await plannedSessionReminderAllowed('friend', communityId, '2'), true);
});
test('non-owner cannot update/cancel/invite and audience is immutable', async () => {
  await assert.rejects(call('friend', { action: 'cancel', id: communityId }), { code: 'permission-denied' });
  await assert.rejects(call('adult', { action: 'update', id: communityId, session: details }), { code: 'failed-precondition' });
});
test('cancelled sessions stop reminders and reject new plans', async () => {
  await call('adult', { action: 'cancel', id: communityId });
  assert.equal(await plannedSessionReminderAllowed('friend', communityId, '2'), false);
  await assert.rejects(call('friend', { action: 'save', id: communityId, plan: { saved: true, reminder: true, attendance: 'private' } }), { code: 'permission-denied' });
  await call('friend', { action: 'save', id: communityId, plan: { saved: false, reminder: false, attendance: 'private' } });
});
test('direct unauthenticated Firestore reads are denied even for community sessions', async () => {
  const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-pkspot/databases/(default)/documents/planned_sessions/${communityId}`);
  assert.equal(response.status, 403);
});
test('authenticated clients cannot read or forge private plan documents', async () => {
  const { initializeApp, deleteApp } = require('firebase/app');
  const { connectAuthEmulator, getAuth, signInWithCustomToken } = require('firebase/auth');
  const { doc, getDoc, setDoc, getFirestore, connectFirestoreEmulator } = require('firebase/firestore');
  const clientApp = initializeApp({ projectId: 'demo-pkspot', apiKey: 'demo-key' }, 'planned-session-test');
  try {
    const auth = getAuth(clientApp);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    await signInWithCustomToken(auth, await admin.auth().createCustomToken('friend'));
    const client = getFirestore(clientApp);
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
    connectFirestoreEmulator(client, host, Number(port));
    await assert.rejects(getDoc(doc(client, `users/friend/session_plans/${communityId}`)), { code: 'permission-denied' });
    await assert.rejects(getDoc(doc(client, `planned_sessions/${communityId}`)), { code: 'permission-denied' });
    await assert.rejects(setDoc(doc(client, `planned_sessions/${communityId}/attendees/friend`), { uid: 'friend' }), { code: 'permission-denied' });
  } finally { await deleteApp(clientApp); }
});
test('account cleanup removes private plans and owned meeting data', async () => {
  await deletePlannedSessionData('friend');
  assert.equal((await db.collection('users/friend/session_plans').get()).size, 0);
  await deletePlannedSessionData('host');
  assert.equal((await db.doc(`planned_sessions/${id}`).get()).exists, false);
  assert.equal((await db.collection('users/host/session_plans').get()).size, 0);
});
test('invalid payload and disabled rollout fail closed', async () => {
  await assert.rejects(call('host', { action: 'create', session: { ...details, endsAt: details.startsAt - 1 } }), { code: 'invalid-argument' });
  process.env.PLANNED_SESSIONS_ENABLED = 'false';
  await assert.rejects(call('host', { action: 'get', id }), { code: 'failed-precondition' });
});
