export type MediaUploadReviewStatus =
  | "uploaded"
  | "scanning"
  | "approved"
  | "needs_review"
  | "blocked"
  | "scan_failed"
  | "audit_flagged";

export type MediaSafetyDecision =
  | "allow"
  | "block"
  | "needs_review"
  | "reportable_match";

export type MediaSafetySeverity =
  | "none"
  | "explicit_non_child"
  | "possible_child_safety"
  | "known_csam_match";

export type MediaUploadTargetKind =
  | "profile"
  | "spot"
  | "post"
  | "challenge"
  | "event"
  | "event_media";

export interface MediaSafetyProviderResult {
  provider: string;
  provider_version: string;
  decision: MediaSafetyDecision;
  severity: MediaSafetySeverity;
  reason?: string;
  labels?: Record<string, string>;
  thresholds?: Record<string, string>;
  perceptual_hashes?: string[];
}

export interface MediaUploadReviewSchema {
  status: MediaUploadReviewStatus;
  source: "upload" | "audit";
  uid?: string;
  target_kind?: MediaUploadTargetKind;
  target_id?: string;
  intake_path?: string;
  audited_path?: string;
  approved_path?: string;
  approved_url?: string;
  content_type?: string;
  sha256?: string;
  scan_result?: MediaSafetyProviderResult;
  destination_folder?: string;
  destination_filename?: string;
  created_at: unknown;
  completed_at?: unknown;
  failure_reason?: string;
}

export interface CsamIncidentSchema {
  status: "open" | "reported" | "closed";
  source: "upload" | "audit";
  review_path: string;
  uid?: string;
  storage_path?: string;
  sha256?: string;
  scanner: MediaSafetyProviderResult;
  created_at: unknown;
  reporting_note?: string;
}
