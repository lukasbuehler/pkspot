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

export function isMediaReportReasons(
  value: unknown,
): value is MediaReportReason[] {
  return Array.isArray(value) && value.length > 0 && value.every(isMediaReportReason);
}

export function areGuestMediaReportReasons(
  value: readonly MediaReportReason[],
): boolean {
  return value.every(isGuestMediaReportReason);
}

export interface SubmitMediaReportRequest {
  media: {
    type: string;
    src: string;
    userId?: string;
    source_page_url?: string;
    is_in_storage?: boolean;
  };
  /** Legacy clients send `reason`; current clients send `reasons`. */
  reason?: MediaReportReason;
  reasons?: MediaReportReason[];
  comment: string;
  reporterEmail?: string;
  locale?: string;
  spotId?: string;
  context?: "spot" | "event" | "media";
  targetId?: string;
  /** Required when the duplicate reason is selected. */
  duplicateMedia?: { src: string };
}

export interface SubmitMediaReportResponse {
  reportId: string;
  created?: boolean;
}
