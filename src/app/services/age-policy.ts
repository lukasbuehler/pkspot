import {
  AgeParticipationState,
  UserAgePolicySchema,
} from "../../db/schemas/UserSchema";

export type PlatformAgeSignal = {
  platform: "android" | "ios";
  available: boolean;
  source: "android_play_age_signals" | "ios_declared_age_range";
  userStatus?: string;
  ageLower?: number | null;
  ageUpper?: number | null;
  installId?: string | null;
  mostRecentApprovalDate?: string | null;
  isEligibleForAgeFeatures?: boolean;
  response?: "shared" | "declined" | "unavailable";
  requiredRegulatoryFeatures?: string[];
  errorCode?: number | string;
  errorMessage?: string;
};

export function isAgeParticipationAllowed(
  state?: AgeParticipationState
): boolean {
  return (
    !state || state === "allowed" || state === "platform_signal_unavailable"
  );
}

export function buildAgePolicyFromSignal(
  signal: PlatformAgeSignal
): UserAgePolicySchema {
  const state = deriveAgeParticipationState(signal);
  return {
    participation_state: state,
    source: signal.source,
    platform: signal.platform,
    signal_updated_at: new Date(),
    reason: buildAgePolicyReason(signal, state),
    ...(typeof signal.ageLower === "number" || typeof signal.ageUpper === "number"
      ? {
          age_range: {
            ...(typeof signal.ageLower === "number"
              ? { lower: signal.ageLower }
              : {}),
            ...(typeof signal.ageUpper === "number"
              ? { upper: signal.ageUpper }
              : {}),
          },
        }
      : {}),
    ...(signal.requiredRegulatoryFeatures?.length
      ? { required_regulatory_features: signal.requiredRegulatoryFeatures }
      : {}),
  };
}

export function deriveAgeParticipationState(
  signal: PlatformAgeSignal
): AgeParticipationState {
  const requiredFeatures = signal.requiredRegulatoryFeatures ?? [];
  if (requiredFeatures.includes("significantAppChangeRequiresParentalConsent")) {
    return "needs_parental_consent";
  }

  if (!signal.available) {
    return "platform_signal_unavailable";
  }

  if (
    signal.response === "declined" &&
    (signal.isEligibleForAgeFeatures ||
      requiredFeatures.includes("declaredAgeRangeRequired"))
  ) {
    return "age_signal_declined_required";
  }

  if (typeof signal.ageUpper === "number" && signal.ageUpper < 13) {
    return "read_only_age_restricted";
  }

  if (typeof signal.ageLower === "number" && signal.ageLower >= 13) {
    return "allowed";
  }

  if (
    signal.isEligibleForAgeFeatures ||
    requiredFeatures.includes("declaredAgeRangeRequired")
  ) {
    return "needs_age_signal";
  }

  return "allowed";
}

function buildAgePolicyReason(
  signal: PlatformAgeSignal,
  state: AgeParticipationState
): string {
  if (state === "platform_signal_unavailable") {
    return signal.errorMessage || "Platform age signal unavailable";
  }
  if (state === "read_only_age_restricted") {
    return "Platform age range is below the app participation minimum";
  }
  if (state === "needs_parental_consent") {
    return "Platform reports parental consent is required for a significant app change";
  }
  if (state === "age_signal_declined_required") {
    return "Age range sharing was declined where the platform reports it is required";
  }
  if (state === "needs_age_signal") {
    return "Platform reports age assurance applies but did not provide a usable range";
  }
  return "Participation allowed by current platform signal";
}
