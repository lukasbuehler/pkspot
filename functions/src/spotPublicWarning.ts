import {
  PublicSpotNoticeType,
  publicSpotNoticeTypeForReportReason,
} from "../../src/db/schemas/SpotPublicNotice";

export type PublicSpotWarningType = PublicSpotNoticeType;

export interface PublicSpotWarning {
  type: PublicSpotWarningType;
  message: string;
}

/**
 * Converts private report reasons into a small, sanitized public vocabulary.
 * The original text and reporter identity stay on the private report.
 * @param {unknown} reasonValue Private report reason.
 * @return {PublicSpotWarning} Sanitized warning for the public Spot.
 */
export const publicSpotWarningForReason = (
  reasonValue: unknown,
): PublicSpotWarning => {
  const type = publicSpotNoticeTypeForReportReason(reasonValue);

  if (type === "destroyed") {
    return {
      type: "destroyed",
      message: "This Spot may have been removed or destroyed.",
    };
  }
  if (type === "inaccessible") {
    return {
      type,
      message: "This Spot may be inaccessible.",
    };
  }
  if (type === "access_concern") {
    return {
      type,
      message: "Access to this Spot may be restricted or unavailable.",
    };
  }
  if (type === "temporarily_closed") {
    return {
      type: "temporarily_closed",
      message: "This Spot may currently be closed.",
    };
  }
  if (type === "duplicate") {
    return {
      type,
      message: "This Spot may be a duplicate.",
    };
  }
  return {
    type: "other",
    message: "Information about this Spot may be outdated. Please use caution.",
  };
};

const warningPriority: Record<PublicSpotWarningType, number> = {
  destroyed: 60,
  inaccessible: 50,
  temporarily_closed: 40,
  access_concern: 30,
  duplicate: 20,
  other: 10,
};

/**
 * A report may contain several private reasons. Keep the public surface
 * deliberately small by exposing only the most safety-relevant neutral notice.
 */
export const publicSpotWarningForReasons = (
  values: readonly unknown[],
): PublicSpotWarning =>
  values
    .map((value) => publicSpotWarningForReason(value))
    .sort((left, right) => warningPriority[right.type] - warningPriority[left.type])[0] ??
  publicSpotWarningForReason("other");
