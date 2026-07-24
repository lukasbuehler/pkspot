import { MediaSafetyScanSchema } from "./MediaReportSchema";

export type SafetyIncidentStatus =
  | "triage"
  | "contained"
  | "reported"
  | "closed";
export type SafetyIncidentClassification =
  | "undetermined"
  | "ordinary_harm"
  | "illegal_content"
  | "csea"
  | "imminent_danger";
export type SafetyIncidentUkLink = "unknown" | "yes" | "no";
export type SafetyIncidentRetentionState =
  | "triage_hold"
  | "reporting_hold"
  | "legal_hold"
  | "deletion_scheduled"
  | "deleted";

export interface SafetyIncidentSchema {
  status: SafetyIncidentStatus;
  classification: SafetyIncidentClassification;
  uk_link: SafetyIncidentUkLink;
  retention_state: SafetyIncidentRetentionState;
  source_report_path: string;
  review_path?: string;
  storage_path?: string;
  sha256?: string;
  scanner?: MediaSafetyScanSchema;
  containment_summary?: string;
  posthog_context?: string;
  external_report_reference?: string;
  notes?: string;
  created_at: unknown;
  created_by: string;
  updated_at: unknown;
  updated_by: string;
}
