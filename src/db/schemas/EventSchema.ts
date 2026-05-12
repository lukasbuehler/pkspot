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
  /** Optional hex background color behind sponsor logos. Transparent when absent. */
  logo_background_color?: string;
  /** Where the sponsor links to (defaults to event url if absent). */
  url?: string;
}

/**
 * Marks an event whose canonical home lives outside PK Spot (e.g. an
 * EventFrog ticket page hosted by a partner). Used for two patterns:
 *
 *  1. Lightweight thin event docs that exist only to surface an external
 *     event in PK Spot's calendar / map / community pages. These have
 *     minimal PK Spot fields (name, dates, locality_string, bounds), no
 *     spots, no banner upload — the user clicks through to the source.
 *
 *  2. Full PK Spot events that ALSO have an external ticket page (e.g.
 *     WPF Camp's EventFrog listing). The CTA renders as "View on
 *     EventFrog" instead of a generic `url`, with a provider-aware label.
 */
export interface EventExternalSourceSchema {
  /**
   * Source platform. `other` covers anything not yet first-class — the
   * UI falls back to a generic "View source" label.
   */
  provider: "eventfrog" | "spt" | "spl" | "parkour_earth" | "other";
  /**
   * Provider-specific id (e.g. EventFrog event id). Optional for `other`
   * URLs that don't have a stable id; used for de-duplication when
   * importing batches.
   */
  id?: string;
  /** Canonical link out to the source's event page. */
  url: string;
}

export interface EventSchema {
  /** Display name (plain string; LocaleMap can be added later if needed). */
  name: string;
  description?: string;

  /** Preferred slug — canonical URL fragment under /events/. */
  slug?: string;

  /**
   * Banner image for event-page header and calendar card. Optional —
   * free-tier user-created events won't have one. Components should fall
   * back gracefully when missing.
   */
  banner_src?: string;
  /**
   * How the banner image fills its container.
   *  - `cover` (default): image fills the area, may be cropped.
   *  - `contain`: image is fully visible, gaps filled with `banner_accent_color`.
   */
  banner_fit?: "cover" | "contain";
  /**
   * Hex color (e.g. "#1a1a1a") used as the background behind a `contain`
   * banner. Ignored when `banner_fit` is `cover`. Lets sponsors match the
   * banner art's bleed color rather than landing on a default surface.
   */
  banner_accent_color?: string;
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

  /**
   * Real Firestore spot ids that are part of this event. Optional — an
   * external/EventFrog-only listing or a not-yet-mapped jam can exist with
   * zero local spots. Treat absent as "no spots" rather than an error.
   */
  spot_ids?: string[];

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
  min_zoom?: number;

  /**
   * Optional polygon dimming overlay drawn outside the event area. Each
   * entry is one ring (the first ring is typically the world outline and
   * subsequent rings are holes cut out for the event area).
   *
   * Wrapped in `{ points: [...] }` because Firestore disallows nested arrays.
   */
  area_polygon?: Array<{ points: Array<{ lat: number; lng: number }> }>;

  /**
   * Region that surfaces the event in the map-island. If absent, the event
   * does not appear in the island promo at all (only on /events and its
   * own page).
   */
  promo_region?: EventPromoRegionSchema;

  /** Sponsor metadata; presence drives sponsor-logo badges on event spots. */
  sponsor?: EventSponsorSchema;

  /**
   * Community page keys (e.g. "country:ch", "locality:ch:zh:zurich") that
   * this event should surface under. Used by the community landing page
   * to show an "Events" row. Multiple entries allowed — a national event
   * can list under both its country and its host city.
   */
  community_keys?: string[];

  /**
   * Series the event belongs to (e.g. `swiss-parkour-tour`,
   * `parkour-earth`). Each id maps to a doc under `/series/{id}` carrying
   * the series' name, logo, organizer, etc. Multiple entries allowed
   * (e.g. an SPT event that's also a Parkour Earth qualifier). Used to
   * group events on `/events` and to render branding chips on the event
   * page.
   */
  series_ids?: string[];

  /**
   * If set, this event is canonically hosted somewhere else (typically
   * EventFrog). UI shows a "View on <provider>" CTA and may hide PK
   * Spot-specific affordances (challenges tab, spot map editing) for
   * thin link-only events.
   */
  external_source?: EventExternalSourceSchema;

  /** Optional pre-built JSON-LD blob for SEO. */
  structured_data?: Record<string, any>;

  /** Lifecycle. */
  published?: boolean;
  created_by?: { uid: string; username?: string };
  time_created?: Timestamp;
  time_updated?: Timestamp;

  // Typesense helper fields — populated by the `updateEventFieldsOnWrite`
  // cloud function and copied verbatim by the Firestore→Typesense
  // Firebase Extension. Do not set these directly; treat as derived state
  // owned by the cloud function.
  start_seconds?: number;
  end_seconds?: number;
  promo_starts_at_seconds?: number;
  /** Stored as a Firestore `GeoPoint` at runtime; typed as `[lat, lng]` so
   * the client doesn't need the admin SDK to read it. */
  bounds_center?: [number, number];
  bounds_radius_m?: number;
  promo_region_center?: [number, number];
  promo_region_radius_m?: number;
}
