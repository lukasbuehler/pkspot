import * as admin from "firebase-admin";
import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

type AgeParticipationState =
  | "allowed"
  | "read_only_age_restricted"
  | "needs_age_signal"
  | "needs_parental_consent"
  | "age_signal_declined_required"
  | "platform_signal_unavailable";

type AgePolicyPayload = {
  participation_state?: AgeParticipationState;
  source?: string;
  platform?: string;
  reason?: string;
  age_range?: {
    lower?: number;
    upper?: number;
  };
  required_regulatory_features?: string[];
};

const allowedParticipationStates = new Set<AgeParticipationState>([
  "allowed",
  "read_only_age_restricted",
  "needs_age_signal",
  "needs_parental_consent",
  "age_signal_declined_required",
  "platform_signal_unavailable",
]);

const allowedAgePolicySources = new Set([
  "android_play_age_signals",
  "ios_declared_age_range",
  "web_tos",
  "manual",
]);

const allowedAgePolicyPlatforms = new Set(["android", "ios", "web"]);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const toStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.slice(0, 120))
    .slice(0, 10);
};

const sanitizeAgePolicy = (value: unknown): AgePolicyPayload => {
  if (!isPlainObject(value)) {
    throw new HttpsError("invalid-argument", "policy must be an object");
  }

  const participationState = value["participation_state"];
  if (
    typeof participationState !== "string" ||
    !allowedParticipationStates.has(participationState as AgeParticipationState)
  ) {
    throw new HttpsError("invalid-argument", "invalid participation state");
  }

  const source = value["source"];
  if (typeof source !== "string" || !allowedAgePolicySources.has(source)) {
    throw new HttpsError("invalid-argument", "invalid policy source");
  }

  const platform = value["platform"];
  if (
    typeof platform !== "string" ||
    !allowedAgePolicyPlatforms.has(platform)
  ) {
    throw new HttpsError("invalid-argument", "invalid policy platform");
  }

  const sanitized: AgePolicyPayload = {
    participation_state: participationState as AgeParticipationState,
    source,
    platform,
  };

  if (typeof value["reason"] === "string") {
    sanitized.reason = value["reason"].slice(0, 500);
  }

  const ageRange = value["age_range"];
  if (isPlainObject(ageRange)) {
    const lower = ageRange["lower"];
    const upper = ageRange["upper"];
    sanitized.age_range = {
      ...(typeof lower === "number" && Number.isFinite(lower)
        ? { lower: Math.trunc(lower) }
        : {}),
      ...(typeof upper === "number" && Number.isFinite(upper)
        ? { upper: Math.trunc(upper) }
        : {}),
    };
  }

  const regulatoryFeatures = toStringArray(
    value["required_regulatory_features"]
  );
  if (regulatoryFeatures?.length) {
    sanitized.required_regulatory_features = regulatoryFeatures;
  }

  return sanitized;
};

export const updateAgePolicy = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication is required");
  }

  const data = isPlainObject(request.data) ? request.data : {};
  const policy = sanitizeAgePolicy(data["policy"]);

  await admin.firestore().collection("users").doc(uid).set(
    {
      age_policy: {
        ...policy,
        signal_updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );

  return { ok: true };
});

export const onCheckInCreate = onDocumentCreated(
  "users/{userId}/check_ins/{checkInId}",
  async (event) => {
    const userId = event.params.userId;
    const snapshot = event.data;

    if (!snapshot) {
      console.error("No data associated with the event");
      return;
    }

    const checkInData = snapshot.data();
    const spotId = checkInData["spot_id"];

    if (!spotId) {
      console.error(`Check-in ${event.params.checkInId} missing spot_id`);
      return;
    }

    // Write to private_data subcollection instead of the public user document
    const privateDataRef = admin
      .firestore()
      .collection("users")
      .doc(userId)
      .collection("private_data")
      .doc("main");

    try {
      await privateDataRef.set(
        {
          visited_spots: admin.firestore.FieldValue.arrayUnion(spotId),
        },
        { merge: true }
      );
      console.log(`Added spot ${spotId} to visited_spots for user ${userId}`);
    } catch (error) {
      console.error(`Error updating visited_spots for user ${userId}:`, error);
    }
  }
);

export const syncVisitedSpotsCountOnPrivateDataWrite = onDocumentWritten(
  "users/{userId}/private_data/main",
  async (event) => {
    const userId = event.params.userId;
    const afterData = event.data?.after?.data() as
      | { visited_spots?: unknown }
      | undefined;

    const visitedSpotsRaw = Array.isArray(afterData?.visited_spots)
      ? afterData.visited_spots
      : [];
    const visitedSpotsCount = new Set(
      visitedSpotsRaw.filter(
        (spotId): spotId is string =>
          typeof spotId === "string" && spotId.trim().length > 0
      )
    ).size;

    const userRef = admin.firestore().collection("users").doc(userId);
    try {
      await userRef.update({
        visited_spots_count: visitedSpotsCount,
      });
      console.log(
        `Updated visited_spots_count for user ${userId} to ${visitedSpotsCount}`
      );
    } catch (error) {
      console.error(
        `Failed to update visited_spots_count for user ${userId}:`,
        error
      );
    }
  }
);
