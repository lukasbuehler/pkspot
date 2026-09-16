import { hasApprovedOneIdAdultPolicy } from "./externalAgeVerificationPolicy";
import { HttpsError } from "firebase-functions/v2/https";
import type { PlannedSessionInput } from "../../src/db/schemas/PlannedSessionSchema";
import type { UserSchema } from "../../src/db/schemas/UserSchema";

export function sessionAdult(user: UserSchema | undefined): boolean {
  const policy = user?.age_policy;
  if (sessionParticipation(user) && hasApprovedOneIdAdultPolicy(policy)) return true;
  return sessionParticipation(user) && policy?.adult_eligibility === "verified" &&
    (policy.age_range?.lower ?? -1) >= 18 && policy.assurance?.status === "active" &&
    ["play_integrity_request_bound", "apple_app_attest_request_bound"].includes(policy.assurance.client_integrity ?? "") &&
    !!policy.assurance.approval_basis;
}
export function sessionParticipation(user: UserSchema | undefined): boolean {
  return !!user && !["contribution_restricted", "suspended"].includes(user.moderation_state?.status ?? "active") && ["allowed", "platform_signal_unavailable"].includes(user.age_policy?.participation_state ?? "allowed");
}
export function sessionBlocked(a: UserSchema | undefined, b: UserSchema | undefined, aId: string, bId: string): boolean {
  return !!a?.blocked_users?.includes(bId) || !!b?.blocked_users?.includes(aId);
}
export function parseSessionInput(value: unknown, now = Date.now()): PlannedSessionInput {
  if (!value || typeof value !== "object") throw new HttpsError("invalid-argument", "Session details are required.");
  const v = value as Record<string, unknown>;
  const text = (key: string, max: number, optional = false): string => {
    const item = v[key];
    if (optional && (item === undefined || item === "")) return "";
    if (typeof item !== "string" || !item.trim() || item.length > max) throw new HttpsError("invalid-argument", `Invalid ${key}.`);
    return item.trim();
  };
  const title = text("title", 100);
  const notes = text("notes", 2000, true);
  const spotId = text("spotId", 150);
  if (!/^[\w-]+$/.test(spotId)) throw new HttpsError("invalid-argument", "Invalid Spot.");
  const timeZone = text("timeZone", 100);
  try { new Intl.DateTimeFormat("en", { timeZone }); } catch { throw new HttpsError("invalid-argument", "Invalid time zone."); }
  const startsAt = v["startsAt"], endsAt = v["endsAt"];
  if (typeof startsAt !== "number" || typeof endsAt !== "number" || !Number.isFinite(startsAt) || !Number.isFinite(endsAt) ||
      startsAt < now || startsAt > now + 366 * 86400000 || endsAt <= startsAt || endsAt - startsAt > 86400000) {
    throw new HttpsError("invalid-argument", "Choose a future session lasting up to 24 hours.");
  }
  if (v["audience"] !== "private" && v["audience"] !== "community") throw new HttpsError("invalid-argument", "Invalid audience.");
  return { title, notes, spotId, startsAt, endsAt, timeZone, audience: v["audience"] };
}
