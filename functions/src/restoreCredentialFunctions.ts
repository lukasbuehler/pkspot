import {createHash} from "node:crypto";
import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from "@simplewebauthn/server";

const ANDROID_APP_ID =
  "1:294969617102:android:7dc490ae0f078f00313e9f";
const RP_ID = "pkspot.app";
const RP_NAME = "PK Spot";
const CHALLENGE_COLLECTION = "restore_credential_challenges";
const RATE_LIMIT_COLLECTION = "restore_credential_rate_limits";
const CREDENTIALS_SUBCOLLECTION = "restore_credentials";
const CHALLENGE_LIFETIME_MS = 5 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const AUTHENTICATIONS_PER_NETWORK_PER_HOUR = 12;

/**
 * These are SHA-256 hashes of the production signing certificates served by
 * pkspot.app/.well-known/assetlinks.json. WebAuthn validation must use server
 * owned origins; accepting an origin supplied by the device would defeat it.
 */
export const ANDROID_RESTORE_CREDENTIAL_ORIGINS = [
  "android:apk-key-hash:7zFdbrtgqexZDJk-4RskYrZeL1LQNO43QhcdjKj7rqU",
  "android:apk-key-hash:Q84NpPXpZCzBS8jMgFZxgbAEiEeV272al8YLrDlzQnQ",
] as const;

type ChallengePurpose = "registration" | "authentication";

interface ChallengeData {
  purpose: ChallengePurpose;
  challenge: string;
  expires_at: Timestamp;
  consumed_at?: Timestamp;
  uid?: string;
}

interface StoredRestoreCredential {
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
}

interface RateLimit {
  key: string;
  expiresAt: Timestamp;
  maximum: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string => {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new HttpsError("invalid-argument", `Invalid ${field}.`);
  }
  return value;
};

const requestData = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const parseWebAuthnResponse = <T>(
  value: unknown,
  field: string,
): T => {
  const serialized = requiredString(value, field, 64, 50_000);
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isRecord(parsed)) throw new Error("response must be an object");
    return parsed as T;
  } catch {
    throw new HttpsError("invalid-argument", `Invalid ${field}.`);
  }
};

const validChallenge = (
  value: unknown,
  purpose: ChallengePurpose,
  nowMs: number,
  uid?: string,
): value is ChallengeData => {
  if (!isRecord(value)) return false;
  const expiresAt = value["expires_at"];
  return (
    value["purpose"] === purpose &&
    typeof value["challenge"] === "string" &&
    value["consumed_at"] === undefined &&
    expiresAt instanceof Timestamp &&
    expiresAt.toMillis() > nowMs &&
    (uid === undefined || value["uid"] === uid)
  );
};

const requireNativeAndroidRequest = (request: {
  auth?: {uid: string};
  app?: {appId?: string};
}): string => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }
  if (request.app?.appId !== ANDROID_APP_ID) {
    throw new HttpsError(
      "failed-precondition",
      "A verified PK Spot Android installation is required.",
    );
  }
  return uid;
};

const requestIp = (request: {
  rawRequest: {ip?: string; socket?: {remoteAddress?: string | null}};
}): string | undefined => {
  const value =
    request.rawRequest.ip ?? request.rawRequest.socket?.remoteAddress;
  return typeof value === "string" && value.length <= 128 ? value : undefined;
};

const rateLimit = (network: string): RateLimit => {
  const windowStart = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const key = createHash("sha256")
    .update(`restore-credential-v1:${network}:${windowStart}`)
    .digest("hex");
  return {
    key,
    maximum: AUTHENTICATIONS_PER_NETWORK_PER_HOUR,
    expiresAt: Timestamp.fromMillis(windowStart + HOUR_MS + DAY_MS),
  };
};

const consumeRateLimit = async (limit: RateLimit): Promise<void> => {
  const ref = admin.firestore().collection(RATE_LIMIT_COLLECTION).doc(limit.key);
  await admin.firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const count = snapshot.data()?.["count"];
    const current = typeof count === "number" ? count : 0;
    if (current >= limit.maximum) {
      throw new HttpsError(
        "resource-exhausted",
        "Too many restore attempts. Please try again later.",
      );
    }
    transaction.set(
      ref,
      {
        count: current + 1,
        expires_at: limit.expiresAt,
        updated_at: Timestamp.now(),
      },
      {merge: true},
    );
  });
};

