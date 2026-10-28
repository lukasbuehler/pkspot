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
test('editing a community event preserves RSVP aggregates and legacy missing totals', async () => {
  const uid = 'community-organizer';
  await db.doc(`users/${uid}`).set({
    public_profile_enabled: true,
    age_policy: { adult_eligibility: 'verified', age_range: { lower: 18 },
      assurance: { status: 'active', approval_basis: 'tested', client_integrity: 'apple_app_attest_request_bound' } },
  });
  const details = {...input, locality: 'Zurich', countryCode: 'CH', visibility: 'public'};
  const {eventId} = await call('createCommunityEvent', uid, details);
  const ref = db.doc(`events/${eventId}`);
  const counts = {going: 3, interested: 2, notgoing: 1, total: 6};
  await ref.update({rsvp_counts: counts});
  await call('updateCommunityEvent', uid, {eventId, event: {...details, name: 'Updated Jam'}});
  assert.deepEqual((await ref.get()).data().rsvp_counts, counts);
  assert.equal((await ref.get()).data().name, 'Updated Jam');
  await ref.update({rsvp_counts: admin.firestore.FieldValue.delete()});
  await call('updateCommunityEvent', uid, {eventId, event: details});
  assert.equal((await ref.get()).data().rsvp_counts, undefined);
});
after(async () => { await admin.app().delete(); });
test('unverified admin creates formal event; ordinary unverified user cannot', async () => {
  await db.doc('users/author-admin').set({is_admin:true});
  await db.doc('users/author-user').set({is_admin:false});
  const result = await call('createFormalEvent', 'author-admin', input);
  const event = (await db.doc(`events/${result.eventId}`).get()).data();
  assert.equal(event.listing_tier, 'formal');
  assert.match(result.slug, /^[a-z0-9-]+$/);
  assert.equal(event.slug, result.slug);
  assert.equal((await db.doc(`event_slugs/${result.slug}`).get()).data().event_id, result.eventId);
  await assert.rejects(call('createFormalEvent', 'author-user', input), {code:'permission-denied'});
});
test('unverified user submits a private suggestion and staff can review it', async () => {
  const result = await call('submitEventSuggestion', 'author-user', input);
  assert.equal((await db.doc(`event_suggestions/${result.suggestionId}`).get()).data().status, 'submitted');
  await call('reviewEventSuggestion', 'author-admin', {suggestionId:result.suggestionId, outcome:'rejected'});
  assert.equal((await db.doc(`event_suggestions/${result.suggestionId}`).get()).data().status, 'rejected');
  await assert.rejects(call('submitEventSuggestion', undefined, input), {code:'unauthenticated'});
});

test('staff approval preserves source links and records one review atomically', async () => {
  const result=await call('submitEventSuggestion','author-user',{...input,name:'Source-backed jam',sourceUrl:'https://example.test/jam',countryCode:'CH'});
  await assert.rejects(call('reviewEventSuggestion','author-user',{suggestionId:result.suggestionId,outcome:'approved'}),{code:'permission-denied'});
  const approved=await call('reviewEventSuggestion','author-admin',{suggestionId:result.suggestionId,outcome:'approved',note:'Source verified'});
  const event=(await db.doc(`events/${approved.eventId}`).get()).data();
  assert.equal(event.url,'https://example.test/jam');
  assert.deepEqual(event.event_links,[{label:'Event source',url:'https://example.test/jam',kind:'website'}]);
  assert.equal(event.country_code,'CH');
  assert.equal(event.published,true);
  const suggestion=(await db.doc(`event_suggestions/${result.suggestionId}`).get()).data();
  assert.equal(suggestion.review.event_id,approved.eventId);
  assert.equal(suggestion.review.note,'Source verified');
  await assert.rejects(call('reviewEventSuggestion','author-admin',{suggestionId:result.suggestionId,outcome:'approved'}),{code:'failed-precondition'});
});

test('the private suggestion queue is admin-only, paginated and returns ISO dates', async () => {
  await assert.rejects(call('listEventSuggestions',undefined,{}),{code:'unauthenticated'});
  await assert.rejects(call('listEventSuggestions','author-user',{}),{code:'permission-denied'});
  await assert.rejects(call('listEventSuggestions','author-admin',{status:'all'}),{code:'invalid-argument'});
  const timestamp=admin.firestore.Timestamp.fromDate(new Date('2030-01-01T12:00:00Z'));
  const batch=db.batch();
  for(let i=0;i<55;i++) batch.set(db.doc(`event_suggestions/page-${String(i).padStart(2,'0')}`),{
    name:`Queued jam ${i}`,submitter_id:'author-user',status:'submitted',start:timestamp,end:timestamp,time_created:timestamp,time_updated:timestamp,
  });
  await batch.commit();
  const first=await call('listEventSuggestions','author-admin',{status:'submitted'});
  assert.equal(first.items.length,50);assert.ok(first.nextCursor);
  assert.equal(typeof first.items[0].start,'string');assert.equal(typeof first.items[0].time_created,'string');
  // Reviewing the last visible row must not break the next-page cursor.
  await db.doc(`event_suggestions/${first.nextCursor}`).update({status:'rejected'});
  const second=await call('listEventSuggestions','author-admin',{status:'submitted',cursor:first.nextCursor});
  assert.ok(second.items.length>=5);
  const ids=new Set(first.items.map(item=>item.id));
  assert.ok(second.items.every(item=>!ids.has(item.id)));
  const history=await call('listEventSuggestions','author-admin',{status:'approved'});
  assert.ok(history.items.some(item=>item.review?.note==='Source verified'));
  assert.equal(typeof history.items[0].review.reviewed_at,'string');
});

test('custom event slug is reserved atomically and invalid or duplicate slugs do not create events', async () => {
  await db.doc('users/slug-admin').set({is_admin:true});
  const result = await call('createFormalEvent', 'slug-admin', {...input, slug:'chosen-jam-26'});
  assert.equal(result.slug, 'chosen-jam-26');
  assert.equal((await db.doc(`event_slugs/${result.slug}`).get()).data().event_id, result.eventId);
  const before = (await db.collection('events').get()).size;
  await assert.rejects(call('createFormalEvent', 'slug-admin', {...input, slug:result.slug}), {code:'already-exists'});
  for (const slug of ['new', 'sessions', 'UpperCase', 'invalid/path', 'x'.repeat(161)]) {
    await assert.rejects(call('createFormalEvent', 'slug-admin', {...input, slug}), {code:'invalid-argument'});
  }
  assert.equal((await db.collection('events').get()).size, before);
});
