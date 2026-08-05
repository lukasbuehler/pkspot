import {createHash} from "node:crypto";
import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import type {
  CreateSpotSubmissionRequest,
  CreateSpotSubmissionResponse,
  RecordSpotCreateGuardBlockRequest,
  SpotCreationDiagnosticsResponse,
  SpotCreationMetricWindow,
  SpotCreationPlatform,
} from "../../src/db/schemas/SpotCreationSchema";
import type {SpotSchema} from "../../src/db/schemas/SpotSchema";

const CALLABLE_OPTIONS = {cors: true, invoker: "public" as const};
const CLAIMS_COLLECTION = "spot_create_submissions";
const METRICS_COLLECTION = "spot_creation_metrics_hourly";
const CLAIM_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const METRIC_RETENTION_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_SPOT_PAYLOAD_BYTES = 250_000;
const SUBMISSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const APP_VERSION_PATTERN = /^[A-Za-z0-9.+_-]{1,64}$/u;
const ALLOWED_CREATE_FIELDS = new Set([
  "access",
  "amenities",
  "bounds",
  "bounds_raw",
  "description",
  "external_references",
  "hide_streetview",
  "location",
  "location_raw",
  "media",
  "name",
  "slug",
  "type",
]);

type ClaimData = {
  uid: string;
  submission_id: string;
  spot_id: string;
  edit_id: string;
  platform: SpotCreationPlatform;
  app_version: string;
  created_at: Timestamp;
  last_attempt_at: Timestamp;
  expires_at: Timestamp;
  attempt_count: number;
  guard_block_count: number;
  app_check_present: boolean;
};

const db = admin.firestore();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const metricBucket = (millis: number): string =>
  new Date(millis).toISOString().slice(0, 13);

const claimId = (uid: string, submissionId: string): string =>
  createHash("sha256").update(`${uid}:${submissionId}`).digest("hex");

const assertAdmin = async (uid: string | undefined): Promise<void> => {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const user = await db.doc(`users/${uid}`).get();
  if (user.data()?.["is_admin"] !== true) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
};

const assertParticipationAllowed = (
  user: FirebaseFirestore.DocumentData,
): void => {
  const state = user["age_policy"]?.["participation_state"] ?? "allowed";
  if (state !== "allowed" && state !== "platform_signal_unavailable") {
    throw new HttpsError(
      "permission-denied",
      "This account cannot create public Spots.",
    );
  }
  const moderation = user["moderation_state"]?.["status"] ?? "active";
  if (moderation === "contribution_restricted" || moderation === "suspended") {
    throw new HttpsError(
      "permission-denied",
      "This account cannot create public Spots.",
    );
  }
};

const validateSubmissionId = (value: unknown): string => {
  if (typeof value !== "string" || !SUBMISSION_ID_PATTERN.test(value)) {
    throw new HttpsError("invalid-argument", "Invalid submissionId.");
  }
  return value;
};

const validateClient = (
  value: unknown,
): {platform: SpotCreationPlatform; appVersion: string} => {
  if (!isRecord(value)) {
    throw new HttpsError("invalid-argument", "Client metadata is required.");
  }
  const platform = value["platform"];
  const appVersion = value["appVersion"];
  if (platform !== "web" && platform !== "ios" && platform !== "android") {
    throw new HttpsError("invalid-argument", "Invalid client platform.");
  }
  if (typeof appVersion !== "string" || !APP_VERSION_PATTERN.test(appVersion)) {
    throw new HttpsError("invalid-argument", "Invalid client app version.");
  }
  return {platform, appVersion};
};

const validateSpotData = (value: unknown): Partial<SpotSchema> => {
  if (!isRecord(value)) {
    throw new HttpsError("invalid-argument", "Spot data is required.");
  }
  const unexpected = Object.keys(value).filter(
    (field) => !ALLOWED_CREATE_FIELDS.has(field),
  );
  if (unexpected.length > 0) {
    throw new HttpsError(
      "invalid-argument",
      `Unsupported Spot fields: ${unexpected.join(", ")}`,
    );
  }
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (bytes > MAX_SPOT_PAYLOAD_BYTES) {
    throw new HttpsError("invalid-argument", "Spot payload is too large.");
  }
  if (!isRecord(value["name"]) || !isRecord(value["location_raw"])) {
    throw new HttpsError(
      "invalid-argument",
      "Spot name and mobile-safe location are required.",
    );
  }
  const raw = value["location_raw"];
  if (
    typeof raw["lat"] !== "number" ||
    typeof raw["lng"] !== "number" ||
    !Number.isFinite(raw["lat"]) ||
    !Number.isFinite(raw["lng"]) ||
    raw["lat"] < -90 ||
    raw["lat"] > 90 ||
    raw["lng"] < -180 ||
    raw["lng"] > 180
  ) {
    throw new HttpsError("invalid-argument", "Invalid Spot location.");
  }
  return value as Partial<SpotSchema>;
};

