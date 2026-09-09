import {createHash, generateKeyPairSync, sign} from "node:crypto";
import {describe, expect, it} from "vitest";
import {parseAppleAgePayload, verifyAppleAgeAssertion, verifyAppleAgeAttestation} from "../functions/src/appleAgeBinding";
import {buildServerAgePolicy} from "../functions/src/agePolicy";
const signal = {platform: "ios", source: "ios_declared_age_range", available: true,
  response: "shared", ageLower: 18, ageRangeDeclaration: "governmentIDChecked"};
const payload = JSON.stringify({purpose: "pkspot.apple-age.v1", uid: "owner", challengeId: "challenge", nonce: "nonce", signal});

describe("Apple age payload binding", () => {
  it("rejects a payload for a different user, challenge, or nonce", () => {
    expect(parseAppleAgePayload(payload, "owner", "challenge", "nonce").ageLower).toBe(18);
    for (const context of [["other", "challenge", "nonce"], ["owner", "other", "nonce"], ["owner", "challenge", "other"]]) {
      expect(() => parseAppleAgePayload(payload, context[0], context[1], context[2])).toThrow();
    }
  });

  it("verifies the exact payload and refuses tampering and counter replay", () => {
    const key = generateKeyPairSync("ec", {namedCurve: "prime256v1"});
    const authenticatorData = Buffer.alloc(37);
    createHash("sha256").update("WJ3MX3Y7U8.com.pkspot.app").digest().copy(authenticatorData);
    authenticatorData.writeUInt32BE(1, 33);
    const nonce = createHash("sha256").update(Buffer.concat([
      authenticatorData, createHash("sha256").update(payload).digest(),
    ])).digest();
    const signature = sign("sha256", nonce, key.privateKey);
    // Explicit CBOR fixture avoids sharing the production encoder with the test.
    const assertion = Buffer.concat([Buffer.from([0xa2, 0x69]), Buffer.from("signature"),
      Buffer.from([0x58, signature.length]), signature,
      Buffer.from([0x71]), Buffer.from("authenticatorData"), Buffer.from([0x58, 37]), authenticatorData]);
    const publicKey = key.publicKey.export({type: "spki", format: "pem"}).toString();
    expect(verifyAppleAgeAssertion(assertion, payload, publicKey, 0).signCount).toBe(1);
    expect(() => verifyAppleAgeAssertion(assertion, payload.replace('"ageLower":18', '"ageLower":21'), publicKey, 0)).toThrow();
    expect(() => verifyAppleAgeAssertion(assertion, payload, publicKey, 1)).toThrow();
  });

  it("rejects fake attestation and refuses unbound Apple approval", () => {
    expect(() => verifyAppleAgeAttestation(Buffer.from([0xa0]), payload, "fake")).toThrow();
    const native = parseAppleAgePayload(payload, "owner", "challenge", "nonce");
    expect(buildServerAgePolicy(native, {appId: "ios", signalVersion: 3,
      clientIntegrity: "apple_app_attest_request_bound", cryptographicallyBound: true}).adult_eligibility).toBe("verified");
    expect(buildServerAgePolicy(native, {appId: "ios", signalVersion: 2,
      clientIntegrity: "firebase_app_check", cryptographicallyBound: false}).adult_eligibility).toBe("not_verified");
  });
});
