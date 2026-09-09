import {createHash, randomBytes, randomUUID} from "node:crypto";
import * as admin from "firebase-admin";
import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {defineBoolean, defineSecret, defineString} from "firebase-functions/params";
import {createRemoteJWKSet, jwtVerify} from "jose";
import {profileAccessFieldsForPrivacy} from "../../src/db/utils/profile-access";

const ATTEMPTS = "age_assurance_external_attempts";
const ATTEMPT_LIFETIME_MS = 10 * 60 * 1000;
const oneIdEnabled = defineBoolean("ONEID_AGE_VERIFICATION_ENABLED", {default: false});
const oneIdClientId = defineString("ONEID_CLIENT_ID", {default: ""});
const oneIdRedirectUri = defineString("ONEID_REDIRECT_URI", {default: ""});
const oneIdClientSecret = defineSecret("ONEID_CLIENT_SECRET");

type OneIdEnvironment = "sandbox" | "production";

interface OneIdConfiguration {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  issuer: string;
}

interface ExternalAttempt {
  uid: string;
  provider: "oneid";
  method: "age_check";
  threshold: 18;
  state_hash: string;
  nonce: string;
  code_verifier: string;
  expires_at: admin.firestore.Timestamp;
  processing_at?: admin.firestore.Timestamp;
  consumed_at?: admin.firestore.Timestamp;
  outcome?: "verified" | "not_verified" | "failed";
}

const hash = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("base64url");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const configuredEnvironment = (): OneIdEnvironment =>
  process.env.ONEID_ENVIRONMENT === "production" ? "production" : "sandbox";

export const oneIdIssuerFor = (environment: OneIdEnvironment): string =>
  environment === "production" ?
    "https://controller.myoneid.co.uk" :
    "https://controller.sandbox.myoneid.co.uk";

const oneIdConfiguration = (): OneIdConfiguration => {
  const clientId = oneIdClientId.value().trim();
  const redirectUri = oneIdRedirectUri.value().trim();
  const clientSecret = oneIdClientSecret.value().trim();
  if (!oneIdEnabled.value() || !clientId || !clientSecret || !redirectUri.startsWith("https://")) {
    throw new HttpsError("failed-precondition", "OneID age verification is not configured yet.");
  }
  return {clientId, clientSecret, redirectUri, issuer: oneIdIssuerFor(configuredEnvironment())};
};

const requiredQueryString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.length < 16 || value.length > 2048) {
    throw new HttpsError("invalid-argument", `Invalid ${field}.`);
  }
  return value;
};

export const buildOneIdAuthorizationUrl = (
  config: Omit<OneIdConfiguration, "clientSecret">,
  state: string,
  nonce: string,
  codeVerifier: string,
): string => {
  const url = new URL(`${config.issuer}/v2/authorize`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  // Request only a threshold result. Never request profile, identity, DOB, contact, or account scopes.
  url.searchParams.set("scope", "openid age_over_18 product:age_check");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", hash(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
};

export const externalAgeVerificationAvailability = onCall(
  {enforceAppCheck: true},
  async () => ({
    providers: [{
      provider: "oneid",
      available: oneIdEnabled.value() && Boolean(oneIdClientId.value().trim()) && Boolean(oneIdRedirectUri.value().trim()),
      method: "age_check",
    }],
  }),
);

export const beginExternalAgeVerification = onCall(
  {enforceAppCheck: true, secrets: [oneIdClientSecret]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const data = isRecord(request.data) ? request.data : {};
    if (data["provider"] !== "oneid") {
      throw new HttpsError("invalid-argument", "Unsupported age verification provider.");
    }
    const config = oneIdConfiguration();
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(48).toString("base64url");
    const now = admin.firestore.Timestamp.now();
    const attemptRef = admin.firestore().collection(ATTEMPTS).doc();
    await attemptRef.create({
      uid,
      provider: "oneid",
      method: "age_check",
      threshold: 18,
      state_hash: hash(state),
      nonce,
      code_verifier: codeVerifier,
      created_at: now,
      expires_at: admin.firestore.Timestamp.fromMillis(now.toMillis() + ATTEMPT_LIFETIME_MS),
    } satisfies ExternalAttempt & {created_at: admin.firestore.Timestamp});
    return {
      attempt_id: attemptRef.id,
      provider: "oneid" as const,
      verification_url: buildOneIdAuthorizationUrl(config, state, nonce, codeVerifier),
    };
  },
);

const getOneIdOpenIdConfiguration = async (issuer: string): Promise<Record<string, string>> => {
  const response = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!response.ok) throw new HttpsError("unavailable", "OneID configuration could not be loaded.");
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body["issuer"] !== "string" || body["issuer"] !== issuer ||
      typeof body["token_endpoint"] !== "string" || typeof body["userinfo_endpoint"] !== "string" ||
      typeof body["jwks_uri"] !== "string") {
    throw new HttpsError("failed-precondition", "OneID returned an invalid OIDC configuration.");
  }
  return body as Record<string, string>;
};

