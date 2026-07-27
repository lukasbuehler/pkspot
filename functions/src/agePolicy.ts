import { HttpsError } from "firebase-functions/v2/https";

export type AgeParticipationState =
  | "allowed"
  | "read_only_age_restricted"
  | "needs_age_signal"
  | "needs_parental_consent"
  | "age_signal_declined_required"
  | "platform_signal_unavailable";

export type AgeEvidenceStrength =
  | "unknown"
  | "self_declared"
  | "guardian_managed"
  | "independently_checked"
  | "verified_identity";

type NativeAgeSignal = {
  platform: "android" | "ios";
  source: "android_play_age_signals" | "ios_declared_age_range";
  available: boolean;
  response?: "shared" | "declined" | "unavailable";
  ageLower?: number;
  ageUpper?: number;
  ageSignalsStatus?: "shared" | "not_shared" | "verification_required";
  ageRangeSource?: "tier_a" | "tier_b" | "tier_c" | "tier_d" | "unknown";
  ageRangeDeclaration?: string;
  significantChangeStatus?: "approved" | "pending" | "declined" | "unknown";
  isEligibleForAgeFeatures?: boolean;
  requiredRegulatoryFeatures?: string[];
  errorMessage?: string;
};

export type ServerAgePolicy = {
  participation_state: AgeParticipationState;
  source: NativeAgeSignal["source"];
  platform: NativeAgeSignal["platform"];
  reason: string;
  adult_eligibility: "verified" | "not_verified";
  age_range?: {
    lower?: number;
    upper?: number;
  };
  required_regulatory_features?: string[];
  assurance: {
    signal_version: 2;
    evidence_strength: AgeEvidenceStrength;
    client_integrity: "firebase_app_check";
    app_id: string;
    limitation: "client_relay_not_cryptographically_bound";
    age_range_source?: NativeAgeSignal["ageRangeSource"];
    age_range_declaration?: string;
    significant_change_status?: NativeAgeSignal["significantChangeStatus"];
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): T | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new HttpsError("invalid-argument", `Invalid ${field}.`);
  }
  return value as T;
};

const optionalAgeBound = (
  value: unknown,
  field: string
): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 120
  ) {
    throw new HttpsError("invalid-argument", `Invalid ${field}.`);
  }
  return Math.trunc(value);
};

const normalizeAppleDeclaration = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "Invalid age range declaration."
    );
  }
  const normalized = value.replace(/[^a-z]/giu, "").toLowerCase();
  const known = new Set([
    "selfdeclared",
    "guardiandeclared",
    "checkedbyothermethod",
    "guardiancheckedbyothermethod",
    "governmentidchecked",
    "guardiangovernmentidchecked",
    "paymentchecked",
    "guardianpaymentchecked",
  ]);
  return known.has(normalized) ? normalized : "unknown";
};

const stringList = (value: unknown): string[] | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid required regulatory features."
    );
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.slice(0, 120))
    .slice(0, 10);
};

export const sanitizeNativeAgeSignal = (value: unknown): NativeAgeSignal => {
  if (!isRecord(value)) {
    throw new HttpsError("invalid-argument", "signal must be an object.");
  }
  const platform = optionalEnum(
    value["platform"],
    ["android", "ios"] as const,
    "platform"
  );
  const source = optionalEnum(
    value["source"],
    ["android_play_age_signals", "ios_declared_age_range"] as const,
    "source"
  );
  if (!platform || !source) {
    throw new HttpsError(
      "invalid-argument",
      "Native signal platform and source are required."
    );
  }
  if (
    (platform === "android" && source !== "android_play_age_signals") ||
    (platform === "ios" && source !== "ios_declared_age_range")
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Native signal source does not match its platform."
    );
  }
  if (typeof value["available"] !== "boolean") {
    throw new HttpsError("invalid-argument", "Signal availability is required.");
  }

  const ageLower = optionalAgeBound(value["ageLower"], "ageLower");
  const ageUpper = optionalAgeBound(value["ageUpper"], "ageUpper");
  if (
    ageLower !== undefined &&
    ageUpper !== undefined &&
    ageLower > ageUpper
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Age range lower bound exceeds its upper bound."
    );
  }

  return {
    platform,
    source,
    available: value["available"],
    response: optionalEnum(
      value["response"],
      ["shared", "declined", "unavailable"] as const,
      "response"
    ),
    ageLower,
    ageUpper,
    ageSignalsStatus: optionalEnum(
      value["ageSignalsStatus"],
      ["shared", "not_shared", "verification_required"] as const,
      "ageSignalsStatus"
    ),
    ageRangeSource: optionalEnum(
      value["ageRangeSource"],
      ["tier_a", "tier_b", "tier_c", "tier_d", "unknown"] as const,
      "ageRangeSource"
    ),
    ageRangeDeclaration: normalizeAppleDeclaration(
      value["ageRangeDeclaration"]
    ),
    significantChangeStatus: optionalEnum(
      value["significantChangeStatus"],
      ["approved", "pending", "declined", "unknown"] as const,
      "significantChangeStatus"
    ),
    ...(typeof value["isEligibleForAgeFeatures"] === "boolean"
      ? { isEligibleForAgeFeatures: value["isEligibleForAgeFeatures"] }
      : {}),
    requiredRegulatoryFeatures: stringList(
      value["requiredRegulatoryFeatures"]
    ),
    ...(typeof value["errorMessage"] === "string"
      ? { errorMessage: value["errorMessage"].slice(0, 300) }
      : {}),
  };
};

