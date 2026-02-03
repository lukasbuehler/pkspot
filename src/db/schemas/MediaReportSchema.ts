import { UserReferenceSchema } from "./UserSchema";

export interface MediaReportSchema {
  // Converted to plain object (not StorageImage/ExternalImage class instance)
  media: {
    type: string;
    userId?: string;
    src?: string;
    spotId?: string;
    // ... other media fields
    [key: string]: any;
  };
  spotId?: string;
  reason: string;
  comment: string;
  // User can be authenticated or unauthenticated
  user:
    | UserReferenceSchema // Authenticated user
    | { email: string; uid?: never }; // Unauthenticated with email
  createdAt: Date;
  /** Locale/language code of the reporter (e.g., 'de-CH', 'en', 'fr') */
  locale?: string;
}
