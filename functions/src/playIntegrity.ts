import {HttpsError} from "firebase-functions/v2/https";
import {GoogleAuth} from "google-auth-library";

const PLAY_INTEGRITY_SCOPE =
  "https://www.googleapis.com/auth/playintegrity";
const PLAY_INTEGRITY_PACKAGE = "com.pkspot.app";
const MAX_VERDICT_AGE_MS = 2 * 60 * 1000;

interface PlayIntegrityTokenPayload {
  requestDetails?: {
    requestPackageName?: unknown;
    requestHash?: unknown;
    timestampMillis?: unknown;
  };
  appIntegrity?: {
    appRecognitionVerdict?: unknown;
    packageName?: unknown;
    certificateSha256Digest?: unknown;
    versionCode?: unknown;
  };
  deviceIntegrity?: {
    deviceRecognitionVerdict?: unknown;
  };
  accountDetails?: {
    appLicensingVerdict?: unknown;
  };
}

interface DecodeIntegrityTokenResponse {
  tokenPayloadExternal?: PlayIntegrityTokenPayload;
}

export interface VerifiedPlayIntegrityVerdict {
  package_name: typeof PLAY_INTEGRITY_PACKAGE;
  app_recognition: "PLAY_RECOGNIZED";
  app_licensing: "LICENSED";
  device_recognition: "MEETS_DEVICE_INTEGRITY";
  certificate_sha256_digests: string[];
  version_code?: string;
  verdict_timestamp_ms: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredRecord = (
  value: unknown,
  field: string
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new HttpsError(
      "failed-precondition",
      `Play Integrity did not return ${field}.`
    );
  }
  return value;
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ?
    value.filter((item): item is string => typeof item === "string") :
    [];

const timestampMillis = (value: unknown): number => {
  const parsed =
    typeof value === "number" ?
      value :
      typeof value === "string" ?
        Number(value) :
        Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new HttpsError(
      "failed-precondition",
      "Play Integrity returned an invalid timestamp."
    );
  }
  return parsed;
};

export const verifyPlayIntegrityPayload = (
  value: unknown,
  expectedRequestHash: string,
  nowMs = Date.now()
): VerifiedPlayIntegrityVerdict => {
  const payload = requiredRecord(value, "a token payload");
  const requestDetails = requiredRecord(
    payload["requestDetails"],
    "request details"
  );
  const appIntegrity = requiredRecord(
    payload["appIntegrity"],
    "app integrity"
  );
  const deviceIntegrity = requiredRecord(
    payload["deviceIntegrity"],
    "device integrity"
  );
  const accountDetails = requiredRecord(
    payload["accountDetails"],
    "account details"
  );

  if (
    requestDetails["requestPackageName"] !== PLAY_INTEGRITY_PACKAGE ||
    requestDetails["requestHash"] !== expectedRequestHash
  ) {
    throw new HttpsError(
      "permission-denied",
      "The integrity verdict does not match this request."
    );
  }

  const verdictTimestampMs = timestampMillis(
    requestDetails["timestampMillis"]
  );
  if (
    verdictTimestampMs > nowMs + 30_000 ||
    nowMs - verdictTimestampMs > MAX_VERDICT_AGE_MS
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The integrity verdict is no longer fresh."
    );
  }

  if (
    appIntegrity["appRecognitionVerdict"] !== "PLAY_RECOGNIZED" ||
    appIntegrity["packageName"] !== PLAY_INTEGRITY_PACKAGE
  ) {
    throw new HttpsError(
      "permission-denied",
      "A Play-recognized PK Spot installation is required."
    );
  }

  if (accountDetails["appLicensingVerdict"] !== "LICENSED") {
    throw new HttpsError(
      "permission-denied",
      "A Google Play licensed installation is required."
    );
  }

  const deviceVerdicts = stringArray(
    deviceIntegrity["deviceRecognitionVerdict"]
  );
  if (!deviceVerdicts.includes("MEETS_DEVICE_INTEGRITY")) {
    throw new HttpsError(
      "permission-denied",
      "A Play-certified Android device is required."
    );
  }

  const certificateDigests = stringArray(
    appIntegrity["certificateSha256Digest"]
  ).slice(0, 5);
  const versionCode =
    typeof appIntegrity["versionCode"] === "string" ?
      appIntegrity["versionCode"].slice(0, 30) :
      undefined;

  return {
    package_name: PLAY_INTEGRITY_PACKAGE,
    app_recognition: "PLAY_RECOGNIZED",
    app_licensing: "LICENSED",
    device_recognition: "MEETS_DEVICE_INTEGRITY",
    certificate_sha256_digests: certificateDigests,
    ...(versionCode ? {version_code: versionCode} : {}),
    verdict_timestamp_ms: verdictTimestampMs,
  };
};

const googleAuth = new GoogleAuth({
  scopes: [PLAY_INTEGRITY_SCOPE],
});

export const decodeAndVerifyPlayIntegrityToken = async (
  token: string,
  expectedRequestHash: string
): Promise<VerifiedPlayIntegrityVerdict> => {
  if (token.length < 100 || token.length > 20_000) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid Play Integrity token."
    );
  }

  try {
    const client = await googleAuth.getClient();
    const response = await client.request<DecodeIntegrityTokenResponse>({
      url:
        "https://playintegrity.googleapis.com/v1/" +
        `${PLAY_INTEGRITY_PACKAGE}:decodeIntegrityToken`,
      method: "POST",
      data: {integrity_token: token},
    });
    return verifyPlayIntegrityPayload(
      response.data.tokenPayloadExternal,
      expectedRequestHash
    );
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("Play Integrity token verification failed", {
      error:
        error instanceof Error ?
          error.name :
          "UnknownPlayIntegrityError",
    });
    throw new HttpsError(
      "internal",
      "The integrity verdict could not be verified."
    );
  }
};
