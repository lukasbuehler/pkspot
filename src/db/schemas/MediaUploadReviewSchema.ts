import { MediaSafetyScanSchema } from "./MediaReportSchema";

export interface MediaUploadReviewSchema {
  status:
    | "scanning"
    | "approved"
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
  reconciliation_reason?: "legacy_undefined_scan_reason_after_publish";
  reconciled_at?: unknown;
  manual_review?: {
    decision: "safe";
    reviewed_by: string;
    reviewed_at?: unknown;
  };
  created_at?: unknown;
  completed_at?: unknown;
}
