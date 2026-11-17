import type { Timestamp } from "firebase/firestore";

/**
 * Server-owned setting stored at `community_region_overrides/{targetKey}`.
 *
 * Some countries geocode metro areas into many small suburb localities (for
 * example Sydney, whose suburbs are each a Google `locality`). An override
 * lets one locality community absorb every locality in the same first-level
 * region (`address.region`, such as NSW) whose spots lie within `radius_km`
 * of `center`. The server materialises each absorbed locality as an ordinary
 * `community_merges` record with `source_origin: "region_override"`, so all
 * existing merge readers keep working.
 */
export interface CommunityRegionOverrideSchema {
  target_community_key: string;
  /** Uppercase ISO alpha-2 code of the target community's country. */
  country_code: string;
  region_code?: string;
  region_name?: string;
  region_slug?: string;
  /**
   * Fixed reference point for the radius. Stored instead of derived from the
   * target page, whose bounds move as merged localities join it.
   */
  center: { lat: number; lng: number };
  radius_km: number;
  updated_at?: Timestamp | { seconds: number; nanoseconds: number };
  updated_by?: string;
}
