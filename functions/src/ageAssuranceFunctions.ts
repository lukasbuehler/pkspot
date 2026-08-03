import {createHash, randomBytes, randomUUID} from "node:crypto";
import * as admin from "firebase-admin";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {
  ageAssuranceRequestHash,
  buildServerAgePolicy,
  sanitizeNativeAgeSignal,
} from "./agePolicy";
import {decodeAndVerifyPlayIntegrityToken} from "./playIntegrity";
import {profileAccessFieldsForPrivacy} from "../../src/db/utils/profile-access";

const ANDROID_APP_ID =
  "1:294969617102:android:7dc490ae0f078f00313e9f";
const CHALLENGE_COLLECTION = "age_assurance_challenges";
const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;
const MAINTENANCE_BATCH_SIZE = 250;

interface ChallengeData {
  uid: string;
  app_id: string;
  platform: "android";
  nonce_hash: string;
  expires_at: admin.firestore.Timestamp;
  consumed_at?: admin.firestore.Timestamp;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number
): string => {
  if (
    typeof value !== "string" ||
    value.length < minLength ||
    value.length > maxLength
  ) {
    throw new HttpsError("invalid-argument", `Invalid ${field}.`);
  }
  return value;
};

const requireNativeAndroidRequest = (
  request: {
    auth?: { uid: string };
    app?: { appId?: string };
  }
): { uid: string; appId: string } => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }
  const appId = request.app?.appId;
  if (appId !== ANDROID_APP_ID) {
    throw new HttpsError(
      "failed-precondition",
      "A verified PK Spot Android installation is required."
    );
  }
  return {uid, appId};
};

const nonceHash = (nonce: string): string =>
  createHash("sha256").update(nonce, "utf8").digest("base64url");

const validChallengeData = (
  value: unknown,
  uid: string,
  appId: string,
  nonce: string,
  nowMs: number
): value is ChallengeData => {
  if (!isRecord(value)) return false;
  const expiresAt = value["expires_at"];
  return (
    value["uid"] === uid &&
    value["app_id"] === appId &&
    value["platform"] === "android" &&
    value["nonce_hash"] === nonceHash(nonce) &&
    value["consumed_at"] === undefined &&
    expiresAt instanceof admin.firestore.Timestamp &&
    expiresAt.toMillis() > nowMs
  );
};

export const beginAgeAssuranceV3 = onCall(
  {enforceAppCheck: true},
  async (request) => {
    const {uid, appId} = requireNativeAndroidRequest(request);
    const nonce = randomBytes(32).toString("base64url");
    const challengeRef = admin
      .firestore()
      .collection(CHALLENGE_COLLECTION)
      .doc();
    const now = admin.firestore.Timestamp.now();

    await challengeRef.create({
      uid,
      app_id: appId,
      platform: "android",
      nonce_hash: nonceHash(nonce),
      created_at: now,
      expires_at: admin.firestore.Timestamp.fromMillis(
        now.toMillis() + CHALLENGE_LIFETIME_MS
      ),
    });

    return {
      challenge_id: challengeRef.id,
      challenge_nonce: nonce,
      platform: "android" as const,
    };
  }
);

export const updateAgePolicyV3 = onCall(
  {
    enforceAppCheck: true,
    timeoutSeconds: 60,
  },
  async (request) => {
    const {uid, appId} = requireNativeAndroidRequest(request);
    const data = isRecord(request.data) ? request.data : {};
    const challengeId = requiredString(
      data["challenge_id"],
      "challenge_id",
      10,
      128
    );
    const challengeNonce = requiredString(
      data["challenge_nonce"],
      "challenge_nonce",
      32,
      128
    );
    const integrityToken = requiredString(
      data["integrity_token"],
      "integrity_token",
      100,
      20_000
    );
    const signal = sanitizeNativeAgeSignal(data["signal"]);
    if (signal.platform !== "android") {
      throw new HttpsError(
        "invalid-argument",
        "The request-bound flow currently supports Android only."
      );
    }

    const challengeRef = admin
      .firestore()
      .collection(CHALLENGE_COLLECTION)
      .doc(challengeId);
    const initialChallenge = await challengeRef.get();
    const nowMs = Date.now();
    if (
      !initialChallenge.exists ||
      !validChallengeData(
        initialChallenge.data(),
        uid,
        appId,
        challengeNonce,
        nowMs
      )
    ) {
      throw new HttpsError(
        "failed-precondition",
        "The age assurance challenge is invalid or expired."
      );
    }

    const requestHash = ageAssuranceRequestHash(
      uid,
      challengeId,
      challengeNonce,
      signal
    );
    const integrityVerdict = await decodeAndVerifyPlayIntegrityToken(
      integrityToken,
      requestHash
    );
    const policy = buildServerAgePolicy(signal, {
      appId,
      signalVersion: 3,
      clientIntegrity: "play_integrity_request_bound",
      cryptographicallyBound: true,
    });
    const verificationId = randomUUID();
    const evaluatedAt = admin.firestore.Timestamp.now();
    const assurance = {
      ...policy.assurance,
      verification_id: verificationId,
      status: "active",
      evaluated_at: evaluatedAt,
      ...(policy.adult_eligibility === "verified" ?
        {verified_at: evaluatedAt} :
        {}),
    };
    const assuranceForUser = {
      ...assurance,
      ...(policy.adult_eligibility === "verified" ?
        {} :
        {
          approval_basis: admin.firestore.FieldValue.delete(),
        }),
    };
    const userRef = admin.firestore().collection("users").doc(uid);
    const recordRef = userRef
      .collection("age_assurance_records")
      .doc(verificationId);

    await admin.firestore().runTransaction(async (transaction) => {
      const challenge = await transaction.get(challengeRef);
      if (
        !challenge.exists ||
        !validChallengeData(
          challenge.data(),
          uid,
          appId,
          challengeNonce,
          Date.now()
        )
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The age assurance challenge was already used or expired."
        );
      }
      const existingUser = await transaction.get(userRef);
      const existingPolicy = existingUser.data()?.["age_policy"];
      const existingAssurance =
        isRecord(existingPolicy) ? existingPolicy["assurance"] : undefined;
      const previousVerificationId =
        isRecord(existingAssurance) &&
        typeof existingAssurance["verification_id"] === "string" ?
          existingAssurance["verification_id"] :
          undefined;

      transaction.update(challengeRef, {
        consumed_at: evaluatedAt,
      });
      transaction.set(
        userRef,
        {
          age_policy: {
            ...policy,
            assurance: assuranceForUser,
            signal_updated_at: evaluatedAt,
          },
          ...(policy.adult_eligibility === "verified" ?
            {} :
            {
              ...profileAccessFieldsForPrivacy("private", false),
            }),
        },
        {merge: true}
      );
      transaction.create(recordRef, {
        verification_id: verificationId,
        user_id: uid,
        status: "active",
        outcome: policy.adult_eligibility,
        age_band: policy.age_band,
        age_range: policy.age_range ?? null,
        participation_state: policy.participation_state,
        assurance,
        source: policy.source,
        platform: policy.platform,
        integrity_verdict: integrityVerdict,
        created_at: evaluatedAt,
      });
      if (
        previousVerificationId &&
        previousVerificationId !== verificationId
      ) {
        transaction.set(
          userRef
            .collection("age_assurance_records")
            .doc(previousVerificationId),
          {
            status: "superseded",
            superseded_at: evaluatedAt,
            superseded_by: verificationId,
          },
          {merge: true}
        );
      }
    });

    return {
      ok: true,
      participation_state: policy.participation_state,
      adult_eligibility: policy.adult_eligibility,
      age_band: policy.age_band,
      confidence: policy.assurance.confidence,
      evaluated_at: evaluatedAt.toDate().toISOString(),
      ...(policy.adult_eligibility === "verified" ?
        {verified_at: evaluatedAt.toDate().toISOString()} :
        {}),
    };
  }
);