const exchangeOneIdCode = async (
  config: OneIdConfiguration,
  oidc: Record<string, string>,
  code: string,
  codeVerifier: string,
): Promise<{accessToken: string; idToken: string}> => {
  const body = new URLSearchParams({grant_type: "authorization_code", code, code_verifier: codeVerifier, redirect_uri: config.redirectUri});
  const response = await fetch(oidc["token_endpoint"], {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
    },
    body,
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok || !isRecord(payload) || typeof payload["access_token"] !== "string" || typeof payload["id_token"] !== "string") {
    throw new HttpsError("permission-denied", "OneID did not accept this verification response.");
  }
  return {accessToken: payload["access_token"], idToken: payload["id_token"]};
};

const oneIdAgeResult = async (
  config: OneIdConfiguration,
  nonce: string,
  code: string,
  codeVerifier: string,
): Promise<{verified: boolean; transactionReference: string}> => {
  const oidc = await getOneIdOpenIdConfiguration(config.issuer);
  const tokens = await exchangeOneIdCode(config, oidc, code, codeVerifier);
  const verifiedIdToken = await jwtVerify(tokens.idToken, createRemoteJWKSet(new URL(oidc["jwks_uri"])), {
    issuer: config.issuer,
    audience: config.clientId,
  });
  if (verifiedIdToken.payload["nonce"] !== nonce) {
    throw new HttpsError("permission-denied", "OneID returned a mismatched verification response.");
  }
  const response = await fetch(oidc["userinfo_endpoint"], {headers: {Authorization: `Bearer ${tokens.accessToken}`}});
  const result: unknown = await response.json().catch(() => ({}));
  if (!response.ok || !isRecord(result) || typeof result["sub"] !== "string" || typeof result["age_over_18"] !== "boolean") {
    throw new HttpsError("permission-denied", "OneID did not return a usable age result.");
  }
  return {verified: result["age_over_18"], transactionReference: `oneid:${hash(result["sub"])}`};
};

const callbackPage = (message: string): string => `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>PK Spot age verification</title><main><h1>PK Spot</h1><p>${message}</p><p>You can return to the app.</p></main>`;

