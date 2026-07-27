import { describe, expect, it } from "vitest";
import {
  buildServerAgePolicy,
  evidenceStrengthForSignal,
  participationStateForSignal,
  sanitizeNativeAgeSignal,
} from "../functions/src/agePolicy";

const androidSignal = (
  overrides: Record<string, unknown> = {},
) =>
  sanitizeNativeAgeSignal({
    platform: "android",
    source: "android_play_age_signals",
    available: true,
    response: "shared",
    ageSignalsStatus: "shared",
    ageLower: 18,
    ageRangeSource: "tier_c",
    ...overrides,
  });

describe("server age policy", () => {
  it.each([
    ["tier_a", "self_declared"],
    ["tier_b", "guardian_managed"],
    ["tier_c", "independently_checked"],
    ["tier_d", "verified_identity"],
    ["unknown", "unknown"],
  ] as const)("maps Android %s evidence to %s", (source, strength) => {
    expect(
      evidenceStrengthForSignal(androidSignal({ ageRangeSource: source })),
    ).toBe(strength);
  });

  it("only verifies an 18+ range backed by independently checked evidence", () => {
    const selfDeclared = buildServerAgePolicy(
      androidSignal({ ageRangeSource: "tier_a" }),
      "android-app",
    );
    const independentlyChecked = buildServerAgePolicy(
      androidSignal({ ageRangeSource: "tier_c" }),
      "android-app",
    );

    expect(selfDeclared.adult_eligibility).toBe("not_verified");
    expect(independentlyChecked.adult_eligibility).toBe("verified");
    expect(independentlyChecked.assurance).toMatchObject({
      evidence_strength: "independently_checked",
      age_range_source: "tier_c",
      client_integrity: "firebase_app_check",
      limitation: "client_relay_not_cryptographically_bound",
    });
  });

  it("does not gate ordinary participation when optional sharing is declined", () => {
    expect(
      participationStateForSignal(
        androidSignal({
          response: "declined",
          ageSignalsStatus: "not_shared",
          ageLower: null,
          ageRangeSource: null,
        }),
      ),
    ).toBe("allowed");
  });

  it("requires resolution when the platform says verification is mandatory", () => {
    expect(
      participationStateForSignal(
        androidSignal({
          response: "unavailable",
          ageSignalsStatus: "verification_required",
          ageLower: null,
          ageRangeSource: null,
        }),
      ),
    ).toBe("needs_age_signal");
  });

  it("rejects mismatched sources and invalid age ranges", () => {
    expect(() =>
      sanitizeNativeAgeSignal({
        platform: "android",
        source: "ios_declared_age_range",
        available: true,
      }),
    ).toThrow("does not match");

    expect(() =>
      androidSignal({ ageLower: 19, ageUpper: 17 }),
    ).toThrow("exceeds");
  });
});
