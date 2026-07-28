import { describe, expect, it } from "vitest";
import {
  ageAssuranceRequestHash,
  ageBandForRange,
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

  it("only verifies request-bound 18+ independently checked evidence", () => {
    const selfDeclared = buildServerAgePolicy(
      androidSignal({ ageRangeSource: "tier_a" }),
      {
        appId: "android-app",
        signalVersion: 3,
        clientIntegrity: "play_integrity_request_bound",
        cryptographicallyBound: true,
      },
    );
    const independentlyChecked = buildServerAgePolicy(
      androidSignal({ ageRangeSource: "tier_c" }),
      {
        appId: "android-app",
        signalVersion: 3,
        clientIntegrity: "play_integrity_request_bound",
        cryptographicallyBound: true,
      },
    );
    const unbound = buildServerAgePolicy(
      androidSignal({ ageRangeSource: "tier_d" }),
      {
        appId: "android-app",
        signalVersion: 2,
        clientIntegrity: "firebase_app_check",
        cryptographicallyBound: false,
      },
    );

    expect(selfDeclared.adult_eligibility).toBe("not_verified");
    expect(independentlyChecked.adult_eligibility).toBe("verified");
    expect(unbound.adult_eligibility).toBe("not_verified");
    expect(independentlyChecked.assurance).toMatchObject({
      evidence_strength: "independently_checked",
      confidence: "verified",
      age_range_source: "tier_c",
      client_integrity: "play_integrity_request_bound",
      approval_basis:
        "google_play:platform_age_signal:tier_c:request_bound:v1",
      method: {
        provider: "google_play",
        category: "platform_age_signal",
        provider_method: "tier_c",
      },
    });
  });

  it("normalizes ranges into PK Spot age bands", () => {
    expect(ageBandForRange(0, 12)).toBe("under_13");
    expect(ageBandForRange(13, 15)).toBe("13_to_15");
    expect(ageBandForRange(16, 17)).toBe("16_to_17");
    expect(ageBandForRange(18)).toBe("18_plus");
    expect(ageBandForRange(13, 17)).toBe("mixed_or_custom");
    expect(ageBandForRange()).toBe("unknown");
  });

  it("uses the same stable request-binding vector as Android", () => {
    expect(
      ageAssuranceRequestHash(
        "user-1",
        "challenge-1",
        "nonce-1234567890",
        androidSignal({ significantChangeStatus: "approved" }),
      ),
    ).toBe("-b554LXZZXE_8ppOiCLKEaKyMWS3SYQDKddDV6Owr0U");
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