export const oneIdAgeVerificationCallback = onRequest(
  {secrets: [oneIdClientSecret], timeoutSeconds: 60},
  async (request, response) => {
    try {
      const state = requiredQueryString(request.query["state"], "state");
      const code = requiredQueryString(request.query["code"], "code");
      const attemptSnapshot = await admin.firestore().collection(ATTEMPTS).where("state_hash", "==", hash(state)).limit(1).get();
      if (attemptSnapshot.empty) throw new HttpsError("permission-denied", "Unknown verification attempt.");
      const attemptRef = attemptSnapshot.docs[0].ref;
      const now = admin.firestore.Timestamp.now();
      const claimed = await admin.firestore().runTransaction(async (transaction) => {
        const snapshot = await transaction.get(attemptRef);
        const attempt = snapshot.data() as ExternalAttempt | undefined;
        if (!attempt || attempt.provider !== "oneid" || attempt.method !== "age_check" || attempt.threshold !== 18 ||
            !(attempt.expires_at instanceof admin.firestore.Timestamp) || attempt.expires_at.toMillis() <= now.toMillis()) {
          throw new HttpsError("failed-precondition", "This verification attempt expired.");
        }
        if (attempt.consumed_at) return null;
        if (attempt.processing_at) throw new HttpsError("already-exists", "This verification response is already being processed.");
        transaction.update(attemptRef, {processing_at: now});
        return attempt;
      });
      if (!claimed) {
        response.status(200).type("html").send(callbackPage("This verification was already received."));
        return;
      }

      const config = oneIdConfiguration();
      const result = await oneIdAgeResult(config, claimed.nonce, code, claimed.code_verifier);
      const evaluatedAt = admin.firestore.Timestamp.now();
      const verificationId = randomUUID();
      const userRef = admin.firestore().collection("users").doc(claimed.uid);
      const assurance = {
        signal_version: 3,
        policy_version: 1,
        evidence_strength: result.verified ? "verified_identity" : "unknown",
        confidence: result.verified ? "strongly_verified" : "none",
        client_integrity: "server_to_server_oidc",
        method: {provider: "oneid", category: "financial_attribute", provider_method: "age_check"},
        approval_basis: "oneid:financial_attribute:age_check:server_to_server_oidc:v1",
        verification_id: verificationId,
        status: "active",
        evaluated_at: evaluatedAt,
        ...(result.verified ? {verified_at: evaluatedAt} : {}),
      };
      await admin.firestore().runTransaction(async (transaction) => {
        const latestAttempt = await transaction.get(attemptRef);
        if (!latestAttempt.exists || latestAttempt.data()?.["consumed_at"]) return;
        const user = await transaction.get(userRef);
        const previousId = user.data()?.["age_policy"]?.["assurance"]?.["verification_id"];
        transaction.update(attemptRef, {
          consumed_at: evaluatedAt,
          outcome: result.verified ? "verified" : "not_verified",
          code_verifier: admin.firestore.FieldValue.delete(),
          nonce: admin.firestore.FieldValue.delete(),
        });
        transaction.set(userRef, {
          age_policy: {
            participation_state: "allowed", source: "oneid_age_check", platform: "web", reason: "OneID returned an 18+ threshold result",
            adult_eligibility: result.verified ? "verified" : "not_verified", age_band: result.verified ? "18_plus" : "unknown",
            age_range: result.verified ? {lower: 18} : admin.firestore.FieldValue.delete(), assurance,
            signal_updated_at: evaluatedAt,
          },
          ...(result.verified ? {} : profileAccessFieldsForPrivacy("private", false)),
        }, {merge: true});
        transaction.create(userRef.collection("age_assurance_records").doc(verificationId), {
          verification_id: verificationId, user_id: claimed.uid, status: "active", outcome: result.verified ? "verified" : "not_verified",
          age_band: result.verified ? "18_plus" : "unknown", participation_state: "allowed", assurance,
          source: "oneid_age_check", platform: "web", provider_transaction_reference: result.transactionReference, created_at: evaluatedAt,
        });
        if (typeof previousId === "string" && previousId !== verificationId) {
          transaction.set(userRef.collection("age_assurance_records").doc(previousId), {status: "superseded", superseded_at: evaluatedAt, superseded_by: verificationId}, {merge: true});
        }
      });
      response.status(200).type("html").send(callbackPage(result.verified ? "Your 18+ result was recorded." : "OneID could not confirm that you are 18 or older."));
      return;
    } catch (error) {
      const message = error instanceof HttpsError ? error.message : "The verification could not be completed. You can try again from PK Spot.";
      response.status(400).type("html").send(callbackPage(message));
      return;
    }
  },
);

export const cleanupExternalAgeVerificationAttempts = onSchedule(
  {schedule: "29 3 * * *", timeZone: "Europe/Zurich"},
  async () => {
    const expired = await admin.firestore().collection(ATTEMPTS)
      .where("expires_at", "<=", admin.firestore.Timestamp.now()).limit(500).get();
    if (expired.empty) return;
    const batch = admin.firestore().batch();
    expired.docs.forEach((attempt) => batch.delete(attempt.ref));
    await batch.commit();
  },
);
