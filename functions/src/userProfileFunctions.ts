import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  buildFullUserProfile,
  buildLimitedUserProfile,
  buildPublicUserProfile,
  profileAudienceForUser,
} from "./userProfileProjection";

const db = admin.firestore();
const PUBLIC_PROFILE_COLLECTION = "public_user_profiles";
const PROJECTION_STATE_PATH = "maintenance/user-profile-projection";
const PRIVACY_CUTOVER_PATH = "maintenance/user-profile-privacy";

type UserProfileRequest = {
  user_id?: unknown;
};

type ProfileBackfillRequest = {
  dry_run?: unknown;
};

type ProfileCutoverRequest = {
  confirmation?: unknown;
  minimum_supported_client_version?: unknown;
};

const assertAdmin = async (uid: string | undefined): Promise<string> => {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const user = await db.doc(`users/${uid}`).get();
  if (user.data()?.["is_admin"] !== true) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
  return uid;
};

const userIdFromRequest = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/u.test(value)
  ) {
    throw new HttpsError("invalid-argument", "Invalid user id.");
  }
  return value;
};

const canViewerReadFullProfile = async (
  viewerId: string | undefined,
  userId: string,
  user: Record<string, unknown>
): Promise<boolean> => {
  if (viewerId === userId || profileAudienceForUser(user) === "public") {
    return true;
  }
  if (!viewerId) return false;

  const viewer = await db.doc(`users/${viewerId}`).get();
  if (viewer.data()?.["is_admin"] === true) return true;

  const audience = profileAudienceForUser(user);
  if (audience === "owner") return false;

  const follower = await db
    .doc(`users/${userId}/followers/${viewerId}`)
    .get();
  if (!follower.exists) return false;
  if (audience === "followers") return true;

  const followedByTarget = await db
    .doc(`users/${userId}/following/${viewerId}`)
    .get();
  return followedByTarget.exists;
};

/**
 * Returns a viewer-specific, field-level projection. Firestore rules cannot
 * redact fields inside a document, so non-owner profile reads use this server
 * boundary after the legacy `/users` read cutover.
 */
export const getUserProfile = onCall<UserProfileRequest>(
  { cors: true, invoker: "public" },
  async (request) => {
    const userId = userIdFromRequest(request.data.user_id);
    const user = await db.doc(`users/${userId}`).get();
    if (!user.exists) {
      throw new HttpsError("not-found", "User profile not found.");
    }

    const userData = user.data() ?? {};
    const canReadFull = await canViewerReadFullProfile(
      request.auth?.uid,
      userId,
      userData
    );
    return {
      uid: userId,
      ...(canReadFull
        ? buildFullUserProfile(userData)
        : buildLimitedUserProfile(userData)),
    };
  }
);

export const syncPublicUserProfileOnWrite = onDocumentWritten(
  "users/{userId}",
  async (event) => {
    const userId = event.params.userId;
    const publicProfile = event.data?.after.exists
      ? buildPublicUserProfile(event.data.after.data() ?? {})
      : null;
    const publicProfileRef = db.doc(
      `${PUBLIC_PROFILE_COLLECTION}/${userId}`
    );

    if (!publicProfile) {
      await publicProfileRef.delete();
      return;
    }

    await publicProfileRef.set(publicProfile);
  }
);

/**
 * Creates the adult opt-in public projection before any client or rules
 * cutover. Dry-run is the default so an accidental invocation is read-only.
 */
export const backfillPublicUserProfiles = onCall<ProfileBackfillRequest>(
  async (request) => {
    const adminUid = await assertAdmin(request.auth?.uid);
    const dryRun = request.data.dry_run !== false;
    const [users, existingProfiles] = await Promise.all([
      db.collection("users").get(),
      db.collection(PUBLIC_PROFILE_COLLECTION).get(),
    ]);
    const projected = new Map<string, Record<string, unknown>>();

    for (const user of users.docs) {
      const profile = buildPublicUserProfile(user.data());
      if (profile) projected.set(user.id, profile);
    }

    const staleProfileIds = existingProfiles.docs
      .map((profile) => profile.id)
      .filter((userId) => !projected.has(userId));

    if (!dryRun) {
      const writer = db.bulkWriter();
      for (const [userId, profile] of projected) {
        writer.set(db.doc(`${PUBLIC_PROFILE_COLLECTION}/${userId}`), profile);
      }
      for (const userId of staleProfileIds) {
        writer.delete(db.doc(`${PUBLIC_PROFILE_COLLECTION}/${userId}`));
      }
      await writer.close();

      await db.doc(PROJECTION_STATE_PATH).set({
        completed: true,
        source_user_count: users.size,
        public_profile_count: projected.size,
        stale_profiles_removed: staleProfileIds.length,
        completed_at: FieldValue.serverTimestamp(),
        completed_by: adminUid,
      });
    }

    return {
      dry_run: dryRun,
      users_scanned: users.size,
      public_profiles: projected.size,
      stale_profiles: staleProfileIds.length,
    };
  }
);

/**
 * Final legacy-read cutover. This remains a separate, deliberately explicit
 * operation because released clients must support getUserProfile first.
 */
export const activateUserProfilePrivacyCutover =
  onCall<ProfileCutoverRequest>(async (request) => {
    const adminUid = await assertAdmin(request.auth?.uid);
    if (
      request.data.confirmation !==
      "restrict-legacy-user-profile-reads"
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Exact profile privacy cutover confirmation is required."
      );
    }
    const minimumVersion = request.data.minimum_supported_client_version;
    if (
      typeof minimumVersion !== "string" ||
      !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(minimumVersion)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "A semantic minimum supported client version is required."
      );
    }

    const projectionState = await db.doc(PROJECTION_STATE_PATH).get();
    if (projectionState.data()?.["completed"] !== true) {
      throw new HttpsError(
        "failed-precondition",
        "The public profile backfill must complete first."
      );
    }

    await db.doc(PRIVACY_CUTOVER_PATH).set({
      completed: true,
      minimum_supported_client_version: minimumVersion,
      completed_at: FieldValue.serverTimestamp(),
      completed_by: adminUid,
    });

    return { ok: true };
  });
