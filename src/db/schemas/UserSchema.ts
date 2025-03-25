import { DocumentReference, Timestamp } from "@firebase/firestore";

export interface UserSchema {
  display_name?: string;
  biography?: string;
  profile_picture?: string;
  follower_count?: number;
  start_date?: Timestamp;
  nationality?: string;
  verified_email?: boolean;
  invite_code?: string;
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
