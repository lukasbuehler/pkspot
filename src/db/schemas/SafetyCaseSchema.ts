export const SAFETY_CASE_TYPES = ["report", "complaint", "appeal"] as const;
export type SafetyCaseType = (typeof SAFETY_CASE_TYPES)[number];

export const SAFETY_CASE_STATUSES = [
  "received",
  "triaged",
  "under_review",
  "awaiting_information",
  "resolved",
  "closed",
] as const;
export type SafetyCaseStatus = (typeof SAFETY_CASE_STATUSES)[number];

export const SAFETY_CASE_PRIORITIES = [
  "immediate",
  "urgent",
  "standard",
  "low",
] as const;
export type SafetyCasePriority = (typeof SAFETY_CASE_PRIORITIES)[number];

export const SAFETY_CASE_CATEGORIES = [
  "child_safety",
  "self_harm_or_suicide",
  "dangerous_activity",
  "sexual_content",
  "harassment_or_hate",
  "privacy_or_doxxing",
  "impersonation",
  "spam_or_malicious_link",
  "unsafe_place_or_access",
  "media_consent",
  "illegal_content",
  "reporting_access",
  "report_handling",
  "content_or_account_decision",
  "automated_media_decision",
  "age_assurance_decision",
  "safety_duty_compliance",
  "privacy_or_data_use",
  "other_safety",
  "other_service",
] as const;
export type SafetyCaseCategory = (typeof SAFETY_CASE_CATEGORIES)[number];

export const SAFETY_CASE_SUBJECT_TYPES = [
  "spot",
  "media",
  "profile",
  "account",
  "event",
  "age_assurance",
  "service",
  "other",
] as const;
export type SafetyCaseSubjectType =
  (typeof SAFETY_CASE_SUBJECT_TYPES)[number];

export const SAFETY_CASE_OUTCOMES = [
  "action_taken",
  "no_action",
  "partially_upheld",
  "upheld",
  "reversed",
  "retry_required",
  "superseded",
] as const;
export type SafetyCaseOutcome = (typeof SAFETY_CASE_OUTCOMES)[number];

export const SAFETY_CASE_DECISION_TYPES = [
  "close_without_action",
  "publish_warning",
  "restrict_media",
  "unpublish_spot",
  "restrict_profile",
  "restrict_account",
  "confirm_automated_media_decision",
  "release_automated_media",
  "confirm_age_assurance_decision",
  "request_age_assurance_retry",
] as const;
export type SafetyCaseDecisionType =
  (typeof SAFETY_CASE_DECISION_TYPES)[number];

export type SafetyCaseEventVisibility =
  | "staff"
  | "submitter"
  | "subject"
  | "participants";

export interface SafetyCaseSubjectSchema {
  type: SafetyCaseSubjectType;
  path?: string;
  owner_uid?: string;
  label?: string;
  media_src?: string;
  storage_path?: string;
}

export interface SafetyCaseReviewerSchema {
  uid: string;
  display_name?: string;
}

export interface SafetyCaseDecisionSchema {
  type: SafetyCaseDecisionType;
  outcome: SafetyCaseOutcome;
  public_reason: string;
  policy_basis?: string;
  decided_at: unknown;
  decided_by: SafetyCaseReviewerSchema;
  hold_path?: string;
  restored_at?: unknown;
  restored_by?: SafetyCaseReviewerSchema;
}

export interface SafetyCaseSchema {
  case_type: SafetyCaseType;
  public_reference: string;
  category: SafetyCaseCategory;
  priority: SafetyCasePriority;
  status: SafetyCaseStatus;
  subject: SafetyCaseSubjectSchema;
  summary: string;
  description: string;
  source_paths: string[];
  parent_case_id?: string;
  root_case_id?: string;
  appeal_case_id?: string;
  appeal_case_ids?: {
    submitter?: string;
    subject?: string;
  };
  appellant_role?: "submitter" | "subject";
  submitter_uid?: string;
  subject_uid?: string;
  contact_email_verified: boolean;
  locale: string;
  acknowledged_at: unknown;
  target_resolution_at: unknown;
  complex_resolution_at: unknown;
  created_at: unknown;
  updated_at: unknown;
  assigned_to?: SafetyCaseReviewerSchema;
  original_reviewer?: SafetyCaseReviewerSchema;
  appeal_reviewer?: SafetyCaseReviewerSchema;
  independence_limitation?: string;
  incident_path?: string;
  decision?: SafetyCaseDecisionSchema;
  resolved_at?: unknown;
  closed_at?: unknown;
  legacy_import?: boolean;
}

