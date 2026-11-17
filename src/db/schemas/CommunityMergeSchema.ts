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
  /**
   * Present for merges created from a locality that never had a community
   * page (`unpublished_locality`, an explicit admin merge) or that a
   * `community_region_overrides` setting manages (`region_override`).
   */
  source_origin?: "unpublished_locality" | "region_override";
  /**
   * True when the merge created the source page as a redirect placeholder.
   * Undoing such a merge deletes the placeholder; otherwise the source page
   * existed before and is restored as a dormant page.
   */
  source_placeholder_created?: boolean;
  merged_at?: Timestamp | { seconds: number; nanoseconds: number };
  merged_by?: string;
}
