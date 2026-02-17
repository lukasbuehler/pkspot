import { Timestamp } from "firebase/firestore";
import { UserReferenceSchema } from "./UserSchema";
import { SpotSchema } from "./SpotSchema";

export type SpotEditDataSchema = Partial<
  Pick<
    SpotSchema,
    | "name"
    | "location"
    | "description"
    | "media"
    | "external_references"
    | "type"
    | "access"
    | "amenities"
    | "bounds"
    | "slug"
    | "media"
    | "external_references"
    | "type"
    | "access"
    | "amenities"
    | "bounds"
    | "slug"
    | "hide_streetview"
  > & {
    location?:
      | { latitude: number; longitude: number }
      | { lat: number; lng: number }
      | any; // Allow GeoPoint or plain object
  }
>;

export interface SpotEditSchema {
  type: "CREATE" | "UPDATE";
  timestamp: Timestamp;
  timestamp_raw_ms?: number;
  likes?: number;
  approved?: boolean;
  processing_status?: string;
  blocked_reason?: string;
  processed_at?: Timestamp;
  decision_at?: Timestamp;
  user: UserReferenceSchema;
  data: SpotEditDataSchema;
  prevData?: SpotEditDataSchema;
  modification_type?: "APPEND" | "OVERWRITE";
  vote_summary?: {
    yes_count: number;
    no_count: number;
    total_count: number;
    ratio_yes_to_no: number | null;
    submitter_vote: "yes" | "no" | null;
    eligible_for_auto_approval: boolean;
  };
}
