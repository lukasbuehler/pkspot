import {externalVerificationLog, externalVerificationStep} from "./externalAgeVerificationTelemetry";
import {ONEID_PRODUCTS, OneIdProduct} from "../../src/db/utils/external-age-policy";
import {createHash, randomBytes, randomUUID} from "node:crypto";
import * as admin from "firebase-admin";
import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {defineBoolean, defineSecret, defineString} from "firebase-functions/params";
import {createRemoteJWKSet, jwtVerify} from "jose";
import { ONEID_APPROVAL_BASIS, shouldApplyOneIdPolicy, validateOneIdThresholdResult } from "./externalAgeVerificationPolicy";
import type { UserAgePolicySchema } from "../../src/db/schemas/UserSchema";
import {profileAccessFieldsForPrivacy} from "../../src/db/utils/profile-access";

const ATTEMPTS = "age_assurance_external_attempts";
const ATTEMPT_LIFETIME_MS = 10 * 60 * 1000;
const oneIdEnabled = defineBoolean("ONEID_AGE_VERIFICATION_ENABLED", {default: false});
// Approve the configured hosted journey and its threshold-only response contract before enabling.
const oneIdMethodApproved = defineBoolean("ONEID_AGE_CHECK_METHOD_APPROVED", {default: false});
const oneIdProduct = defineString("ONEID_PRODUCT", {default: "age_check"});
const oneIdClientId = defineString("ONEID_CLIENT_ID", {default: ""});
const oneIdRedirectUri = defineString("ONEID_REDIRECT_URI", {default: ""});
const oneIdSandboxTestUids = defineString("ONEID_SANDBOX_TEST_UIDS", {default: ""});
const oneIdReturnUrl = defineString("ONEID_RETURN_URL", {default: "https://pkspot.app/settings/profile?oneid=return"});
const sandboxUserAllowed = (uid: string | undefined): boolean => configuredEnvironment() === "production" ||
  !!uid && oneIdSandboxTestUids.value().split(",").map(value => value.trim()).includes(uid);
const oneIdClientSecret = defineSecret("ONEID_CLIENT_SECRET");

type OneIdEnvironment = "sandbox" | "production";

interface OneIdConfiguration {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  issuer: string;
  product?: OneIdProduct;
}

interface ExternalAttempt {
  locale?: string;
  uid: string;
  provider: "oneid";
  method: "age_check";
  threshold: 18;
  product?: OneIdProduct;
  environment: OneIdEnvironment;
  state_hash: string;
  nonce: string;
  code_verifier: string;
  expires_at: admin.firestore.Timestamp;
  processing_at?: admin.firestore.Timestamp;
  consumed_at?: admin.firestore.Timestamp;
  outcome?: "verified" | "not_verified" | "failed" | "cancelled" | "expired" | "sandbox_verified" | "sandbox_not_verified";
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
  if (!oneIdEnabled.value() || !oneIdMethodApproved.value() || !clientId || !clientSecret || !redirectUri.startsWith("https://")) {
    throw new HttpsError("failed-precondition", "OneID age verification is not configured yet.");
  }
  const product = oneIdProduct.value();
  if (!ONEID_PRODUCTS.some(value => value === product)) throw new HttpsError("failed-precondition", "Unsupported OneID product.");
  return {clientId, clientSecret, redirectUri, product: product as OneIdProduct, issuer: oneIdIssuerFor(configuredEnvironment())};
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
  url.searchParams.set("scope", `openid age_over_18 product:${config.product ?? "age_check"}`);
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", hash(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
};

export const externalAgeVerificationAvailability = onCall(
  {enforceAppCheck: true},
  async request => externalVerificationStep("availability", async () => ({
    providers: [{
      provider: "oneid",
      available: sandboxUserAllowed(request.auth?.uid) && oneIdEnabled.value() && oneIdMethodApproved.value() && Boolean(oneIdClientId.value().trim()) && Boolean(oneIdRedirectUri.value().trim()),
      method: "age_check",
      product: oneIdProduct.value(),
    }],
  })),
);

