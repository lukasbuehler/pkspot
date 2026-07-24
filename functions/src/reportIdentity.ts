import * as admin from "firebase-admin";

export interface ModerationReporterSnapshot {
  uid?: string;
  email?: string;
  display_name?: string;
  profile_picture?: string;
}

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/**
 * Replaces client-provided identity fields with authoritative Auth/profile
 * values. Historical records without a uid and system scanner records remain
 * unchanged because no Auth account can be resolved for them.
 * @param {admin.firestore.DocumentReference} reportRef Report document.
 * @param {ModerationReporterSnapshot|undefined} submitted Submitted identity.
 * @return {Promise<ModerationReporterSnapshot>} Authoritative snapshot.
 */
export const persistAuthoritativeReporter = async (
  reportRef: admin.firestore.DocumentReference,
  submitted: ModerationReporterSnapshot | undefined,
): Promise<ModerationReporterSnapshot> => {
  const uid = stringValue(submitted?.uid);
  if (!uid || uid === "system_media_scanner") {
    return submitted ?? {};
  }

  const [authResult, profileResult] = await Promise.allSettled([
    admin.auth().getUser(uid),
    admin.firestore().doc(`users/${uid}`).get(),
  ]);
  const authUser =
    authResult.status === "fulfilled" ? authResult.value : undefined;
  const profile =
    profileResult.status === "fulfilled" ?
      profileResult.value.data() :
      undefined;
  const email = stringValue(authUser?.email);
  const profileDisplayName = stringValue(profile?.["display_name"]);
  const authDisplayName = stringValue(authUser?.displayName);
  const profilePicture = stringValue(profile?.["profile_picture"]);

  const reporter: ModerationReporterSnapshot = {
    uid,
    ...(email ? {email} : {}),
    ...(profileDisplayName ?
      {display_name: profileDisplayName} :
      authDisplayName ?
        {display_name: authDisplayName} :
        {}),
    ...(profilePicture ? {profile_picture: profilePicture} : {}),
  };

  await reportRef.set({user: reporter}, {merge: true});
  return reporter;
};
