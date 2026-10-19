/**
 * The release whose "what's new" screen returning users see once. Bump it
 * with a release that deserves an introduction; it is independent of the
 * terms version, which only changes when the legal text does.
 */
export const WHATS_NEW_RELEASE = "1.2";
export const WHATS_NEW_STORAGE_KEY = "pkspot_whats_new_seen";

export type WelcomeScreen =
  /** First visit: full welcome with the agreement. */
  | "welcome"
  /** Returning user who agreed to older terms: highlights plus the agreement. */
  | "whats-new-consent"
  /** Returning user on the current terms who saw an older release's screen. */
  | "whats-new"
  | null;

/**
 * Which screen to show at startup. Agreeing through either dialog records the
 * current release as seen, so a device on the current terms without a record
 * has nothing new to see (this also keeps test fixtures quiet).
 */
export function welcomeScreenFor(
  acceptedVersion: string | null,
  currentVersion: string,
  seenRelease: string | null,
): WelcomeScreen {
  if (!acceptedVersion) return "welcome";
  if (acceptedVersion !== currentVersion) return "whats-new-consent";
  if (seenRelease && seenRelease !== WHATS_NEW_RELEASE) return "whats-new";
  return null;
}