const webAuthnCredential = (value: unknown): WebAuthnCredential => {
  if (!isRecord(value)) {
    throw new HttpsError("failed-precondition", "Restore credential is invalid.");
  }
  const credentialId = value["credential_id"];
  const publicKey = value["public_key"];
  const counter = value["counter"];
  if (
    typeof credentialId !== "string" ||
    typeof publicKey !== "string" ||
    typeof counter !== "number" ||
    !Number.isSafeInteger(counter) ||
    counter < 0
  ) {
    throw new HttpsError("failed-precondition", "Restore credential is invalid.");
  }
  const transports = Array.isArray(value["transports"])
    ? value["transports"].filter(
      (transport): transport is AuthenticatorTransportFuture =>
        typeof transport === "string" &&
        ["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"].includes(
          transport,
        ),
    )
    : undefined;
  return {
    id: credentialId,
    publicKey: Buffer.from(publicKey, "base64url"),
    counter,
    ...(transports?.length ? {transports} : {}),
  };
};

const storedCredential = (
  uid: string,
  credential: WebAuthnCredential,
  metadata: {
    credentialDeviceType: string;
    credentialBackedUp: boolean;
    origin: string;
  },
): StoredRestoreCredential & Record<string, unknown> => ({
  user_id: uid,
  credential_id: credential.id,
  public_key: Buffer.from(credential.publicKey).toString("base64url"),
  counter: credential.counter,
  ...(credential.transports?.length ? {transports: credential.transports} : {}),
  credential_device_type: metadata.credentialDeviceType,
  credential_backed_up: metadata.credentialBackedUp,
  origin: metadata.origin,
  kind: "android_restore",
});

export const beginRestoreCredentialRegistration = onCall(
  {enforceAppCheck: true},
  async (request) => {
    const uid = requireNativeAndroidRequest(request);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: Buffer.from(uid, "utf8"),
      userName: uid,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "discouraged",
      },
    });
    const now = Timestamp.now();
    const challengeRef = admin
      .firestore()
      .collection(CHALLENGE_COLLECTION)
      .doc();
    await challengeRef.create({
      purpose: "registration",
      challenge: options.challenge,
      uid,
      created_at: now,
      expires_at: Timestamp.fromMillis(now.toMillis() + CHALLENGE_LIFETIME_MS),
    } satisfies ChallengeData & Record<string, unknown>);
    return {
      challenge_id: challengeRef.id,
      request_json: JSON.stringify(options),
    };
  },
);

export const finishRestoreCredentialRegistration = onCall(
  {enforceAppCheck: true},
  async (request) => {
    const uid = requireNativeAndroidRequest(request);
    const data = requestData(request.data);
    const challengeId = requiredString(data["challenge_id"], "challenge_id", 10, 128);
    const response = parseWebAuthnResponse<RegistrationResponseJSON>(
      data["credential_response_json"],
      "credential_response_json",
    );
    const challengeRef = admin
      .firestore()
      .collection(CHALLENGE_COLLECTION)
      .doc(challengeId);
    const challengeSnapshot = await challengeRef.get();
    if (
      !challengeSnapshot.exists ||
      !validChallenge(challengeSnapshot.data(), "registration", Date.now(), uid)
    ) {
      throw new HttpsError(
        "failed-precondition",
        "The restore registration request is invalid or expired.",
      );
    }
    const challenge = challengeSnapshot.data() as ChallengeData;
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: [...ANDROID_RESTORE_CREDENTIAL_ORIGINS],
      expectedRPID: RP_ID,
      requireUserPresence: false,
      requireUserVerification: false,
    });
    if (!verification.verified) {
      throw new HttpsError("permission-denied", "Restore registration failed.");
    }

    const credential = verification.registrationInfo.credential;
    const duplicate = await admin
      .firestore()
      .collectionGroup(CREDENTIALS_SUBCOLLECTION)
      .where("credential_id", "==", credential.id)
      .limit(1)
      .get();
    if (
      !duplicate.empty &&
      duplicate.docs[0].data()["user_id"] !== uid
    ) {
      throw new HttpsError("already-exists", "Restore credential is already registered.");
    }

    const credentialRef = admin
      .firestore()
      .collection("users")
      .doc(uid)
      .collection(CREDENTIALS_SUBCOLLECTION)
      .doc(credential.id);
    const now = Timestamp.now();
    const record = storedCredential(uid, credential, verification.registrationInfo);
    await admin.firestore().runTransaction(async (transaction) => {
      const currentChallenge = await transaction.get(challengeRef);
      if (
        !currentChallenge.exists ||
        !validChallenge(currentChallenge.data(), "registration", Date.now(), uid)
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The restore registration request was already used or expired.",
        );
      }
      transaction.set(
        credentialRef,
        {
          ...record,
          created_at: now,
          updated_at: now,
        },
        {merge: true},
      );
      transaction.update(challengeRef, {consumed_at: now});
    });
    return {ok: true};
  },
);