export interface SafetyCasePrivateIntakeSchema {
  submitter_uid?: string;
  contact_email?: string;
  contact_email_verified: boolean;
  reporter_display_name?: string;
  reporter_profile_picture?: string;
  ip_address?: string;
  ip_hash?: string;
  user_agent?: string;
  origin?: string;
  app_id?: string;
  app_check: boolean;
  authenticated: boolean;
  metadata_expires_at?: unknown;
  original_payload?: Record<string, unknown>;
}

export interface SafetyCaseEventSchema {
  type:
    | "case_created"
    | "contact_verified"
    | "status_changed"
    | "assigned"
    | "message"
    | "information_requested"
    | "decision_recorded"
    | "appeal_created"
    | "content_restricted"
    | "content_restored"
    | "incident_linked"
    | "legacy_imported";
  visibility: SafetyCaseEventVisibility;
  created_at: unknown;
  created_by?: SafetyCaseReviewerSchema;
  participant_role?: "submitter" | "subject";
  message?: string;
  from_status?: SafetyCaseStatus;
  to_status?: SafetyCaseStatus;
  decision?: SafetyCaseDecisionSchema;
  linked_case_id?: string;
  metadata?: Record<string, unknown>;
}

export interface SafetyCasePublicView {
  public_reference: string;
  case_type: SafetyCaseType;
  category: SafetyCaseCategory;
  priority: SafetyCasePriority;
  status: SafetyCaseStatus;
  subject: SafetyCaseSubjectSchema;
  summary: string;
  description: string;
  acknowledged_at: string;
  target_resolution_at: string;
  complex_resolution_at: string;
  created_at: string;
  updated_at: string;
  parent_public_reference?: string;
  decision?: {
    type: SafetyCaseDecisionType;
    outcome: SafetyCaseOutcome;
    public_reason: string;
    policy_basis?: string;
    decided_at: string;
    restored_at?: string;
  };
  events: {
    id: string;
    type: SafetyCaseEventSchema["type"];
    message?: string;
    created_at: string;
    participant_role?: "submitter" | "subject";
  }[];
  can_appeal: boolean;
}

export const isSafetyCaseType = (value: unknown): value is SafetyCaseType =>
  typeof value === "string" &&
  (SAFETY_CASE_TYPES as readonly string[]).includes(value);

export const isSafetyCaseCategory = (
  value: unknown,
): value is SafetyCaseCategory =>
  typeof value === "string" &&
  (SAFETY_CASE_CATEGORIES as readonly string[]).includes(value);

export const isSafetyCaseSubjectType = (
  value: unknown,
): value is SafetyCaseSubjectType =>
  typeof value === "string" &&
  (SAFETY_CASE_SUBJECT_TYPES as readonly string[]).includes(value);

export const isSafetyCaseStatus = (
  value: unknown,
): value is SafetyCaseStatus =>
  typeof value === "string" &&
  (SAFETY_CASE_STATUSES as readonly string[]).includes(value);

export const isSafetyCasePriority = (
  value: unknown,
): value is SafetyCasePriority =>
  typeof value === "string" &&
  (SAFETY_CASE_PRIORITIES as readonly string[]).includes(value);

export const isSafetyCaseDecisionType = (
  value: unknown,
): value is SafetyCaseDecisionType =>
  typeof value === "string" &&
  (SAFETY_CASE_DECISION_TYPES as readonly string[]).includes(value);

export const isSafetyCaseOutcome = (
  value: unknown,
): value is SafetyCaseOutcome =>
  typeof value === "string" &&
  (SAFETY_CASE_OUTCOMES as readonly string[]).includes(value);