export const beginExternalAgeVerification = onCall(
  {enforceAppCheck: true, secrets: [oneIdClientSecret]},
  async (request) => externalVerificationStep("start", async () => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const data = isRecord(request.data) ? request.data : {};
    if (data["provider"] !== "oneid") {
      throw new HttpsError("invalid-argument", "Unsupported age verification provider.");
    }
    if (!sandboxUserAllowed(uid)) throw new HttpsError("permission-denied", "This account is not enabled for sandbox testing.");
    const config = oneIdConfiguration();
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(48).toString("base64url");
    const now = admin.firestore.Timestamp.now();
    const attemptRef = admin.firestore().collection(ATTEMPTS).doc();
    await admin.firestore().runTransaction(async transaction => {
      const user = await transaction.get(admin.firestore().doc(`users/${uid}`));
      if (!user.exists) throw new HttpsError("permission-denied", "User account unavailable.");
      const rateRef = admin.firestore().doc(`age_assurance_external_limits/${uid}`);
      const rate = (await transaction.get(rateRef)).data();
      const day = Math.floor(now.toMillis() / 86400000);
      const count = rate?.["day"] === day ? Number(rate["count"]) : 0;
      // Sandbox is restricted to explicitly allowlisted testers and never grants
      // eligibility. Permit repeated integration tests without weakening production.
      const sandbox = configuredEnvironment() === "sandbox";
      const dailyLimit = sandbox ? 100 : 5;
      const cooldownMs = sandbox ? 10_000 : 60_000;
      if (count >= dailyLimit) {
        throw new HttpsError("resource-exhausted", "Daily age verification limit reached. Please try again tomorrow.");
      }
      if (now.toMillis() - Number(rate?.["last_started_ms"] ?? 0) < cooldownMs) {
        throw new HttpsError("resource-exhausted", "Please wait before starting another age check.");
      }
      // A fresh start supersedes an abandoned journey. A late callback must not
      // overwrite a newer verification decision.
      const previousId = rate?.["latest_attempt_id"];
      if (typeof previousId === "string") {
        const previousRef = admin.firestore().collection(ATTEMPTS).doc(previousId);
        const previous = await transaction.get(previousRef);
        if (previous.exists && !previous.data()?.["consumed_at"]) transaction.update(previousRef, {
          outcome: "cancelled", consumed_at: now,
          code_verifier: admin.firestore.FieldValue.delete(), nonce: admin.firestore.FieldValue.delete(),
        });
      }
      transaction.set(rateRef, {day, count: count + 1, last_started_ms: now.toMillis(), latest_attempt_id: attemptRef.id});
      transaction.create(attemptRef, {
        uid,
        provider: "oneid",
        method: "age_check",
        threshold: 18,
        product: config.product,
        locale: verificationLocale(data["locale"]),
        environment: configuredEnvironment(),
        state_hash: hash(state),
        nonce,
        code_verifier: codeVerifier,
        created_at: now,
        expires_at: admin.firestore.Timestamp.fromMillis(now.toMillis() + ATTEMPT_LIFETIME_MS),
      } satisfies ExternalAttempt & {created_at: admin.firestore.Timestamp});
    });
    return {
      attempt_id: attemptRef.id,
      provider: "oneid" as const,
      verification_url: buildOneIdAuthorizationUrl(config, state, nonce, codeVerifier),
    };
  }),
);

const getOneIdOpenIdConfiguration = async (issuer: string): Promise<Record<string, string>> => {
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, {signal: AbortSignal.timeout(10_000), redirect: "error"});
  if (!response.ok) throw new HttpsError("unavailable", "OneID configuration could not be loaded.");
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body["issuer"] !== "string" || body["issuer"] !== issuer ||
      typeof body["token_endpoint"] !== "string" || typeof body["userinfo_endpoint"] !== "string" ||
      typeof body["jwks_uri"] !== "string") {
    throw new HttpsError("failed-precondition", "OneID returned an invalid OIDC configuration.");
  }
  for (const key of ["token_endpoint", "userinfo_endpoint", "jwks_uri"]) {
    const endpoint = new URL(body[key] as string);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.origin !== new URL(issuer).origin) {
      throw new HttpsError("failed-precondition", "OneID returned an unapproved OIDC endpoint.");
    }
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
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
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

