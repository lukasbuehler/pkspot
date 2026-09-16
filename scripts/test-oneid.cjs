const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const load = createRequire(require('node:path').resolve('functions/package.json'));
const admin = load('firebase-admin');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required');
Object.assign(process.env, {ONEID_AGE_VERIFICATION_ENABLED: 'true', ONEID_AGE_CHECK_METHOD_APPROVED: 'true', ONEID_CLIENT_ID: 'test-client', ONEID_CLIENT_SECRET: 'test-secret', ONEID_REDIRECT_URI: 'https://pkspot.example/callback'});
admin.initializeApp({projectId: 'demo-pkspot'});
const jose = load('jose');
const issuer = 'https://controller.sandbox.myoneid.co.uk';
const db = admin.firestore();
const originalFetch = global.fetch;
let server, base, keys, jwk, current, nonce, subject = 'same-subject', result = true, failToken = false, expiredToken = false, invalidSignature = false, wrongNonce = false; 
// JOSE v5 uses Node HTTP rather than global.fetch for remote keys. Supply a
// local key resolver only; jwtVerify still checks real signatures and claims.
require.cache[load.resolve('jose')].exports = {
  ...jose, createRemoteJWKSet: () => jose.createLocalJWKSet({keys: [jwk]}),
};
const {beginExternalAgeVerification, oneIdAgeVerificationCallback, oneIdAgeResult} = require('../functions/lib/functions/src/externalAgeVerificationFunctions.js');
before(async () => {
  keys = await jose.generateKeyPair('RS256');
  jwk = {...await jose.exportJWK(keys.publicKey), kid: 'test', alg: 'RS256', use: 'sig'};
  const app = load('express')();
  app.get('/callback', oneIdAgeVerificationCallback);
  server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  base = `http://127.0.0.1:${server.address().port}`;
  global.fetch = async (url, options) => {
    const address = String(url);
    if (address === `${issuer}/.well-known/openid-configuration`) return Response.json({issuer, token_endpoint: `${issuer}/token`, userinfo_endpoint: `${issuer}/userinfo`, jwks_uri: `${issuer}/jwks`});
    if (address === `${issuer}/jwks`) return Response.json({keys: [jwk]});
    if (address === `${issuer}/token`) {
      if (failToken) return Response.json({}, {status: 400});
      const idToken = await new jose.SignJWT({nonce: wrongNonce ? "wrong-nonce" : nonce}).setProtectedHeader({alg: 'RS256', kid: 'test'}).setIssuer(issuer).setAudience('test-client').setSubject('same-subject').setIssuedAt().setExpirationTime(expiredToken ? '0s' : '5m').sign(keys.privateKey);
      return Response.json({access_token: 'test-access', id_token: invalidSignature ? `${idToken.slice(0, idToken.lastIndexOf(".") + 1)}AAAA` : idToken});
    }
    if (address === `${issuer}/userinfo`) return Response.json({sub: subject, age_over_18: result});
    if (address.startsWith(base)) return originalFetch(url, options);
    throw new Error('Unexpected network request');
  };
});
after(async () => { global.fetch = originalFetch; server.closeAllConnections(); server.close(); await db.terminate(); await admin.app().delete(); });
async function begin(uid, age_policy = {}) {
  await db.doc(`users/${uid}`).set({age_policy});
  current = await beginExternalAgeVerification.run({auth: {uid}, data: {provider: 'oneid'}});
  nonce = new URL(current.verification_url).searchParams.get('nonce');
  subject = 'same-subject'; result = true; failToken = false; expiredToken = false; invalidSignature = false; wrongNonce = false;
  return current;
}
function callback(state = new URL(current.verification_url).searchParams.get('state')) {
  return fetch(`${base}/callback?state=${encodeURIComponent(state)}&code=abcdefghijklmnop`);
}
test('OIDC validation accepts a genuinely signed test token with a local key source', async () => {
  await begin('transport');
  const attempt = (await db.doc(`age_assurance_external_attempts/${current.attempt_id}`).get()).data();
  const value = await oneIdAgeResult({clientId: 'test-client', clientSecret: 'test-secret', redirectUri: 'https://pkspot.example/callback', issuer}, nonce, 'abcdefghijklmnop', attempt.code_verifier);
  assert.equal(value.verified, true);
});
test('signed callback preserves participation restrictions and consumes PKCE state', async () => {
  await begin('restricted', {participation_state: 'read_only_age_restricted', required_regulatory_features: ['parental_consent']});
  { const response = await callback(); const body = await response.text(); if (response.status !== 200) console.error(body); assert.equal(response.status, 200, body); }
  const policy = (await db.doc('users/restricted').get()).data().age_policy;
  assert.equal(policy.participation_state, 'read_only_age_restricted');
  assert.deepEqual(policy.required_regulatory_features, ['parental_consent']);
  assert.equal(policy.adult_eligibility, 'verified');
  const attempt = (await db.doc(`age_assurance_external_attempts/${current.attempt_id}`).get()).data();
  assert.equal(attempt.code_verifier, undefined); assert.equal(attempt.nonce, undefined);
  { const response = await callback(); const body = await response.text(); if (response.status !== 200) console.error(body); assert.equal(response.status, 200, body); }
  assert.equal((await db.collection('users/restricted/age_assurance_records').get()).size, 1);
});
test('subject mismatch is rejected and failed attempts can no longer exchange tokens', async () => {
  await begin('mismatch'); subject = 'different-subject';
  assert.equal((await callback()).status, 400);
  assert.equal((await db.doc('users/mismatch').get()).data().age_policy.adult_eligibility, undefined);
  const attempt = (await db.doc(`age_assurance_external_attempts/${current.attempt_id}`).get()).data();
  assert.equal(attempt.outcome, 'failed'); assert.equal(attempt.code_verifier, undefined);
});
test('inconclusive result preserves independent native evidence', async () => {
  const previous = {source: 'ios_declared_age_range', adult_eligibility: 'verified', age_range: {lower: 18}, assurance: {status: 'active', client_integrity: 'apple_app_attest_request_bound', verification_id: 'native-proof'}};
  await begin('native', previous); result = false;
  { const response = await callback(); const body = await response.text(); if (response.status !== 200) console.error(body); assert.equal(response.status, 200, body); }
  assert.deepEqual((await db.doc('users/native').get()).data().age_policy, previous);
  assert.equal((await db.doc('users/native/age_assurance_records/native-proof').get()).exists, false);
});
test('unknown state, expired attempts, expired tokens and token failures cannot grant eligibility', async () => {
  await begin('unknown'); assert.equal((await callback('unknown-state-long-enough')).status, 400);
  await begin('expired-attempt');
  await db.doc(`age_assurance_external_attempts/${current.attempt_id}`).update({expires_at: admin.firestore.Timestamp.fromMillis(0)});
  assert.equal((await callback()).status, 400);
  await begin('expired-token'); expiredToken = true; assert.equal((await callback()).status, 400);
  await begin('token-failure'); failToken = true; assert.equal((await callback()).status, 400);
});
test('invalid signatures and mismatched nonces cannot grant eligibility', async () => {
  await begin('invalid-signature'); invalidSignature = true;
  assert.equal((await callback()).status, 400);
  assert.equal((await db.doc('users/invalid-signature').get()).data().age_policy.adult_eligibility, undefined);
  await begin('wrong-nonce'); wrongNonce = true;
  assert.equal((await callback()).status, 400);
  assert.equal((await db.doc('users/wrong-nonce').get()).data().age_policy.adult_eligibility, undefined);
});
test('callback does not recreate a deleted account', async () => {
  await begin('deleted'); await db.doc('users/deleted').delete();
  assert.equal((await callback()).status, 400);
  assert.equal((await db.doc('users/deleted').get()).exists, false);
});
test('authenticated start is rate limited and requires method approval', async () => {
  await begin('rate');
  await assert.rejects(beginExternalAgeVerification.run({auth: {uid: 'rate'}, data: {provider: 'oneid'}}), {code: 'resource-exhausted'});
  process.env.ONEID_AGE_CHECK_METHOD_APPROVED = 'false';
  await assert.rejects(beginExternalAgeVerification.run({auth: {uid: 'other'}, data: {provider: 'oneid'}}), {code: 'failed-precondition'});
});
