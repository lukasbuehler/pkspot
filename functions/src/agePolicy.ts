import {createHash} from "node:crypto";
import {HttpsError} from "firebase-functions/v2/https";

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

export type PkSpotAgeBand =
  | "unknown"
  | "under_13"
  | "13_to_15"
  | "16_to_17"
  | "18_plus"
  | "mixed_or_custom";

export type AgeAssuranceConfidence =
  | "none"
  | "declared"
  | "corroborated"
  | "verified"
  | "strongly_verified";

export type AgeAssuranceProvider =
  | "google_play"
  | "apple"
  | "external";

export type AgeAssuranceMethodCategory =
  | "platform_age_signal"
  | "self_declaration"
  | "guardian_assertion"
  | "age_estimation"
  | "mobile_network"
  | "financial_attribute"
  | "digital_identity"
  | "government_id"
  | "email_estimation"
  | "unknown";

export interface NativeAgeSignal {
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
}

export interface AgePolicyBuildContext {
  appId: string;
  signalVersion: 2 | 3;
  clientIntegrity:
    | "firebase_app_check"
    | "play_integrity_request_bound";
  cryptographicallyBound: boolean;
}

export interface ServerAgePolicy {
  participation_state: AgeParticipationState;
  source: NativeAgeSignal["source"];
  platform: NativeAgeSignal["platform"];
  reason: string;
  adult_eligibility: "verified" | "not_verified";
  age_band: PkSpotAgeBand;
  age_range?: {
    lower?: number;
    upper?: number;
  };
  required_regulatory_features?: string[];
  assurance: {
    signal_version: 2 | 3;
    policy_version: 1;
    evidence_strength: AgeEvidenceStrength;
    confidence: AgeAssuranceConfidence;
    client_integrity: AgePolicyBuildContext["clientIntegrity"];
    app_id: string;
    method: {
      provider: AgeAssuranceProvider;
      category: AgeAssuranceMethodCategory;
      provider_method: string;
    };
    approval_basis?: string;
    limitation?:
      | "client_relay_not_cryptographically_bound"
      | "platform_account_or_device_may_be_shared";
    age_range_source?: NativeAgeSignal["ageRangeSource"];
    age_range_declaration?: string;
    significant_change_status?: NativeAgeSignal["significantChangeStatus"];
  };
}

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
    throw new HttpsError(
      "invalid-argument",
      "Signal availability is required."
    );
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
    ...(typeof value["isEligibleForAgeFeatures"] === "boolean" ?
      {isEligibleForAgeFeatures: value["isEligibleForAgeFeatures"]} :
      {}),
    requiredRegulatoryFeatures: stringList(
      value["requiredRegulatoryFeatures"]
    ),
    ...(typeof value["errorMessage"] === "string" ?
      {errorMessage: value["errorMessage"].slice(0, 300)} :
      {}),
  };
};

