import type { Timestamp } from "firebase/firestore";
import type { UserReferenceSchema } from "./UserSchema";
import type { CommunityInfoCardSchema } from "./CommunityPageSchema";

export type CommunityCardSuggestionStatus =
  | "pending"
  | "approved"
  | "rejected";

/** @deprecated New suggestions are stored as community edit documents. */
export interface CommunityCardSuggestionSchema {
  community_key: string;
  community_display_name?: string;
  community_path?: string;
  card: CommunityInfoCardSchema;
  status: CommunityCardSuggestionStatus;
  created_by: UserReferenceSchema;
  created_at: Timestamp | { seconds: number; nanoseconds: number };
  created_at_raw_ms?: number;
  reviewed_by?: UserReferenceSchema;
  reviewed_at?: Timestamp | { seconds: number; nanoseconds: number };
  review_note?: string;
}
