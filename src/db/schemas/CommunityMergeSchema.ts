import type { Timestamp } from "firebase/firestore";
import type {
  CommunityGeographySchema,
  CommunityMergeInfoCardMode,
  CommunityScope,
} from "./CommunityPageSchema";

export interface CommunityMergeSchema {
  source_community_key: string;
  target_community_key: string;
  status: "active";
  source_scope: CommunityScope;
  target_scope: CommunityScope;
  source_display_name: string;
  target_display_name: string;
  source_geography: CommunityGeographySchema;
  target_geography: CommunityGeographySchema;
  source_slugs: string[];
  source_search_aliases: string[];
  info_cards: CommunityMergeInfoCardMode;
  merged_at?: Timestamp | { seconds: number; nanoseconds: number };
  merged_by?: string;
}
