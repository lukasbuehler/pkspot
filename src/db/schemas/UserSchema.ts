import type { DocumentReference, Timestamp } from "firebase/firestore";

export interface UserSocialCustomLinkSchema {
  name: string;
  url: string;
}

export interface UserSocialsSchema {
  instagram_handle?: string;
  youtube_handle?: string;
  other?: UserSocialCustomLinkSchema[];
}

export type UserAccountPrivacy = "public" | "private";
export type UserProfileVisibility = "public" | "followers" | "mutuals";

export type AgeParticipationState =
  | "allowed"
  | "read_only_age_restricted"
  | "needs_age_signal"
  | "needs_parental_consent"
  | "age_signal_declined_required"
  | "platform_signal_unavailable";

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
  age_range?: {
    lower?: number;
    upper?: number;
  };
  required_regulatory_features?: string[];
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
  account_privacy?: UserAccountPrivacy;
  profile_visibility?: UserProfileVisibility;

  creationDate?: Timestamp;
  // NOTE: bookmarks, visited_spots, and settings are now in private_data subcollection
  // See PrivateUserDataSchema
}

export interface UserSettingsSchema {
  maps?: "googlemaps" | "applemaps" | "openstreetmap";
  useGeoURI?: boolean;
}

export interface UserReferenceSchema {
  uid: string;
  display_name?: string;
  profile_picture?: string;
  ref?: DocumentReference;
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
