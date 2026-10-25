import { describe, expect, it } from "vitest";
import { parseSessionInput, sessionAdult, sessionParticipation } from "../../../functions/src/plannedSessionPolicy";
import type { UserSchema } from "./UserSchema";
const user = (value: Partial<UserSchema>) => value as UserSchema;
describe("planned session policy", () => {
  it("accepts unavailable age signals for private participation, not restricted accounts", () => {
    expect(sessionParticipation(user({ age_policy: { participation_state: "platform_signal_unavailable" } }))).toBe(true);
    expect(sessionParticipation(user({ age_policy: { participation_state: "read_only_age_restricted" } }))).toBe(false);
    expect(sessionParticipation(user({ moderation_state: { status: "suspended" } }))).toBe(false);
  });
  it("does not confuse an adult flag or App Check with request-bound age evidence", () => {
    expect(sessionAdult(user({ age_policy: { adult_eligibility: "verified", age_range: { lower: 18 }, assurance: { status: "active", client_integrity: "firebase_app_check", approval_basis: "test" } } }))).toBe(false);
    expect(sessionAdult(undefined)).toBe(false);
  });
  it.each([NaN, Infinity, -1])("rejects invalid timestamps %s", startsAt => {
    expect(() => parseSessionInput({ title: "Training", notes: "", spotId: "spot", startsAt, endsAt: 10, timeZone: "UTC", audience: "private" })).toThrow();
  });
});
