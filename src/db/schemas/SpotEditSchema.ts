import { Timestamp } from "firebase/firestore";
import { UserReferenceSchema } from "./UserSchema";
import { SpotSchema } from "./SpotSchema";
import type { LegacyCompatibleEditTargetMetadata } from "./EditSchema";

export type SpotEditDataSchema = Partial<
  Pick<
    SpotSchema,
    | "name"
    | "location"
    | "location_raw"
    | "description"
    | "media"
    | "external_references"
    | "type"
    | "access"
    | "amenities"
    | "bounds"
    | "bounds_raw"
    | "slug"
    | "hide_streetview"
    | "is_iconic"
  > & {
    location?:
      | { latitude: number; longitude: number }
      | { lat: number; lng: number }
      | any; // Allow GeoPoint or plain object
  }
>;

export interface SpotEditSchema
  extends LegacyCompatibleEditTargetMetadata<"spot"> {
  type: "CREATE" | "UPDATE";
  timestamp: Timestamp;
  timestamp_raw_ms?: number;
  likes?: number;
  approved?: boolean;
  visibility?: "public" | "private";
  review_status?: "pending" | "approved" | "rejected";
  review_organization_id?: string;
  review_organization_ids?: string[];
  review_kind?: "stewarded" | "managed";
  reviewed_by?: UserReferenceSchema;
  reviewed_by_organization_id?: string;
  reviewed_at?: Timestamp;
  review_note?: string;
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
