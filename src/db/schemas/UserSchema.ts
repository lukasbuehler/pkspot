import { DocumentReference, Timestamp } from "firebase/firestore";

export interface UserSchema {
  display_name?: string;
  biography?: string;
  home_spots?: string[];
  profile_picture?: string;
  follower_count?: number;
  spot_creates_count?: number; // Spots created by this user (set by Cloud Function)
  spot_edits_count?: number; // Total edits made by this user (set by Cloud Function)
  media_added_count?: number; // Media items added by this user (set by Cloud Function)
  signup_number?: number; // Permanent user signup number for early adopter badges (set by Cloud Function)
  special_badges?: string[]; // Special badges granted by admin/events (e.g., 'beta_tester', 'swissjam_25')
  pinned_badges?: string[]; // User's preferred display order for badges (max 5)
  start_date?: Timestamp;
  nationality_code?: string;
  verified_email?: boolean;
  invite_code?: string;
  home_city?: string;
  settings?: UserSettingsSchema;

  creationDate?: Timestamp;
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
}

export interface FollowingSchema extends FollowingDataSchema {
  uid: string;
}
