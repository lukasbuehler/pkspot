import type { Timestamp } from "firebase/firestore";

export interface CommunitySlugSchema {
  communityKey: string;
  isPreferred: boolean;
  alias_for_community_key?: string;
  createdAt?: Timestamp | { seconds: number; nanoseconds: number };
}
