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
export type SafetyIncidentReportingRoute =
  | "pending"
  | "nca_csea_irp"
  | "ncmec_existing_channel"
  | "uk_police"
  | "emergency_services"
  | "not_required";
export type SafetyIncidentReportingStatus =
  | "not_assessed"
  | "registration_required"
  | "preparing"
  | "submitted"
  | "not_required";

export interface SafetyIncidentRunbookSchema {
  evidence_preserved: boolean;
  access_restricted: boolean;
  context_collected: boolean;
  uk_link_assessed: boolean;
  reporting_route_assessed: boolean;
  external_action_recorded: boolean;
}

export interface SafetyIncidentSchema {
  status: SafetyIncidentStatus;
  classification: SafetyIncidentClassification;
  uk_link: SafetyIncidentUkLink;
  retention_state: SafetyIncidentRetentionState;
  reporting_route?: SafetyIncidentReportingRoute;
  reporting_status?: SafetyIncidentReportingStatus;
  runbook?: SafetyIncidentRunbookSchema;
  source_report_path: string;
  review_path?: string;
  storage_path?: string;
  sha256?: string;
  scanner?: MediaSafetyScanSchema;
  containment_summary?: string;
  posthog_context?: string;
  external_report_reference?: string;
  reporting_decision_summary?: string;
  external_reported_at?: unknown;
  notes?: string;
  created_at: unknown;
  created_by: string;
  updated_at: unknown;
  updated_by: string;
}
