import { describe, expect, it } from "vitest";
import { verifyPlayIntegrityPayload } from "../functions/src/playIntegrity";

const validPayload = (now: number) => ({
  requestDetails: {
    requestPackageName: "com.pkspot.app",
    requestHash: "bound-request-hash",
    timestampMillis: String(now - 1_000),
  },
  appIntegrity: {
    appRecognitionVerdict: "PLAY_RECOGNIZED",
    packageName: "com.pkspot.app",
    certificateSha256Digest: ["release-certificate"],
    versionCode: "17",
  },
  deviceIntegrity: {
    deviceRecognitionVerdict: ["MEETS_DEVICE_INTEGRITY"],
  },
  accountDetails: {
    appLicensingVerdict: "LICENSED",
  },
});

describe("Play Integrity verdict verification", () => {
  it("accepts a fresh, bound, licensed Play installation", () => {
    const now = Date.now();
    expect(
      verifyPlayIntegrityPayload(
        validPayload(now),
        "bound-request-hash",
        now,
      ),
    ).toMatchObject({
      package_name: "com.pkspot.app",
      app_recognition: "PLAY_RECOGNIZED",
      app_licensing: "LICENSED",
      device_recognition: "MEETS_DEVICE_INTEGRITY",
      version_code: "17",
    });
  });

  it.each([
    [
      "a modified payload",
      (payload: ReturnType<typeof validPayload>) => {
        payload.requestDetails.requestHash = "different";
      },
    ],
    [
      "an unrecognized app",
      (payload: ReturnType<typeof validPayload>) => {
        payload.appIntegrity.appRecognitionVerdict = "UNRECOGNIZED_VERSION";
      },
    ],
    [
      "an unlicensed account",
      (payload: ReturnType<typeof validPayload>) => {
        payload.accountDetails.appLicensingVerdict = "UNLICENSED";
      },
    ],
    [
      "a compromised device",
      (payload: ReturnType<typeof validPayload>) => {
        payload.deviceIntegrity.deviceRecognitionVerdict = [];
      },
    ],
  ])("rejects %s", (_name, mutate) => {
    const now = Date.now();
    const payload = validPayload(now);
    mutate(payload);
    expect(() =>
      verifyPlayIntegrityPayload(
        payload,
        "bound-request-hash",
        now,
      ),
    ).toThrow();
  });

  it("rejects stale verdicts", () => {
    const now = Date.now();
    const payload = validPayload(now);
    payload.requestDetails.timestampMillis = String(now - 180_000);
    expect(() =>
      verifyPlayIntegrityPayload(
        payload,
        "bound-request-hash",
        now,
      ),
    ).toThrow("no longer fresh");
  });
});
