export const publicSpotNoticeTypes = [
  "destroyed",
  "inaccessible",
  "temporarily_closed",
  "access_concern",
  "duplicate",
  "other",
] as const;

export type PublicSpotNoticeType = (typeof publicSpotNoticeTypes)[number];

export interface PublicSpotNotice {
  type: PublicSpotNoticeType;
  message: string;
  published_at?: unknown;
  source?: "moderator" | "community_report" | "legacy_report_migration";
}

export const publicSpotNoticeTypeForReportReason = (
  reasonValue: unknown,
): PublicSpotNoticeType => {
  const reason =
    typeof reasonValue === "string" ? reasonValue.trim().toLowerCase() : "";

  if (reason.includes("destroy") || reason.includes("torn down")) {
    return "destroyed";
  }
  if (reason.includes("inaccessible")) {
    return "inaccessible";
  }
  if (reason.includes("closed")) {
    return "temporarily_closed";
  }
  if (reason.includes("access")) {
    return "access_concern";
  }
  if (reason.includes("duplicate")) {
    return "duplicate";
  }
  return "other";
};

export const normalizePublicSpotNoticeType = (
  notice: PublicSpotNotice | undefined,
  legacyReason: string | undefined,
): PublicSpotNoticeType => {
  if (notice?.type === "duplicate") {
    return "duplicate";
  }

  const compatibilityText = `${notice?.message ?? ""} ${legacyReason ?? ""}`;
  if (compatibilityText.toLowerCase().includes("duplicate")) {
    return "duplicate";
  }

  return notice?.type ?? publicSpotNoticeTypeForReportReason(legacyReason);
};
