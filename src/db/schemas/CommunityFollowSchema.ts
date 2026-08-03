import type { Timestamp } from "firebase/firestore";
import type { CommunityScope } from "./CommunityPageSchema";

export interface CommunityFollowSchema {
  community_key: string;
  scope: CommunityScope;
  display_name: string;
  canonical_path: string;
  image_url?: string;
  time_created: Timestamp;
  time_created_raw_ms: number;
  event_notifications?: boolean;
  spot_digest_notifications?: boolean;
  time_updated?: Timestamp;
  time_updated_raw_ms?: number;
}

export type CommunityFollowDocument = CommunityFollowSchema & { id: string };
