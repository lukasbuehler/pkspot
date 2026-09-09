import {X509Certificate} from "node:crypto";
import {decodeAllSync} from "cbor";
import {verifyAssertion, verifyAttestation} from "node-app-attest";
import {sanitizeNativeAgeSignal} from "./agePolicy";

export const APPLE_AGE_APP_ID = "1:294969617102:ios:09f0254997b55369313e9f";
const identity = {bundleIdentifier: "com.pkspot.app", teamIdentifier: "WJ3MX3Y7U8"};
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function parseAppleAgePayload(payload: string, uid: string, challengeId: string, nonce: string) {
  const body: unknown = JSON.parse(payload);
  if (!record(body) || body["purpose"] !== "pkspot.apple-age.v1" ||
      body["uid"] !== uid || body["challengeId"] !== challengeId || body["nonce"] !== nonce) {
    throw new Error("Apple age request context mismatch");
  }
  const signal = sanitizeNativeAgeSignal(body["signal"]);
  if (signal.platform !== "ios" || signal.source !== "ios_declared_age_range") {
    throw new Error("Apple age signal platform mismatch");
  }
  return signal;
}

export function verifyAppleAgeAttestation(attestation: Buffer, payload: string, keyId: string) {
  const envelopes: unknown[] = decodeAllSync(attestation);
  const envelope = envelopes[0];
  const statement = record(envelope) ? envelope["attStmt"] : undefined;
  const certificates = record(statement) ? statement["x5c"] : undefined;
  if (envelopes.length !== 1 || !Array.isArray(certificates) || certificates.length !== 2) {
    throw new Error("Invalid Apple attestation envelope");
  }
  // Supplement the library's signature/root/nonce checks with certificate time checks.
  for (const raw of certificates) {
    if (!Buffer.isBuffer(raw)) throw new Error("Invalid certificate");
    const cert = new X509Certificate(raw);
    if (Date.parse(cert.validFrom) > Date.now() || Date.parse(cert.validTo) <= Date.now()) {
      throw new Error("Expired or not-yet-valid Apple certificate");
    }
  }
  const result: unknown = verifyAttestation({attestation, challenge: payload, keyId, ...identity,
    allowDevelopmentEnvironment: false});
  if (!record(result) || typeof result["publicKey"] !== "string") throw new Error("Invalid attested key");
  return {publicKey: result["publicKey"]};
}

export function verifyAppleAgeAssertion(assertion: Buffer, payload: string, publicKey: string, signCount: number) {
  const envelopes: unknown[] = decodeAllSync(assertion);
  const envelope = envelopes[0];
  if (envelopes.length !== 1 || !record(envelope) ||
      !Buffer.isBuffer(envelope["authenticatorData"]) || envelope["authenticatorData"].length !== 37 ||
      !Buffer.isBuffer(envelope["signature"])) throw new Error("Invalid Apple assertion envelope");
  const result: unknown = verifyAssertion({assertion, payload, publicKey, signCount, ...identity});
  if (!record(result) || typeof result["signCount"] !== "number" ||
      !Number.isSafeInteger(result["signCount"]) || result["signCount"] <= signCount) {
    throw new Error("Invalid assertion counter");
  }
  return {signCount: result["signCount"]};
}