export const ageBandForRange = (
  lower?: number,
  upper?: number
): PkSpotAgeBand => {
  if (upper !== undefined && upper <= 12) return "under_13";
  if (lower !== undefined && lower >= 18) return "18_plus";
  if (
    lower !== undefined &&
    upper !== undefined &&
    lower >= 16 &&
    upper <= 17
  ) {
    return "16_to_17";
  }
  if (
    lower !== undefined &&
    upper !== undefined &&
    lower >= 13 &&
    upper <= 15
  ) {
    return "13_to_15";
  }
  if (lower !== undefined || upper !== undefined) return "mixed_or_custom";
  return "unknown";
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

export const confidenceForEvidence = (
  evidence: AgeEvidenceStrength
): AgeAssuranceConfidence => {
  switch (evidence) {
  case "self_declared":
    return "declared";
  case "guardian_managed":
    return "corroborated";
  case "independently_checked":
    return "verified";
  case "verified_identity":
    return "strongly_verified";
  case "unknown":
    return "none";
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

const providerForSignal = (
  signal: NativeAgeSignal
): AgeAssuranceProvider =>
  signal.platform === "android" ? "google_play" : "apple";

const providerMethodForSignal = (signal: NativeAgeSignal): string =>
  signal.platform === "android" ?
    signal.ageRangeSource ?? "unknown" :
    signal.ageRangeDeclaration ?? "unknown";

const approvalBasisForSignal = (
  signal: NativeAgeSignal,
  context: AgePolicyBuildContext
): string | undefined => {
  if (!context.cryptographicallyBound) return undefined;
  const provider = providerForSignal(signal);
  const method = providerMethodForSignal(signal);
  return `${provider}:platform_age_signal:${method}:request_bound:v1`;
};

export const buildServerAgePolicy = (
  signal: NativeAgeSignal,
  context: AgePolicyBuildContext
): ServerAgePolicy => {
  const participationState = participationStateForSignal(signal);
  const evidenceStrength = evidenceStrengthForSignal(signal);
  const confidence = confidenceForEvidence(evidenceStrength);
  const ageBand = ageBandForRange(signal.ageLower, signal.ageUpper);
  const adultEligibility =
    context.cryptographicallyBound &&
    ageBand === "18_plus" &&
    (evidenceStrength === "independently_checked" ||
      evidenceStrength === "verified_identity") ?
      "verified" :
      "not_verified";
  const approvalBasis =
    adultEligibility === "verified" ?
      approvalBasisForSignal(signal, context) :
      undefined;

  return {
    participation_state: participationState,
    source: signal.source,
    platform: signal.platform,
    reason: reasonForSignal(signal, participationState),
    adult_eligibility: adultEligibility,
    age_band: ageBand,
    ...(signal.ageLower !== undefined || signal.ageUpper !== undefined ?
      {
        age_range: {
          ...(signal.ageLower !== undefined ?
            {lower: signal.ageLower} :
            {}),
          ...(signal.ageUpper !== undefined ?
            {upper: signal.ageUpper} :
            {}),
        },
      } :
      {}),
    ...(signal.requiredRegulatoryFeatures?.length ?
      {
        required_regulatory_features:
            signal.requiredRegulatoryFeatures,
      } :
      {}),
    assurance: {
      signal_version: context.signalVersion,
      policy_version: 1,
      evidence_strength: evidenceStrength,
      confidence,
      client_integrity: context.clientIntegrity,
      app_id: context.appId,
      method: {
        provider: providerForSignal(signal),
        category: "platform_age_signal",
        provider_method: providerMethodForSignal(signal),
      },
      ...(approvalBasis ? {approval_basis: approvalBasis} : {}),
      limitation: context.cryptographicallyBound ?
        "platform_account_or_device_may_be_shared" :
        "client_relay_not_cryptographically_bound",
      ...(signal.ageRangeSource ?
        {age_range_source: signal.ageRangeSource} :
        {}),
      ...(signal.ageRangeDeclaration ?
        {age_range_declaration: signal.ageRangeDeclaration} :
        {}),
      ...(signal.significantChangeStatus ?
        {significant_change_status: signal.significantChangeStatus} :
        {}),
    },
  };
};

const bindingValue = (value: unknown): string => {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
};

const bindingValues = (
  uid: string,
  challengeId: string,
  challengeNonce: string,
  signal: NativeAgeSignal
): string[] => [
  uid,
  challengeId,
  challengeNonce,
  signal.platform,
  signal.source,
  bindingValue(signal.available),
  bindingValue(signal.response),
  bindingValue(signal.ageSignalsStatus),
  bindingValue(signal.ageLower),
  bindingValue(signal.ageUpper),
  bindingValue(signal.ageRangeSource),
  bindingValue(signal.significantChangeStatus),
];

export const canonicalAgeAssuranceBinding = (
  uid: string,
  challengeId: string,
  challengeNonce: string,
  signal: NativeAgeSignal
): Buffer => {
  const chunks = [Buffer.from("pkspot-age-assurance-v3", "utf8")];
  for (const value of bindingValues(
    uid,
    challengeId,
    challengeNonce,
    signal
  )) {
    const encoded = Buffer.from(value, "utf8");
    chunks.push(Buffer.from(`${encoded.length}:`, "ascii"), encoded);
  }
  return Buffer.concat(chunks);
};

export const ageAssuranceRequestHash = (
  uid: string,
  challengeId: string,
  challengeNonce: string,
  signal: NativeAgeSignal
): string =>
  createHash("sha256")
    .update(
      canonicalAgeAssuranceBinding(
        uid,
        challengeId,
        challengeNonce,
        signal
      )
    )
    .digest("base64url");
