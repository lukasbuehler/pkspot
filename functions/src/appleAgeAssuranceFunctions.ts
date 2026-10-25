import {createHash, randomBytes, randomUUID} from "node:crypto";
import * as admin from "firebase-admin";
import {defineBoolean} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {buildServerAgePolicy} from "./agePolicy";
import {APPLE_AGE_APP_ID, parseAppleAgePayload, verifyAppleAgeAssertion, verifyAppleAgeAttestation} from "./appleAgeBinding";
import {profileAccessFieldsForPrivacy} from "../../src/db/utils/profile-access";

const enabled = defineBoolean("APPLE_BOUND_AGE_ENABLED", {default: false});
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const text = (value: unknown, max: number): string => {
  if (typeof value !== "string" || !value.length || value.length > max) throw new HttpsError("invalid-argument", "Invalid Apple age request");
  return value;
};
function requireApple(request: {auth?: {uid: string}; app?: {appId: string}}): string {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first");
  if (request.app?.appId !== APPLE_AGE_APP_ID) throw new HttpsError("permission-denied", "Verified PK Spot iOS app required");
  if (!enabled.value()) throw new HttpsError("failed-precondition", "Apple age verification is not enabled yet");
  return request.auth.uid;
}
const keyRef = (uid: string, keyId: string) => admin.firestore().doc(`users/${uid}/apple_age_keys/${hash(keyId)}`);

export const beginAppleAgeAssurance = onCall({enforceAppCheck: true}, async (request) => {
  const uid = requireApple(request);
  const keyId = text(request.data?.key_id, 128);
  const challenge = admin.firestore().doc(`age_assurance_challenges/apple-${hash(uid)}`);
  const nonce = randomBytes(32).toString("base64url");
  const registered = (await keyRef(uid, keyId).get()).exists;
  await admin.firestore().runTransaction(async (tx) => {
    const previous = await tx.get(challenge);
    if ((previous.data()?.created_at?.toMillis?.() ?? 0) > Date.now() - 5000) {
      throw new HttpsError("resource-exhausted", "Please wait before trying again");
    }
    tx.set(challenge, {uid, app_id: APPLE_AGE_APP_ID, platform: "ios", key_id: keyId,
      nonce_hash: hash(nonce), created_at: admin.firestore.Timestamp.now(),
      expires_at: admin.firestore.Timestamp.fromMillis(Date.now() + 5 * 60_000)});
  });
  return {challenge_id: challenge.id, challenge_nonce: nonce, key_registered: registered};
});

export const finishAppleAgeAssurance = onCall({enforceAppCheck: true, timeoutSeconds: 60}, async (request) => {
  const uid = requireApple(request);
  const keyId = text(request.data?.key_id, 128);
  const payload = text(request.data?.payload, 16_000);
  const encoded = text(request.data?.proof, 32_000);
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) throw new HttpsError("invalid-argument", "Invalid proof encoding");
  const proof = Buffer.from(encoded, "base64");
  const challengeId = `apple-${hash(uid)}`;
  const challengeRef = admin.firestore().doc(`age_assurance_challenges/${challengeId}`);
  const verificationId = randomUUID();
  const evaluatedAt = admin.firestore.Timestamp.now();
  const userRef = admin.firestore().doc(`users/${uid}`);
  return admin.firestore().runTransaction(async (tx) => {
    const [challenge, key, user] = await Promise.all([tx.get(challengeRef), tx.get(keyRef(uid, keyId)), tx.get(userRef)]);
    const state = challenge.data();
    let body: {nonce?: unknown};
    try { body = JSON.parse(payload); } catch { throw new HttpsError("invalid-argument", "Invalid payload"); }
    if (!body || typeof body.nonce !== "string" || !state || state.uid !== uid || state.key_id !== keyId ||
        state.consumed_at || !(state.expires_at instanceof admin.firestore.Timestamp) ||
        state.expires_at.toMillis() <= Date.now() || state.nonce_hash !== hash(body.nonce)) {
      throw new HttpsError("failed-precondition", "Apple age challenge expired or already used");
    }
    if (!user.exists) throw new HttpsError("failed-precondition", "User profile is missing");
    let signal;
    let publicKey: string;
    let counter: number;
    try {
      signal = parseAppleAgePayload(payload, uid, challengeId, body.nonce);
      if (key.exists) {
        publicKey = key.data()!.public_key;
        counter = verifyAppleAgeAssertion(proof, payload, publicKey, key.data()!.counter).signCount;
      } else {
        publicKey = verifyAppleAgeAttestation(proof, payload, keyId).publicKey;
        counter = 0;
      }
    } catch { throw new HttpsError("permission-denied", "Apple age proof could not be verified"); }
    const policy = buildServerAgePolicy(signal, {appId: APPLE_AGE_APP_ID, signalVersion: 3,
      clientIntegrity: "apple_app_attest_request_bound", cryptographicallyBound: true});
    const assurance = {...policy.assurance, verification_id: verificationId, status: "active", evaluated_at: evaluatedAt,
      ...(policy.adult_eligibility === "verified" ? {verified_at: evaluatedAt} : {})};
    const previous = user.data()?.age_policy;
    const inconclusive = !signal.available || signal.response !== "shared";
    // A declined/unavailable request records an attempt, never erases independent evidence.
    tx.update(challengeRef, {consumed_at: evaluatedAt});
    tx.set(key.ref, {public_key: publicKey, counter, updated_at: evaluatedAt});
    tx.create(userRef.collection("age_assurance_records").doc(verificationId), {
      verification_id: verificationId, user_id: uid, source: policy.source, platform: "ios",
      outcome: policy.adult_eligibility, status: inconclusive ? "inconclusive" : "active",
      assurance, created_at: evaluatedAt,
    });
    if (!inconclusive) {
      tx.set(userRef, {age_policy: {...policy, assurance: {...assurance,
        ...(policy.adult_eligibility === "verified" ? {} : {approval_basis: admin.firestore.FieldValue.delete()})}, signal_updated_at: evaluatedAt},
      ...(policy.adult_eligibility === "verified" ? {} : profileAccessFieldsForPrivacy("private", false))}, {merge: true});
      const previousId = previous?.assurance?.verification_id;
      if (typeof previousId === "string") tx.set(userRef.collection("age_assurance_records").doc(previousId),
        {status: "superseded", superseded_at: evaluatedAt, superseded_by: verificationId}, {merge: true});
    }
    const result = inconclusive && previous ? previous : policy;
    return {ok: true, adult_eligibility: result.adult_eligibility ?? "not_verified",
      participation_state: result.participation_state ?? "allowed", age_band: result.age_band ?? "unknown",
      evidence_strength: result.assurance?.evidence_strength ?? "unknown"};
  });
});
