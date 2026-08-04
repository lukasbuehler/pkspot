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
  if (type === "inaccessible" || type === "access_concern") {
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