const incrementMetric = async (
  millis: number,
  increments: Record<string, number>,
): Promise<void> => {
  const update: Record<string, unknown> = {
    hour: metricBucket(millis),
    expires_at: Timestamp.fromMillis(millis + METRIC_RETENTION_MS),
    updated_at: FieldValue.serverTimestamp(),
  };
  for (const [field, amount] of Object.entries(increments)) {
    const [map, child] = field.split(".");
    if (child) {
      const nested = (update[map] as Record<string, unknown> | undefined) ?? {};
      nested[child] = FieldValue.increment(amount);
      update[map] = nested;
    } else {
      update[field] = FieldValue.increment(amount);
    }
  }
  await db.doc(`${METRICS_COLLECTION}/${metricBucket(millis)}`).set(update, {
    merge: true,
  });
};

export const recordAppliedSpotCreation = async (
  edit: {
    type: string;
    creation_channel?: "callable" | "legacy";
    creation_platform?: SpotCreationPlatform;
    creation_app_version?: string;
  },
): Promise<void> => {
  if (edit.type !== "CREATE") return;
  const channel = edit.creation_channel === "callable" ? "callable" : "legacy";
  const platform = edit.creation_platform ?? "unknown";
  const appVersion = edit.creation_app_version ?? "unknown";
  await incrementMetric(Date.now(), {
    actual_creates: 1,
    [`${channel}_creates`]: 1,
    [`platforms.${platform}`]: 1,
    [`app_versions.${appVersion.replaceAll(".", "_")}`]: 1,
  });
};

export const createSpotSubmission = onCall<CreateSpotSubmissionRequest>(
  CALLABLE_OPTIONS,
  async (request): Promise<CreateSpotSubmissionResponse> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to create a Spot.");
    }
    const submissionId = validateSubmissionId(request.data?.submissionId);
    const client = validateClient(request.data?.client);
    const spotData = validateSpotData(request.data?.data);
    const claimRef = db.doc(
      `${CLAIMS_COLLECTION}/${claimId(uid, submissionId)}`,
    );
    const result = await db.runTransaction(async (transaction) => {
      const [claimSnapshot, userSnapshot] = await Promise.all([
        transaction.get(claimRef),
        transaction.get(db.doc(`users/${uid}`)),
      ]);
      if (!userSnapshot.exists) {
        throw new HttpsError("failed-precondition", "User profile is missing.");
      }
      const user = userSnapshot.data() ?? {};
      assertParticipationAllowed(user);
      if (claimSnapshot.exists) {
        const claim = claimSnapshot.data() as ClaimData;
        transaction.update(claimRef, {
          attempt_count: FieldValue.increment(1),
          last_attempt_at: Timestamp.now(),
          expires_at: Timestamp.fromMillis(Date.now() + CLAIM_RETENTION_MS),
        });
        return {spotId: claim.spot_id, editId: claim.edit_id, replayed: true};
      }

      const spotRef = db.collection("spots").doc();
      const editRef = spotRef.collection("edits").doc();
      const now = Timestamp.now();
      const userReference: Record<string, string> = {uid};
      if (typeof user["display_name"] === "string") {
        userReference["display_name"] = user["display_name"];
      }
      if (typeof user["profile_picture"] === "string") {
        userReference["profile_picture"] = user["profile_picture"];
      }
      transaction.create(spotRef, {});
      transaction.create(editRef, {
        target_type: "spot",
        target_id: spotRef.id,
        schema_version: 1,
        type: "CREATE",
        timestamp: now,
        timestamp_raw_ms: now.toMillis(),
        likes: 0,
        approved: false,
        user: userReference,
        data: spotData,
        creation_submission_id: submissionId,
        creation_channel: "callable",
        creation_platform: client.platform,
        creation_app_version: client.appVersion,
      });
      transaction.create(claimRef, {
        uid,
        submission_id: submissionId,
        spot_id: spotRef.id,
        edit_id: editRef.id,
        platform: client.platform,
        app_version: client.appVersion,
        created_at: now,
        last_attempt_at: now,
        expires_at: Timestamp.fromMillis(now.toMillis() + CLAIM_RETENTION_MS),
        attempt_count: 1,
        guard_block_count: 0,
        app_check_present: Boolean(request.app),
      } satisfies ClaimData);
      return {spotId: spotRef.id, editId: editRef.id, replayed: false};
    });

    if (result.replayed) {
      await incrementMetric(Date.now(), {idempotent_replays: 1});
    }
    return result;
  },
);