export const beginRestoreCredentialAuthentication = onCall(
  {cors: true, invoker: "public"},
  async (request) => {
    const network = requestIp(request);
    if (network) await consumeRateLimit(rateLimit(network));
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: "discouraged",
    });
    const now = Timestamp.now();
    const challengeRef = admin
      .firestore()
      .collection(CHALLENGE_COLLECTION)
      .doc();
    await challengeRef.create({
      purpose: "authentication",
      challenge: options.challenge,
      created_at: now,
      expires_at: Timestamp.fromMillis(now.toMillis() + CHALLENGE_LIFETIME_MS),
    } satisfies ChallengeData & Record<string, unknown>);
    return {
      challenge_id: challengeRef.id,
      request_json: JSON.stringify(options),
    };
  },
);

export const finishRestoreCredentialAuthentication = onCall(
  {cors: true, invoker: "public"},
  async (request) => {
    const data = requestData(request.data);
    const challengeId = requiredString(data["challenge_id"], "challenge_id", 10, 128);
    const response = parseWebAuthnResponse<AuthenticationResponseJSON>(
      data["credential_response_json"],
      "credential_response_json",
    );
    const credentialId = requiredString(response.id, "credential.id", 8, 512);
    const challengeRef = admin
      .firestore()
      .collection(CHALLENGE_COLLECTION)
      .doc(challengeId);
    const challengeSnapshot = await challengeRef.get();
    if (
      !challengeSnapshot.exists ||
      !validChallenge(challengeSnapshot.data(), "authentication", Date.now())
    ) {
      throw new HttpsError(
        "failed-precondition",
        "The restore sign-in request is invalid or expired.",
      );
    }
    const challenge = challengeSnapshot.data() as ChallengeData;
    const credentials = await admin
      .firestore()
      .collectionGroup(CREDENTIALS_SUBCOLLECTION)
      .where("credential_id", "==", credentialId)
      .limit(2)
      .get();
    if (credentials.size !== 1) {
      throw new HttpsError("not-found", "Restore credential was not found.");
    }
    const credentialSnapshot = credentials.docs[0];
    const credentialData = credentialSnapshot.data();
    const uid = credentialData["user_id"];
    if (typeof uid !== "string" || !uid) {
      throw new HttpsError("failed-precondition", "Restore credential is invalid.");
    }
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: [...ANDROID_RESTORE_CREDENTIAL_ORIGINS],
      expectedRPID: RP_ID,
      credential: webAuthnCredential(credentialData),
      requireUserVerification: false,
    });
    if (!verification.verified) {
      throw new HttpsError("permission-denied", "Restore sign-in failed.");
    }

    try {
      await admin.auth().getUser(uid);
    } catch {
      throw new HttpsError("not-found", "The restored account no longer exists.");
    }

    const now = Timestamp.now();
    await admin.firestore().runTransaction(async (transaction) => {
      const currentChallenge = await transaction.get(challengeRef);
      if (
        !currentChallenge.exists ||
        !validChallenge(currentChallenge.data(), "authentication", Date.now())
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The restore sign-in request was already used or expired.",
        );
      }
      transaction.update(challengeRef, {consumed_at: now});
      transaction.update(credentialSnapshot.ref, {
        counter: verification.authenticationInfo.newCounter,
        credential_device_type: verification.authenticationInfo.credentialDeviceType,
        credential_backed_up: verification.authenticationInfo.credentialBackedUp,
        origin: verification.authenticationInfo.origin,
        last_used_at: now,
      });
    });

    return {
      firebase_custom_token: await admin.auth().createCustomToken(uid),
    };
  },
);

export const cleanupExpiredRestoreCredentialChallenges = onSchedule(
  "every 24 hours",
  async () => {
    const db = admin.firestore();
    const now = Timestamp.now();
    const [challenges, limits] = await Promise.all([
      db
        .collection(CHALLENGE_COLLECTION)
        .where("expires_at", "<=", now)
        .limit(250)
        .get(),
      db
        .collection(RATE_LIMIT_COLLECTION)
        .where("expires_at", "<=", now)
        .limit(250)
        .get(),
    ]);
    if (challenges.empty && limits.empty) return;
    const cleanup = db.batch();
    for (const document of [...challenges.docs, ...limits.docs]) {
      cleanup.delete(document.ref);
    }
    await cleanup.commit();
  },
);
