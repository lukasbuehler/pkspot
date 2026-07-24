export const MEDIA_REPORT_REASONS = [
  "illegal or unsafe content",
  "copyright infringement",
  "person did not consent",
  "tos violation",
  "not relevant",
  "bad quality",
  "duplicate",
  "other",
] as const;

export type MediaReportReason = (typeof MEDIA_REPORT_REASONS)[number];

export const GUEST_MEDIA_REPORT_REASONS = [
  "illegal or unsafe content",
  "copyright infringement",
  "person did not consent",
  "tos violation",
  "other",
] as const satisfies readonly MediaReportReason[];

const guestMediaReportReasons = new Set<string>(GUEST_MEDIA_REPORT_REASONS);

export function isMediaReportReason(value: unknown): value is MediaReportReason {
  return (
    typeof value === "string" &&
    (MEDIA_REPORT_REASONS as readonly string[]).includes(value)
  );
}

export function isGuestMediaReportReason(
  value: unknown,
): value is (typeof GUEST_MEDIA_REPORT_REASONS)[number] {
  return typeof value === "string" && guestMediaReportReasons.has(value);
}

export interface SubmitMediaReportRequest {
  media: {
    type: string;
    src: string;
    userId?: string;
    source_page_url?: string;
    is_in_storage?: boolean;
  };
  reason: MediaReportReason;
  comment: string;
  reporterEmail?: string;
  locale?: string;
  spotId?: string;
  context?: "spot" | "event" | "media";
  targetId?: string;
}

export interface SubmitMediaReportResponse {
  reportId: string;
}
