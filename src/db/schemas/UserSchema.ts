import type { DocumentReference, Timestamp } from "firebase/firestore";

export interface UserSocialCustomLinkSchema {
  name: string;
  url: string;
}

export interface UserSocialsSchema {
  instagram_handle?: string;
  youtube_handle?: string;
  tiktok_handle?: string;
  discord_url?: string;
  other?: UserSocialCustomLinkSchema[];
}

export type UserAccountPrivacy = "public" | "private";
export type UserProfileVisibility = "public" | "followers" | "mutuals";
export type UserProfileAccessLevel = "limited" | "full";
export type UserModerationStatus =
  | "active"
  | "profile_restricted"
  | "contribution_restricted"
  | "suspended";

export interface UserModerationStateSchema {
  status: UserModerationStatus;
  case_id?: string;
  applied_at?: Timestamp | Date;
  applied_by?: {
    uid: string;
    display_name?: string;
  };
}

export type AgeParticipationState =
  | "allowed"
  | "read_only_age_restricted"
  | "needs_age_signal"
  | "needs_parental_consent"
  | "age_signal_declined_required"
  | "platform_signal_unavailable";

export type AgeEvidenceStrength =
  | "unknown"
  | "self_declared"
  | "guardian_managed"
  | "independently_checked"
  | "verified_identity";

export type PkSpotAgeBand =
  | "unknown"
  | "under_13"
  | "13_to_15"
  | "16_to_17"
  | "18_plus"
  | "mixed_or_custom";

export type AgeAssuranceConfidence =
  | "none"
  | "declared"
  | "corroborated"
  | "verified"
  | "strongly_verified";

export type AgeAssuranceMethodCategory =
  | "platform_age_signal"
  | "self_declaration"
  | "guardian_assertion"
  | "age_estimation"
  | "mobile_network"
  | "financial_attribute"
  | "digital_identity"
  | "government_id"
  | "email_estimation"
  | "unknown";

export interface UserAgePolicySchema {
  participation_state?: AgeParticipationState;
  source?:
    | "android_play_age_signals"
    | "ios_declared_age_range"
    | "web_tos"
    | "manual";
  platform?: "android" | "ios" | "web";
  signal_updated_at?: Timestamp | Date;
  reason?: string;
  adult_eligibility?: "verified" | "not_verified";
  age_band?: PkSpotAgeBand;
  age_range?: {
    lower?: number;
    upper?: number;
  };
  required_regulatory_features?: string[];
  assurance?: {
    signal_version?: 1 | 2 | 3;
    policy_version?: 1;
    evidence_strength?: AgeEvidenceStrength;
    confidence?: AgeAssuranceConfidence;
    client_integrity?:
      | "unverified_client"
      | "firebase_app_check"
      | "play_integrity_request_bound";
    app_id?: string;
    verification_id?: string;
    status?: "active" | "expired" | "invalidated" | "superseded";
    evaluated_at?: Timestamp | Date;
    verified_at?: Timestamp | Date;
    /** Legacy freshness field; current approvals remain active until invalidated. */
    valid_until?: Timestamp | Date;
    /** Retained for compatibility with previously expired assurance records. */
    previous_valid_until?: Timestamp | Date;
    status_changed_at?: Timestamp | Date;
    status_reason?: string;
    approval_basis?: string;
    previous_approval_basis?: string;
    method?: {
      provider?: "google_play" | "apple" | "external";
      category?: AgeAssuranceMethodCategory;
      provider_method?: string;
    };
    limitation?:
      | "legacy_client_asserted_policy"
      | "client_relay_not_cryptographically_bound"
      | "platform_account_or_device_may_be_shared";
    age_range_source?:
      | "tier_a"
      | "tier_b"
      | "tier_c"
      | "tier_d"
      | "unknown";
    age_range_declaration?: string;
    significant_change_status?:
      | "approved"
      | "pending"
      | "declined"
      | "unknown";
  };
}

export interface UserSchema {
  display_name?: string;
  biography?: string;
  home_spots?: string[];
  profile_picture?: string;
  follower_count?: number;
  following_count?: number;
  visited_spots_count?: number;
  spot_creates_count?: number; // Spots created by this user (set by Cloud Function)
  spot_edits_count?: number; // Total edits made by this user (set by Cloud Function)
  media_added_count?: number; // Media items added by this user (set by Cloud Function)
  signup_number?: number; // Permanent user signup number for early adopter badges (set by Cloud Function)
  is_admin?: boolean; // Admin-only moderation access (set manually/server-side)
  special_badges?: string[]; // Special badges granted by admin/events (e.g., 'beta_tester', 'swissjam_25')
  blocked_users?: string[]; // IDs of users blocked by this user
  pinned_badges?: string[]; // User's preferred display order for badges (max 5)
  start_date?: Timestamp;
  start_date_raw_ms?: number;
  nationality_code?: string;
  verified_email?: boolean;
  invite_code?: string;
  home_city?: string;
  socials?: UserSocialsSchema;
  age_policy?: UserAgePolicySchema;
  /** Server-owned moderation state; clients cannot set or clear it. */
  moderation_state?: UserModerationStateSchema;
  account_privacy?: UserAccountPrivacy;
  profile_visibility?: UserProfileVisibility;
  /**
   * Legacy-compatible projection of the unified profile privacy choice.
   * Current clients keep this aligned with account_privacy and
   * profile_visibility; it remains explicit for older clients and server rules.
   */
  public_profile_enabled?: boolean;
  /**
   * Explicit opt-in for sitemaps and the future public Typesense user index.
   * It is only effective while public_profile_enabled is also effective.
   */
  public_search?: boolean;
  /**
   * Server-returned access marker used by viewer-specific profile responses.
   * It is not a client-writable field on the authoritative user document.
   */
  profile_access?: UserProfileAccessLevel;

  creationDate?: Timestamp;
  // NOTE: bookmarks, visited_spots, and settings are now in private_data subcollection
  // See PrivateUserDataSchema
}

export interface UserSettingsSchema {
  maps?: "googlemaps" | "applemaps" | "openstreetmap";
  useGeoURI?: boolean;
  temperature_unit?: "local" | "celsius" | "fahrenheit";
}

export interface UserReferenceSchema {
  uid: string;
  display_name?: string;
  profile_picture?: string;
  ref?: DocumentReference;
}

/**
 * Server-sanitized profile returned to another viewer. Limited profiles only
 * contain the stable identity and access fields needed to render a profile
 * shell and request a follow.
 */
export interface AccessibleUserProfileSchema extends UserSchema {
  profile_access: UserProfileAccessLevel;
}

/**
 * Adult, explicitly opted-in profile projection used by public SSR, sitemaps,
 * and the future Typesense user collection. Clients cannot write it directly.
 */
export interface PublicUserProfileSchema extends UserSchema {
  public_profile_enabled: true;
  public_search: boolean;
  profile_access: "full";
  profile_projection_version: 1;
}

export interface FollowingDataSchema {
  // UID is not needed as it is the identifier of the following
  display_name?: string;
  profile_picture?: string;

  start_following?: Timestamp;
  start_following_raw_ms?: number;
}

export interface FollowingSchema extends FollowingDataSchema {
  uid: string;
}

export interface FollowRequestDataSchema {
  display_name?: string;
  profile_picture?: string;
  requested_at?: Timestamp;
  requested_at_raw_ms?: number;
}

export interface FollowRequestSchema extends FollowRequestDataSchema {
  uid: string;
}
