import type { Timestamp } from "firebase/firestore";

export interface CommunitySpotDigestItemSchema {
  spot_id: string;
  spot_name: string;
  spot_path: string;
  image_url: string;
  rating: number;
  community_keys: string[];
  community_names: string[];
  eligible_at: Timestamp;
  eligible_at_raw_ms: number;
  send_after: Timestamp;
  digest_week: string;
  status: "pending" | "included" | "skipped";
  intent_id?: string;
  processed_at?: Timestamp;
}
