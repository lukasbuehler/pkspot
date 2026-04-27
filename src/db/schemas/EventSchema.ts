import { Timestamp } from "firebase/firestore";

export type EventId = string & { __brand: "EventId" };
export type EventSlug = string & { __brand: "EventSlug" };

export interface EventSlugSchema {
  event_id: EventId | string;
}

export interface EventBoundsSchema {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Region that triggers the event-promo variant of the map island when the
 * map's visible viewport intersects it. Use either a bounding box OR a
 * center+radius. WPF Camp would set a Europe-scale region; a local jam a
 * small radius or none at all (in which case the event won't promote on
 * the map island).
 */
export interface EventPromoRegionSchema {
  bounds?: EventBoundsSchema;
  center?: { lat: number; lng: number };
  radius_m?: number;
}

export interface EventCustomMarkerSchema {
  name?: string;
  location: { lat: number; lng: number };
  icons?: string[];
  color?: "primary" | "secondary" | "tertiary" | "gray";
  priority?: "required" | number;
}

/**
 * A temporary spot that lives only with the event (e.g., a custom-built
 * structure for a jam). NOT stored under /spots/. Selectable on the event
 * page; not check-in-able. Real Firestore spots that are part of an event
 * go in `spot_ids` instead.
 */
export interface InlineEventSpotSchema {
  /** Stable id within the event document. Must be unique per event. */
  id: string;
  name: string;
  location: { lat: number; lng: number };
  bounds?: { lat: number; lng: number }[];
  description?: string;
  /** Optional gallery, first item used as the preview image. */
  images?: string[];
  /** Bigger pin (used for the "main spot" of an event). */
  is_iconic?: boolean;
}

export interface EventSponsorSchema {
  name: string;
  /** Small logo shown on event spot pins and inside the map-island chip. */
  logo_src?: string;
  /** Where the sponsor links to (defaults to event url if absent). */
  url?: string;
}

export interface EventSchema {
  /** Display name (plain string; LocaleMap can be added later if needed). */
  name: string;
  description?: string;

  /** Preferred slug — canonical URL fragment under /events/. */
  slug?: string;

  /** Banner image for event-page header and calendar card. */
  banner_src: string;
  /** Optional event-specific logo (distinct from sponsor logo). */
  logo_src?: string;

  venue_string: string;
  locality_string: string;
  start: Timestamp;
  end: Timestamp;
  /** Optional external event URL (ticketing, organizer site). */
  url?: string;

  /**
   * Optional time at which the map-island promo for this event becomes
   * active. If absent, promo runs from `start` to `end`. After `end` the
   * promo is always hidden.
   */
  promo_starts_at?: Timestamp;

  /** Real Firestore spot ids that are part of this event. */
  spot_ids: string[];

  /**
   * Inline temporary spots embedded in the event document (custom rigs,
   * one-off structures). Rendered on the event page; not check-in-able.
   */
  inline_spots?: InlineEventSpotSchema[];

  /**
   * Static markers (parking, tram, info stand, WC) rendered on the event
   * page map alongside spots.
   */
  custom_markers?: EventCustomMarkerSchema[];

  /**
   * Optional challenge_id -> spot_id mapping. Used by event-page to load
   * the relevant SpotChallenge documents for events that include a
   * challenge set.
   */
  challenge_spot_map?: Record<string, string>;

  /** Map view defaults for the event page. */
  bounds: EventBoundsSchema;
  focus_zoom?: number;

  /**
   * Optional polygon dimming overlay drawn outside the event area. Each
   * inner array is one ring; the first ring is typically the world outline
   * and subsequent rings are the holes (event areas) cut out.
   */
  area_polygon?: { lat: number; lng: number }[][];

  /**
   * Region that surfaces the event in the map-island. If absent, the event
   * does not appear in the island promo at all (only on /events and its
   * own page).
   */
  promo_region?: EventPromoRegionSchema;

  /** Sponsor metadata; presence drives sponsor-logo badges on event spots. */
  sponsor?: EventSponsorSchema;

  /** Optional pre-built JSON-LD blob for SEO. */
  structured_data?: Record<string, any>;

  /** Lifecycle. */
  published?: boolean;
  created_by?: { uid: string; username?: string };
  time_created?: Timestamp;
  time_updated?: Timestamp;
}
