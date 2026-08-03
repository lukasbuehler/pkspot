export type PublicSpotWarningType =
  | "destroyed"
  | "inaccessible"
  | "temporarily_closed"
  | "access_concern"
  | "other";

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
  const reason =
    typeof reasonValue === "string" ? reasonValue.trim().toLowerCase() : "";

  if (reason.includes("destroy") || reason.includes("torn down")) {
    return {
      type: "destroyed",
      message: "This Spot may have been removed or destroyed.",
    };
  }
  if (reason.includes("inaccessible") || reason.includes("access")) {
    return {
      type: "access_concern",
      message: "Access to this Spot may be restricted or unavailable.",
    };
  }
  if (reason.includes("closed")) {
    return {
      type: "temporarily_closed",
      message: "This Spot may currently be closed.",
    };
  }
  if (reason.includes("duplicate")) {
    return {
      type: "other",
      message: "This Spot may be a duplicate.",
    };
  }
  return {
    type: "other",
    message: "Information about this Spot may be outdated. Please use caution.",
  };
};
