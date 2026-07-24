import { UserReferenceSchema } from "./UserSchema";

export type ReportModerationStatus = "open" | "resolved" | "dismissed";

/**
 * Private snapshot used for moderation follow-up. Authenticated reporter
 * details are replaced by a server-authoritative Auth snapshot after create.
 */
export interface ModerationReporterSchema {
  uid?: string;
  email?: string;
  display_name?: string;
  profile_picture?: string;
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
  reason: string;
  comment: string;
  // User reports require an authenticated uid. Historical or scanner-created
  // records may still omit it, so readers keep this shape backwards-compatible.
  user: ModerationReporterSchema;
  createdAt: Date;
  /** Omitted or "user" for community reports; "scanner" for internal safety findings. */
  source?: "user" | "scanner";
  scanner_source?: "upload" | "audit";
  review_path?: string;
  incident_path?: string;
  scanner?: MediaSafetyScanSchema;
  /** Locale/language code of the reporter (e.g., 'de-CH', 'en', 'fr') */
  locale?: string;
  status?: ReportModerationStatus;
  resolvedAt?: unknown;
  resolvedBy?: UserReferenceSchema;
  resolutionNote?: string;
}
