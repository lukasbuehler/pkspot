import { HttpsError } from "firebase-functions/v2/https";
import type { UserAgePolicySchema } from "../../src/db/schemas/UserSchema";

export { ONEID_APPROVAL_BASIS, hasApprovedOneIdAdultPolicy } from "../../src/db/utils/external-age-policy";
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Call only after verifying the ID token signature, issuer, audience and expiry. */
export function validateOneIdThresholdResult(claims: Record<string, unknown>, userInfo: unknown, nonce: string): boolean {
  const info = record(userInfo);
  if (claims["nonce"] !== nonce || typeof claims["sub"] !== "string" || !claims["sub"] ||
      info["sub"] !== claims["sub"] || typeof info["age_over_18"] !== "boolean") {
    throw new HttpsError("permission-denied", "OneID returned a mismatched verification response.");
  }
  return info["age_over_18"];
}

/** An inconclusive fallback cannot undo native evidence or participation rules. */
export function shouldApplyOneIdPolicy(previous: UserAgePolicySchema | undefined, verified: boolean): boolean {
  if (!verified) return previous?.source === "oneid_age_check";
  const independent = previous?.source !== "oneid_age_check" && previous?.adult_eligibility === "verified" &&
    (previous.age_range?.lower ?? -1) >= 18 && previous.assurance?.status === "active" &&
    ["play_integrity_request_bound", "apple_app_attest_request_bound"].includes(previous.assurance.client_integrity ?? "");
  return !independent;
}
