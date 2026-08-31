import { UserReferenceSchema } from "./UserSchema";

/**
 * `superseded` is retained only for records produced by the temporary legacy
 * bridge. It never appears in a reporter's report history.
 */
export type ReportModerationStatus =
  | "open"
  | "resolved"
  | "dismissed"
  | "withdrawn"
  | "superseded";

/**
 * Private snapshot used for moderation follow-up. Authenticated reporter
 * details are replaced by a server-authoritative Auth snapshot after create.
 */
export interface ModerationReporterSchema {
  uid?: string;
  email?: string;
  email_verified?: boolean;
  display_name?: string;
  profile_picture?: string;
}

export interface MediaReportSubmissionSchema {
  channel: "callable" | "direct" | "legacy_bridge" | "scanner";
  authenticated: boolean;
  app_check: boolean;
  app_id?: string;
  ip_address?: string;
  ip_hash?: string;
  user_agent?: string;
  origin?: string;
  contact_email_verified?: boolean;
  metadata_expires_at?: unknown;
  /** Marks a report that may drive moderation and public projections. */
  canonical?: boolean;
  accepted_at?: unknown;
}

export interface MediaSafetyScanSchema {
  provider: string;
  provider_version: string;
  decision: "allow" | "block" | "needs_review" | "reportable_match";
  severity:
    | "none"
    | "explicit_non_child"
    | "possible_child_safety"
    | "known_csam_match";
  reason?: string;
  labels?: Record<string, string>;
  thresholds?: Record<string, string>;
}

export interface MediaReportSchema {
  /** Present on reports in the current root reports collection. */
  kind?: "media";
  // Converted to plain object (not StorageImage/ExternalImage class instance)
  media: {
    type: string;
    userId?: string;
    src?: string;
    spotId?: string;
    /** Optional explicit storage hint for moderation; old reports may not have it. */
    is_in_storage?: boolean;
    /** Storage object path for internal scanner reports. */
    storage_path?: string;
    /** Exact content hash recorded by the media safety pipeline. */
    sha256?: string;
    // ... other media fields
    [key: string]: unknown;
  };
  spotId?: string;
  context?: "spot" | "event" | "media";
  targetId?: string;
  /** Server-derived identity used to serialize an authenticated user's report. */
  target_key?: string;
  reason: string;
  /** Canonical reasons. `reason` remains for released moderation clients. */
  reasons?: string[];
  /** Private reference to the media selected as the duplicate target. */
  duplicate_media?: { type: string; src: string };
  comment: string;
  // Guest safety/legal reports may only have an optional contact email.
  // Authenticated identities are replaced with server-authoritative values.
  user: ModerationReporterSchema;
  createdAt: Date;
  /** Omitted or "user" for community reports; "scanner" for internal safety findings. */
  source?: "user" | "scanner";
  scanner_source?: "upload" | "audit";
  review_path?: string;
  incident_path?: string;
  scanner?: MediaSafetyScanSchema;
  /** Private request context captured by the callable report endpoint. */
  submission?: MediaReportSubmissionSchema;
  /** Locale/language code of the reporter (e.g., 'de-CH', 'en', 'fr') */
  locale?: string;
  status?: ReportModerationStatus;
  updated_at?: unknown;
  withdrawn_at?: unknown;
  superseded_at?: unknown;
  superseded_into?: string;
  resolvedAt?: unknown;
  resolvedBy?: UserReferenceSchema;
  resolutionNote?: string;
}
