import { MediaSafetyScanSchema } from "./MediaReportSchema";

export interface MediaUploadReviewSchema {
  status:
    | "scanning"
    | "approved"
    | "dismissed"
    | "needs_review"
    | "blocked"
    | "scan_failed"
    | "audit_flagged";
  source?: "upload" | "audit";
  uid?: string;
  target_kind?: string;
  target_id?: string;
  intake_path?: string;
  audited_path?: string;
  approved_path?: string;
  approved_url?: string;
  content_type?: string;
  sha256?: string;
  scan_result?: MediaSafetyScanSchema;
  failure_reason?: string;
  incident_path?: string;
  release_in_progress?: boolean;
  reconciliation_reason?: "legacy_undefined_scan_reason_after_publish";
  reconciled_at?: unknown;
  manual_review?: {
    decision: "safe" | "false_positive";
    reviewed_by: string;
    reviewed_at?: unknown;
  };
  created_at?: unknown;
  completed_at?: unknown;
}