export const recordSpotCreateGuardBlock =
  onCall<RecordSpotCreateGuardBlockRequest>(
    CALLABLE_OPTIONS,
    async (request): Promise<{ok: true}> => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
      const submissionId = validateSubmissionId(request.data?.submissionId);
      const ref = db.doc(`${CLAIMS_COLLECTION}/${claimId(uid, submissionId)}`);
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists || snapshot.data()?.["uid"] !== uid) {
          throw new HttpsError(
            "not-found",
            "Spot creation claim was not found.",
          );
        }
        transaction.update(ref, {
          guard_block_count: FieldValue.increment(1),
          last_attempt_at: Timestamp.now(),
        });
      });
      await incrementMetric(Date.now(), {client_guard_blocks: 1});
      return {ok: true};
    },
  );

const emptyMetricWindow = (): SpotCreationMetricWindow => ({
  actualCreates: 0,
  callableCreates: 0,
  legacyCreates: 0,
  idempotentReplays: 0,
  clientGuardBlocks: 0,
  platforms: {},
  appVersions: {},
});

const addMap = (
  target: Record<string, number>,
  value: unknown,
): void => {
  if (!isRecord(value)) return;
  for (const [key, count] of Object.entries(value)) {
    if (typeof count === "number") target[key] = (target[key] ?? 0) + count;
  }
};

const addMetric = (
  target: SpotCreationMetricWindow,
  value: FirebaseFirestore.DocumentData,
): void => {
  target.actualCreates += value["actual_creates"] ?? 0;
  target.callableCreates += value["callable_creates"] ?? 0;
  target.legacyCreates += value["legacy_creates"] ?? 0;
  target.idempotentReplays += value["idempotent_replays"] ?? 0;
  target.clientGuardBlocks += value["client_guard_blocks"] ?? 0;
  addMap(target.platforms, value["platforms"]);
  addMap(target.appVersions, value["app_versions"]);
};

export const getSpotCreationDiagnostics = onCall<Record<string, never>>(
  CALLABLE_OPTIONS,
  async (request): Promise<SpotCreationDiagnosticsResponse> => {
    await assertAdmin(request.auth?.uid);
    const now = Date.now();
    const sevenDaysAgo = metricBucket(now - 7 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = metricBucket(now - 24 * 60 * 60 * 1000);
    const metrics = await db.collection(METRICS_COLLECTION)
      .where(admin.firestore.FieldPath.documentId(), ">=", sevenDaysAgo)
      .get();
    const last24Hours = emptyMetricWindow();
    const last7Days = emptyMetricWindow();
    for (const doc of metrics.docs) {
      addMetric(last7Days, doc.data());
      if (doc.id >= twentyFourHoursAgo) addMetric(last24Hours, doc.data());
    }
    const cutoff = Timestamp.fromMillis(now - 7 * 24 * 60 * 60 * 1000);
    const [retried, guardBlocked] = await Promise.all([
      db.collection(CLAIMS_COLLECTION)
        .where("last_attempt_at", ">=", cutoff)
        .where("attempt_count", ">", 1)
        .orderBy("last_attempt_at", "desc")
        .limit(25)
        .get(),
      db.collection(CLAIMS_COLLECTION)
        .where("last_attempt_at", ">=", cutoff)
        .where("guard_block_count", ">", 0)
        .orderBy("last_attempt_at", "desc")
        .limit(25)
        .get(),
    ]);
    const recent = [...new Map(
      [...retried.docs, ...guardBlocked.docs].map((doc) => [doc.id, doc]),
    ).values()].sort(
      (left, right) =>
        (right.data() as ClaimData).last_attempt_at.toMillis() -
        (left.data() as ClaimData).last_attempt_at.toMillis(),
    );
    return {
      last24Hours,
      last7Days,
      recentPreventedCases: recent
        .map((doc) => ({id: doc.id, data: doc.data() as ClaimData}))
        .map(({id, data}) => ({
          submissionId: id.slice(0, 12),
          spotId: data.spot_id,
          editId: data.edit_id,
          uid: data.uid,
          platform: data.platform,
          appVersion: data.app_version,
          createdAtMillis: data.created_at.toMillis(),
          lastAttemptAtMillis: data.last_attempt_at.toMillis(),
          attemptCount: data.attempt_count,
          guardBlockCount: data.guard_block_count,
        }))
        .slice(0, 25),
    };
  },
);

export const cleanupSpotCreateSubmissions = onSchedule(
  {schedule: "every day 03:17", timeZone: "UTC"},
  async (): Promise<void> => {
    const [expiredClaims, expiredMetrics] = await Promise.all([
      db.collection(CLAIMS_COLLECTION)
        .where("expires_at", "<=", Timestamp.now())
        .limit(400)
        .get(),
      db.collection(METRICS_COLLECTION)
        .where("expires_at", "<=", Timestamp.now())
        .limit(100)
        .get(),
    ]);
    if (expiredClaims.empty && expiredMetrics.empty) return;
    const batch = db.batch();
    [...expiredClaims.docs, ...expiredMetrics.docs]
      .forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  },
);