export const evidenceStrengthForSignal = (
  signal: NativeAgeSignal
): AgeEvidenceStrength => {
  if (signal.platform === "android") {
    switch (signal.ageRangeSource) {
      case "tier_a":
        return "self_declared";
      case "tier_b":
        return "guardian_managed";
      case "tier_c":
        return "independently_checked";
      case "tier_d":
        return "verified_identity";
      default:
        return "unknown";
    }
  }

  switch (signal.ageRangeDeclaration) {
    case "selfdeclared":
      return "self_declared";
    case "guardiandeclared":
    case "guardiancheckedbyothermethod":
    case "guardiangovernmentidchecked":
    case "guardianpaymentchecked":
      return "guardian_managed";
    case "checkedbyothermethod":
    case "paymentchecked":
      return "independently_checked";
    case "governmentidchecked":
      return "verified_identity";
    default:
      return "unknown";
  }
};

export const participationStateForSignal = (
  signal: NativeAgeSignal
): AgeParticipationState => {
  const requiredFeatures = signal.requiredRegulatoryFeatures ?? [];
  if (
    requiredFeatures.includes(
      "significantAppChangeRequiresParentalConsent"
    ) ||
    signal.significantChangeStatus === "pending" ||
    signal.significantChangeStatus === "declined"
  ) {
    return "needs_parental_consent";
  }
  if (signal.ageSignalsStatus === "verification_required") {
    return "needs_age_signal";
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
};

const reasonForSignal = (
  signal: NativeAgeSignal,
  state: AgeParticipationState
): string => {
  switch (state) {
    case "platform_signal_unavailable":
      return signal.errorMessage ?? "Platform age signal unavailable";
    case "read_only_age_restricted":
      return "Platform age range is below the app participation minimum";
    case "needs_parental_consent":
      return "Platform reports parental consent is required";
    case "age_signal_declined_required":
      return "Required platform age sharing was declined";
    case "needs_age_signal":
      return "Platform requires an age signal before participation";
    case "allowed":
      return "Participation allowed by current platform signal";
  }
};

export const buildServerAgePolicy = (
  signal: NativeAgeSignal,
  appId: string
): ServerAgePolicy => {
  const participationState = participationStateForSignal(signal);
  const evidenceStrength = evidenceStrengthForSignal(signal);
  const adultEligibility =
    typeof signal.ageLower === "number" &&
    signal.ageLower >= 18 &&
    (evidenceStrength === "independently_checked" ||
      evidenceStrength === "verified_identity")
      ? "verified"
      : "not_verified";

  return {
    participation_state: participationState,
    source: signal.source,
    platform: signal.platform,
    reason: reasonForSignal(signal, participationState),
    adult_eligibility: adultEligibility,
    ...(signal.ageLower !== undefined || signal.ageUpper !== undefined
      ? {
          age_range: {
            ...(signal.ageLower !== undefined
              ? { lower: signal.ageLower }
              : {}),
            ...(signal.ageUpper !== undefined
              ? { upper: signal.ageUpper }
              : {}),
          },
        }
      : {}),
    ...(signal.requiredRegulatoryFeatures?.length
      ? {
          required_regulatory_features:
            signal.requiredRegulatoryFeatures,
        }
      : {}),
    assurance: {
      signal_version: 2,
      evidence_strength: evidenceStrength,
      client_integrity: "firebase_app_check",
      app_id: appId,
      limitation: "client_relay_not_cryptographically_bound",
      ...(signal.ageRangeSource
        ? { age_range_source: signal.ageRangeSource }
        : {}),
      ...(signal.ageRangeDeclaration
        ? { age_range_declaration: signal.ageRangeDeclaration }
        : {}),
      ...(signal.significantChangeStatus
        ? { significant_change_status: signal.significantChangeStatus }
        : {}),
    },
  };
};
