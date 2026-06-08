import { UserReferenceSchema } from "./UserSchema";

export type ReportModerationStatus = "open" | "resolved" | "dismissed";

export interface MediaReportSchema {
  // Converted to plain object (not StorageImage/ExternalImage class instance)
  media: {
    type: string;
    userId?: string;
    src?: string;
    spotId?: string;
    /** Optional explicit storage hint for moderation; old reports may not have it. */
    is_in_storage?: boolean;
    // ... other media fields
    [key: string]: any;
  };
  spotId?: string;
  context?: "spot" | "event" | "media";
  targetId?: string;
  reason: string;
  comment: string;
  // User can be authenticated or unauthenticated
  user:
    | UserReferenceSchema // Authenticated user
    | { email: string; uid?: never }; // Unauthenticated with email
  createdAt: Date;
  /** Locale/language code of the reporter (e.g., 'de-CH', 'en', 'fr') */
  locale?: string;
  status?: ReportModerationStatus;
  resolvedAt?: unknown;
  resolvedBy?: UserReferenceSchema;
  resolutionNote?: string;
}