const requireAdmin = async (uid: string | undefined): Promise<void> => {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }
  const user = await admin.firestore().collection("users").doc(uid).get();
  if (user.data()?.["is_admin"] !== true) {
    throw new HttpsError("permission-denied", "Administrator access required.");
  }
};

const revokeAssuranceDocuments = async (
  documents: admin.firestore.QueryDocumentSnapshot[],
  reason: string
): Promise<void> => {
  const revokedAt = admin.firestore.Timestamp.now();
  const batch = admin.firestore().batch();

  for (const document of documents) {
    const assurance = document.data()["age_policy"]?.["assurance"];
    const verificationId =
      isRecord(assurance) && typeof assurance["verification_id"] === "string" ?
        assurance["verification_id"] :
        undefined;
    const approvalBasis =
      isRecord(assurance) && typeof assurance["approval_basis"] === "string" ?
        assurance["approval_basis"] :
        undefined;
    batch.set(
      document.ref,
      {
        age_policy: {
          adult_eligibility: "not_verified",
          assurance: {
            status: "invalidated",
            status_reason: reason,
            status_changed_at: revokedAt,
            ...(approvalBasis ?
              {previous_approval_basis: approvalBasis} :
              {}),
            approval_basis: admin.firestore.FieldValue.delete(),
          },
        },
        ...profileAccessFieldsForPrivacy("private", false),
      },
      {merge: true}
    );

    if (verificationId) {
      batch.set(
        document.ref
          .collection("age_assurance_records")
          .doc(verificationId),
        {
          status: "invalidated",
          status_reason: reason,
          status_changed_at: revokedAt,
        },
        {merge: true}
      );
    }
  }

  await batch.commit();
};

export const invalidateAgeAssuranceApprovals = onCall(
  {enforceAppCheck: true},
  async (request) => {
    await requireAdmin(request.auth?.uid);
    const data = isRecord(request.data) ? request.data : {};
    const approvalBasis = requiredString(
      data["approval_basis"],
      "approval_basis",
      5,
      180
    );
    if (!/^[a-z0-9_:.-]+$/u.test(approvalBasis)) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid approval_basis."
      );
    }
    const reason = requiredString(data["reason"], "reason", 5, 500);
    const dryRun = data["dry_run"] !== false;
    const query = admin
      .firestore()
      .collection("users")
      .where(
        "age_policy.assurance.approval_basis",
        "==",
        approvalBasis
      );

    if (dryRun) {
      const count = await query.count().get();
      return {
        ok: true,
        dry_run: true,
        matching_users: count.data().count,
      };
    }

    const snapshot = await query.limit(MAINTENANCE_BATCH_SIZE).get();
    await revokeAssuranceDocuments(
      snapshot.docs,
      reason
    );
    return {
      ok: true,
      dry_run: false,
      processed_users: snapshot.size,
      has_more: snapshot.size === MAINTENANCE_BATCH_SIZE,
    };
  }
);

export const cleanupAgeAssuranceChallenges = onSchedule(
  {
    schedule: "17 3 * * *",
    timeZone: "Europe/Zurich",
  },
  async () => {
    const expiredChallenges = await admin
      .firestore()
      .collection(CHALLENGE_COLLECTION)
      .where("expires_at", "<=", admin.firestore.Timestamp.now())
      .limit(500)
      .get();
    if (!expiredChallenges.empty) {
      const cleanup = admin.firestore().batch();
      expiredChallenges.docs.forEach((document) => {
        cleanup.delete(document.ref);
      });
      await cleanup.commit();
    }
  }
);