export const oneIdAgeResult = async (
  config: OneIdConfiguration,
  nonce: string,
  code: string,
  codeVerifier: string,
): Promise<{verified: boolean; transactionReference: string}> => {
  const oidc = await externalVerificationStep("discovery", () => getOneIdOpenIdConfiguration(config.issuer));
  const tokens = await externalVerificationStep("token_exchange", () => exchangeOneIdCode(config, oidc, code, codeVerifier));
  const verifiedIdToken = await externalVerificationStep("signature", () => jwtVerify(tokens.idToken, createRemoteJWKSet(new URL(oidc["jwks_uri"])), {
    issuer: config.issuer,
    audience: config.clientId,
    requiredClaims: ["iss", "aud", "sub", "iat", "exp", "nonce"],
  }));
  const result = await externalVerificationStep("userinfo", async () => {
    const response = await fetch(oidc["userinfo_endpoint"], {signal: AbortSignal.timeout(10_000), redirect: "error", headers: {Authorization: `Bearer ${tokens.accessToken}`}});
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok || !isRecord(data)) throw new HttpsError("permission-denied", "OneID did not return a usable age result.");
    return data;
  });
  const verified = await externalVerificationStep("subject_binding", async () => validateOneIdThresholdResult(verifiedIdToken.payload, result, nonce));
  return {verified, transactionReference: `oneid:${hash(`${nonce}:${tokens.idToken}`)}`};
};

// Only a language identifier crosses the client boundary, never a return URL.
const verificationLocale = (value: unknown): string =>
  typeof value === "string" && ["en", "de", "fr", "it", "es", "nl"].includes(value) ? value : "en";

