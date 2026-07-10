import type { Timestamp } from "firebase/firestore";
import type { EditTargetMetadata, EditVisibility } from "./EditSchema";
import type { CommunityInfoCardSchema } from "./CommunityPageSchema";
import type { UserReferenceSchema } from "./UserSchema";

export type CommunityEditStatus = "pending" | "approved" | "rejected";
export type CommunityEditReviewPolicy = "admin" | "community_vote";
export type CommunityKnowledgeEditOperation =
  | "UPSERT_KNOWLEDGE_CARD"
  | "REPLACE_KNOWLEDGE_CARDS";

type FirestoreTimestamp =
  | Timestamp
  | { seconds: number; nanoseconds: number };

interface CommunityEditBase extends EditTargetMetadata<"community"> {
  type: "UPDATE";
  edit_kind: "knowledge";
  status: CommunityEditStatus;
  approved: boolean;
  visibility: EditVisibility;
  review_policy: CommunityEditReviewPolicy;
  user: UserReferenceSchema;
  timestamp: FirestoreTimestamp;
  timestamp_raw_ms: number;
  community_display_name?: string;
  community_path?: string;
  reviewed_by?: UserReferenceSchema;
  reviewed_at?: FirestoreTimestamp;
  review_note?: string;
  decision_at?: FirestoreTimestamp;
  processing_status?: string;
  legacy_source?: {
    collection: "community_card_suggestions";
    id: string;
  };
}

export type CommunityEditSchema = CommunityEditBase &
  (
    | {
        operation: "UPSERT_KNOWLEDGE_CARD";
        data: { card: CommunityInfoCardSchema };
        prevData?: { card: CommunityInfoCardSchema | null };
      }
    | {
        operation: "REPLACE_KNOWLEDGE_CARDS";
        data: { cards: CommunityInfoCardSchema[] };
        prevData?: { cards: CommunityInfoCardSchema[] };
      }
  );
