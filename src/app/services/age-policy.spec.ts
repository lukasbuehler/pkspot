import { describe, expect, it } from "vitest";
import {
  PlatformAgeSignal,
  buildAgePolicyFromSignal,
  deriveAgeParticipationState,
  isAgeParticipationAllowed,
} from "./age-policy";

const baseSignal: PlatformAgeSignal = {
  platform: "android",
  source: "android_play_age_signals",
  available: true,
};

describe("age policy", () => {
  it("allows users when a platform signal confirms a 13+ range", () => {
    expect(
      deriveAgeParticipationState({
        ...baseSignal,
        ageLower: 13,
        ageUpper: 17,
      })
    ).toBe("allowed");
  });

  it("makes users read-only when the platform range is below 13", () => {
    expect(
      deriveAgeParticipationState({
        ...baseSignal,
        ageLower: 0,
        ageUpper: 12,
      })
    ).toBe("read_only_age_restricted");
  });

  it("requires age signal follow-up when sharing is declined where required", () => {
    expect(
      deriveAgeParticipationState({
        ...baseSignal,
        platform: "ios",
        source: "ios_declared_age_range",
        response: "declined",
        requiredRegulatoryFeatures: ["declaredAgeRangeRequired"],
      })
    ).toBe("age_signal_declined_required");
  });

  it("requires parental consent for significant app changes when flagged", () => {
    expect(
      deriveAgeParticipationState({
        ...baseSignal,
        requiredRegulatoryFeatures: [
          "significantAppChangeRequiresParentalConsent",
        ],
      })
    ).toBe("needs_parental_consent");
  });

  it("does not lock users out when platform signals are unavailable", () => {
    const policy = buildAgePolicyFromSignal({
      ...baseSignal,
      available: false,
      errorMessage: "Play Age Signals unavailable",
    });

    expect(policy.participation_state).toBe("platform_signal_unavailable");
    expect(isAgeParticipationAllowed(policy.participation_state)).toBe(true);
  });

  it("blocks backend participation states except allowed fallback states", () => {
    expect(isAgeParticipationAllowed(undefined)).toBe(true);
    expect(isAgeParticipationAllowed("allowed")).toBe(true);
    expect(isAgeParticipationAllowed("platform_signal_unavailable")).toBe(true);
    expect(isAgeParticipationAllowed("read_only_age_restricted")).toBe(false);
    expect(isAgeParticipationAllowed("needs_parental_consent")).toBe(false);
    expect(isAgeParticipationAllowed("age_signal_declined_required")).toBe(false);
    expect(isAgeParticipationAllowed("needs_age_signal")).toBe(false);
  });
});