export const externalVerificationReturnUrl = (locale?: unknown): string => {
  let url = new URL("https://pkspot.app");
  try {
    const configured = new URL(oneIdReturnUrl.value());
    const local = configuredEnvironment() === "sandbox" && configured.protocol === "http:" && ["localhost", "127.0.0.1"].includes(configured.hostname);
    if ((configured.protocol === "https:" || local) && !configured.username && !configured.password) url = configured;
  } catch { /* Keep the trusted fallback origin. */ }
  url.pathname = `/${verificationLocale(locale)}/settings/account`;
  url.search = "?oneid=return";
  url.hash = "";
  return url.toString();
};
const callbackPage = (message: string, locale?: unknown): string => {
  const href = externalVerificationReturnUrl(locale).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>PK Spot age verification</title><main><h1>PK Spot</h1><p>${message}</p><p><a href="${href}">Return to PK Spot</a></p></main>`;
};

export const oneIdAgeVerificationCallback = onRequest(
  {secrets: [oneIdClientSecret], timeoutSeconds: 60},
  async (request, response) => {
    // The callback state is the secret binding to an authenticated start, not a
    // caller-supplied UID. Never log callback URLs or provider payloads.
    response.set("Cache-Control", "no-store");
    response.set("Referrer-Policy", "no-referrer");
    response.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    externalVerificationLog("callback", "started");
    let returnLocale: unknown;
    const page = (message: string) => callbackPage(message, returnLocale);
    let claimedRef: admin.firestore.DocumentReference | undefined;
    try {
      if (request.method !== "GET") throw new HttpsError("invalid-argument", "Unsupported callback method.");
      const state = requiredQueryString(request.query["state"], "state");
      const attemptSnapshot = await admin.firestore().collection(ATTEMPTS).where("state_hash", "==", hash(state)).limit(1).get();
      if (attemptSnapshot.empty) throw new HttpsError("permission-denied", "Unknown verification attempt.");
      returnLocale = attemptSnapshot.docs[0].data()["locale"];
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
        response.status(200).type("html").send(page("This verification was already received."));
        return;
      }

      claimedRef = attemptRef;
      if (request.query["error"] !== undefined) {
        const cancelled = request.query["error"] === "access_denied" && request.query["error_oneid"] === "OneID.OIDC.Redirect.UserCancelled";
        await attemptRef.update({outcome: cancelled ? "cancelled" : "failed", consumed_at: admin.firestore.Timestamp.now(),
          code_verifier: admin.firestore.FieldValue.delete(), nonce: admin.firestore.FieldValue.delete()});
        externalVerificationLog("provider_return", cancelled ? "cancelled" : "failed");
        response.status(200).type("html").send(page(cancelled ? "Verification was cancelled. You can try again when you are ready." : "The provider could not complete verification. Please return to PK Spot and try again."));
        return;
      }
      const code = requiredQueryString(request.query["code"], "code");
      const config = oneIdConfiguration();
      if (claimed.environment !== configuredEnvironment() || !sandboxUserAllowed(claimed.uid)) throw new HttpsError("failed-precondition", "Verification environment changed. Please start again.");
      if ((claimed.product ?? "age_check") !== config.product) throw new HttpsError("failed-precondition", "Verification configuration changed. Please start again.");
      const result = await oneIdAgeResult(config, claimed.nonce, code, claimed.code_verifier);
      const evaluatedAt = admin.firestore.Timestamp.now();
      const verificationId = randomUUID();
      const userRef = admin.firestore().collection("users").doc(claimed.uid);
      const assurance = {
        signal_version: 3,
        policy_version: 1,
        evidence_strength: result.verified ? "independently_checked" : "unknown",
        confidence: result.verified ? "verified" : "none",
        client_integrity: "server_to_server_oidc",
        method: {provider: "oneid", category: "external_verification", provider_method: config.product},
        approval_basis: ONEID_APPROVAL_BASIS,
        verification_id: verificationId,
        status: "active",
        evaluated_at: evaluatedAt,
        ...(result.verified ? {verified_at: evaluatedAt} : {}),
      };
      await externalVerificationStep("persist_result", () => admin.firestore().runTransaction(async (transaction) => {
        const latestAttempt = await transaction.get(attemptRef);
        if (!latestAttempt.exists || latestAttempt.data()?.["consumed_at"]) return;
        const user = await transaction.get(userRef);
        if (!user.exists) throw new HttpsError("permission-denied", "User account unavailable.");
        if (latestAttempt.data()?.["expires_at"]?.toMillis() <= Date.now()) throw new HttpsError("failed-precondition", "This verification attempt expired.");
        if (claimed.environment === "sandbox") {
          // Test evidence never enters the live policy or its approval audit trail.
          transaction.update(attemptRef, {
            consumed_at: evaluatedAt, outcome: result.verified ? "sandbox_verified" : "sandbox_not_verified",
            code_verifier: admin.firestore.FieldValue.delete(), nonce: admin.firestore.FieldValue.delete(),
          });
          return;
        }
        const previous = user.data()?.["age_policy"] as UserAgePolicySchema | undefined;
        const previousId = previous?.assurance?.verification_id;
        const apply = shouldApplyOneIdPolicy(previous, result.verified);
        const participation = previous?.participation_state ?? "allowed";
        const retainedPolicy = {...previous};
        delete retainedPolicy.age_range;
        transaction.update(attemptRef, {
          consumed_at: evaluatedAt,
          outcome: result.verified ? "verified" : "not_verified",
          code_verifier: admin.firestore.FieldValue.delete(),
          nonce: admin.firestore.FieldValue.delete(),
        });
        if (apply) transaction.update(userRef, {
          age_policy: {
            ...retainedPolicy,
            participation_state: participation, source: "oneid_age_check", platform: "web", reason: "OneID returned an 18+ threshold result",
            adult_eligibility: result.verified ? "verified" : "not_verified", age_band: result.verified ? "18_plus" : "unknown",
            ...(result.verified ? {age_range: {lower: 18}} : {}), assurance,
            signal_updated_at: evaluatedAt,
          },
          ...(result.verified ? {} : profileAccessFieldsForPrivacy("private", false)),
        });
        transaction.create(userRef.collection("age_assurance_records").doc(verificationId), {
          verification_id: verificationId, user_id: claimed.uid, status: "active", outcome: result.verified ? "verified" : "not_verified",
          age_band: result.verified ? "18_plus" : "unknown", participation_state: participation, assurance,
          applied_to_policy: apply,
          source: "oneid_age_check", platform: "web", provider_transaction_reference: result.transactionReference, created_at: evaluatedAt,
        });
        if (apply && typeof previousId === "string" && previousId !== verificationId) {
          transaction.set(userRef.collection("age_assurance_records").doc(previousId), {status: "superseded", superseded_at: evaluatedAt, superseded_by: verificationId}, {merge: true});
        }
      }));
      externalVerificationLog("callback", "succeeded");
      response.status(200).type("html").send(page(claimed.environment === "sandbox" ? "Sandbox test completed. Your real age eligibility has not changed." : result.verified ? "Your 18+ result was recorded." : "OneID could not confirm that you are 18 or older."));
      return;
    } catch (error) {
      externalVerificationLog("callback", "failed", error);
      if (claimedRef) {
        // Token exchange is single-use. Fail this attempt explicitly and erase
        // temporary credentials; a retry starts a fresh PKCE flow.
        await externalVerificationStep("failure_cleanup", () => admin.firestore().runTransaction(async tx => {
          const latest = await tx.get(claimedRef!);
          if (!latest.exists || latest.data()?.["consumed_at"]) return;
          tx.update(claimedRef!, {outcome: "failed", consumed_at: admin.firestore.Timestamp.now(),
            code_verifier: admin.firestore.FieldValue.delete(), nonce: admin.firestore.FieldValue.delete()});
        })).catch(() => undefined);
      }
      const message = error instanceof HttpsError ? error.message : "The verification could not be completed. You can try again from PK Spot.";
      response.status(400).type("html").send(page(message));
      return;
    }
  },
);

/** Owner-only recovery after browser closure, a lost response or a terminated callback. */
export const externalAgeVerificationStatus = onCall(
  {enforceAppCheck: true},
  async request => externalVerificationStep("status", async () => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const db = admin.firestore();
    const rate = (await db.doc(`age_assurance_external_limits/${uid}`).get()).data();
    const id = rate?.["latest_attempt_id"];
    if (typeof id !== "string") return {status: "idle"};
    return db.runTransaction(async tx => {
      const ref = db.collection(ATTEMPTS).doc(id);
      const attempt = (await tx.get(ref)).data() as ExternalAttempt | undefined;
      if (!attempt || attempt.uid !== uid) return {status: "idle"};
      if (attempt.consumed_at) return {status: attempt.outcome ?? "failed"};
      const expired = attempt.expires_at.toMillis() <= Date.now();
      const interrupted = attempt.processing_at && Date.now() - attempt.processing_at.toMillis() > 90_000;
      if (expired || interrupted) {
        const status = expired ? "expired" : "failed";
        tx.update(ref, {outcome: status, consumed_at: admin.firestore.Timestamp.now(),
          code_verifier: admin.firestore.FieldValue.delete(), nonce: admin.firestore.FieldValue.delete()});
        externalVerificationLog("recovery", expired ? "expired" : "failed");
        return {status};
      }
      return {status: attempt.processing_at ? "processing" : "pending"};
    });
  }),
);

export const cleanupExternalAgeVerificationAttempts = onSchedule(
  {schedule: "29 3 * * *", timeZone: "Europe/Zurich"},
  async () => externalVerificationStep("cleanup", async () => {
    const expired = await admin.firestore().collection(ATTEMPTS)
      .where("expires_at", "<=", admin.firestore.Timestamp.now()).limit(500).get();
    if (expired.empty) return;
    const batch = admin.firestore().batch();
    expired.docs.forEach((attempt) => batch.delete(attempt.ref));
    await batch.commit();
  }),
);
