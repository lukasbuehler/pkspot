import { Timestamp } from "firebase/firestore";

/**
 * A series groups recurring or themed events under one banner — e.g. the
 * Swiss Parkour Tour, Sport Parkour League, Parkour Earth qualifiers.
 * Stored at `/series/{seriesId}`. Events reference their memberships via
 * `EventSchema.series_ids[]`.
 */
export type SeriesId = string & { __brand: "SeriesId" };

export interface SeriesSchema {
  /** Display name, e.g. "Swiss Parkour Tour". */
  name: string;
  /** URL slug used at `/series/{slug}` (admin-curated; no auto-slugify). */
  slug?: string;
  /** Long description shown on the series landing page. */
  description?: string;
  /** Optional logo shown on event-page chips and the series landing. */
  logo_src?: string;
  /** Organizer name (e.g. "Swiss Parkour Association"). */
  organizer?: string;
  /** Organizer site URL. */
  organizer_url?: string;
  /** Series' main site (separate from organizer if different). */
  url?: string;
  /**
   * Optional brand color (hex). Used to tint series chips on event pages
   * — keep contrast in mind when picking values.
   */
  color?: string;

  /** Lifecycle. */
  published?: boolean;
  time_created?: Timestamp;
  time_updated?: Timestamp;
}
