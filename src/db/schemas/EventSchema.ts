import type { GeoPoint, Timestamp } from "firebase/firestore";
import type { LocaleMap } from "../models/Interfaces";
import type { MediaSchema } from "./Media";
import { OrganizationReferenceSchema } from "./OrganizationSchema";
import { EventRSVPCountsSchema } from "./EventRSVPSchema";

export type EventId = string & { __brand: "EventId" };
export type EventSlug = string & { __brand: "EventSlug" };

export type EventCategory =
  | "jam"
  | "competition"
  | "workshop"
  | "camp"
  | "show"
  | "awards"
  | "social"
  | "travel"
  | "other";

export type EventDiscipline =
  | "speed"
  | "skill"
  | "style"
  | "freestyle"
  | "other";

export interface EventSlugSchema {
  event_id: EventId | string;
}

export interface EventBoundsSchema {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface EventAreaPolygonSchema {
  points: Array<{ lat: number; lng: number }>;
  /**
   * Optional display/editor label for this cutout. Legacy documents may still
   * include an unlabeled outer mask ring as the first entry; current clients
   * ignore those and build the outer mask from the visible map viewport.
   */
  area_name?: string;
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
  id?: string;
  name?: string;
  description?: string;
  location: { lat: number; lng: number };
  locality?: string;
  media?: MediaSchema[];
  google_place_id?: string;
  url?: string;
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

export interface EventCardPreviewSchema {
  id: string;
  slug?: string;
  name: string;
  description?: string;
  description_i18n?: LocaleMap | Record<string, string>;
  banner_src?: string;
  banner_fit?: "cover" | "contain";
  banner_accent_color?: string;
  logo_src?: string;
  venue_string?: string;
  locality_string: string;
  start: Timestamp | { seconds: number; nanoseconds: number };
  end: Timestamp | { seconds: number; nanoseconds: number };
  url?: string;
  location?: GeoPoint;
  location_raw?: { lat: number; lng: number };
  bounds?: EventBoundsSchema;
  sponsor?: EventSponsorSchema;
  /** New promoted flag. Prefer this over legacy `is_sponsored`. */
  is_promoted?: boolean;
  /** @deprecated Use `is_promoted`. Kept for older clients and indexes. */
  is_sponsored?: boolean;
  external_source?: EventExternalSourceSchema;
  event_categories?: EventCategory[];
  series_ids?: string[];
  rsvp_counts?: EventRSVPCountsSchema;
}

export interface EventOrganizerSchema {
  type: "organization";
  organization: OrganizationReferenceSchema;
}

export type EventFeaturedParticipantType = "person" | "group";

export type EventFeaturedParticipantRole =
  | "athlete"
  | "judge"
  | "coach"
  | "instructor"
  | "speaker"
  | "artist"
  | "dj"
  | "performer"
  | "host"
  | "guest";

export interface EventFeaturedParticipantSchema {
  name: string;
  type: EventFeaturedParticipantType;
  role: EventFeaturedParticipantRole;
  description?: string;
  url?: string;
  image_src?: string;
}

/**
 * Marks an event whose canonical home lives outside PK Spot (e.g. an
 * EventFrog ticket page hosted by a partner). Used for two patterns:
 *
 *  1. Lightweight thin event docs that exist only to surface an external
 *     event in PK Spot's calendar / map / community pages. These have
 *     minimal PK Spot fields (name, dates, locality_string, location), no
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

export type EventLinkKind =
  | "website"
  | "tickets"
  | "schedule"
  | "results"
  | "livestream"
  | "other";

export interface EventLinkSchema {
  label: string;
  url: string;
  kind: EventLinkKind;
  primary?: boolean;
  provider?: string;
}

export type EventTicketAvailability =
  | "available"
  | "coming_soon"
  | "sold_out"
  | "waitlist"
  | "ended";

export type EventTicketBadge =
  | "early_bird"
  | "discount"
  | "regular"
  | "late"
  | "member";

export interface EventTicketPriceFixedSchema {
  amount: number;
  currency: string;
}

export interface EventTicketPriceRangeSchema {
  min_amount: number;
  max_amount: number;
  currency: string;
}

export interface EventTicketOptionSchema {
  id: string;
  label: string;
  label_i18n?: LocaleMap | Record<string, string>;
  description?: string;
  description_i18n?: LocaleMap | Record<string, string>;
  url?: string;
  price?: EventTicketPriceFixedSchema | EventTicketPriceRangeSchema;
  availability?: EventTicketAvailability;
  sale_starts_at?: Timestamp;
  sale_ends_at?: Timestamp;
  valid_from?: Timestamp;
  valid_until?: Timestamp;
  badge?: EventTicketBadge;
}

export type EventSeriesRole =
  | "series_event"
  | "qualifier"
  | "final"
  | "championship"
  | "feeder"
  | "related";

export interface EventQualificationRefSchema {
  /**
   * Event-level refs point at a standalone event page. Program-item refs point
   * at a schedule item inside another event, which lets larger festivals host
   * qualifier/final blocks without turning every block into a separate event.
   */
  kind: "event" | "program_item";
  event_id: EventId | string;
  program_item_id?: string;
}

export type EventQualificationRequirementMode = "any" | "all";

export interface EventQualificationPathSchema {
  /** Stable id for UI expansion state and future generated path updates. */
  id: string;
  label?: string;
  label_i18n?: LocaleMap | Record<string, string>;
  /**
   * `any` means one listed requirement is enough; `all` means every listed
   * requirement must be completed.
   */
  requirement_mode: EventQualificationRequirementMode;
  requirements: EventQualificationRefSchema[];
}

export interface EventSeriesMembershipSchema {
  series_id: string;
  role: EventSeriesRole;
  disciplines?: EventDiscipline[];
  /**
   * True when the referenced event/program item is not open-entry. Displayed
   * as a user-facing hint first; richer qualification paths can be derived
   * from `required_qualifiers` and `qualifies_to`.
   */
  qualification_required?: boolean;
  qualification_hint?: string;
  qualification_hint_i18n?: LocaleMap | Record<string, string>;
  /** Outgoing qualification edges: competing here can qualify you for these. */
  qualifies_to?: EventQualificationRefSchema[];
  /**
   * Incoming qualification paths. Prefer this over `required_qualifiers` for
   * new data so it is explicit whether one or all listed requirements apply.
   */
  qualification_paths?: EventQualificationPathSchema[];
  /** Incoming qualification edges: these must happen before competing here. */
  required_qualifiers?: EventQualificationRefSchema[];
  source_url?: string;
}

export type EventProgramPlanKind = "main" | "alternate";

export type EventProgramItemStatus =
  | "scheduled"
  | "cancelled"
  | "moved"
  | "delayed";

export interface EventProgramSpotRefSchema {
  kind: "spot" | "inline_spot";
  id: string;
}

export interface EventProgramRuntimeOverrideSchema {
  start?: Timestamp;
  end?: Timestamp;
  status?: EventProgramItemStatus;
  note?: string;
  note_i18n?: LocaleMap | Record<string, string>;
}

export interface EventProgramParticipationSchema {
  access?:
    | "included_with_event"
    | "separate_ticket"
    | "free"
    | "registration_required"
    | "invite_or_qualified";
  note?: string;
  note_i18n?: LocaleMap | Record<string, string>;
  qualification_required?: boolean;
  qualification_hint?: string;
  qualification_hint_i18n?: LocaleMap | Record<string, string>;
}

export interface EventProgramItemSchema {
  id: string;
  title: string;
  title_i18n?: LocaleMap | Record<string, string>;
  description?: string;
  description_i18n?: LocaleMap | Record<string, string>;
  category: EventCategory;
  start: Timestamp;
  end?: Timestamp;
  spot_ref?: EventProgramSpotRefSchema;
  status?: EventProgramItemStatus;
  runtime_override?: EventProgramRuntimeOverrideSchema;
  /**
   * Optional bridge to a standalone event that represents the same activity.
   * Example: WPF Camp has a program item for WPF Skills Competition, while the
   * skills competition also has its own public event for filtering/search.
   */
  linked_event_id?: EventId | string;
  series_memberships?: EventSeriesMembershipSchema[];
  participation?: EventProgramParticipationSchema;
}

export interface EventProgramPlanSchema {
  id: string;
  label: string;
  label_i18n?: LocaleMap | Record<string, string>;
  kind: EventProgramPlanKind;
  condition_label?: string;
  condition_label_i18n?: LocaleMap | Record<string, string>;
  items: EventProgramItemSchema[];
}

export interface EventProgramSchema {
  active_plan_id: string;
  plans: EventProgramPlanSchema[];
}

export interface EventSchema {
  /** Display name (plain string; LocaleMap can be added later if needed). */
  name: string;
  /** Server-derived from `description_i18n` for search and old clients. */
  description?: string;
  /** Localized event description rendered by clients when available. */
  description_i18n?: LocaleMap | Record<string, string>;

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
  /** Optional background color behind the event-specific logo. */
  logo_background_color?: string;

  /**
   * Optional externally linked event media. These are public media URLs
   * embedded on the event page gallery, separate from uploaded banner/logo
   * assets and inline spot media.
   */
  media?: MediaSchema[];

  /** Organizer responsible for the event. User organizers can be added later. */
  organizer?: EventOrganizerSchema;
  /** Featured people, groups, and acts visible on the event page. */
  featured_participants?: EventFeaturedParticipantSchema[];

  venue_string: string;
  locality_string: string;
  /** Preferred event pin location. Bounds are optional; this is the anchor. */
  location: GeoPoint;
  /** Plain lat/lng mirror for admin UI and non-Firestore consumers. */
  location_raw: { lat: number; lng: number };
  start: Timestamp;
  end: Timestamp;
  /** Optional external event URL (ticketing, organizer site). */
  url?: string;
  /** Public external CTAs shown on the event page. */
  event_links?: EventLinkSchema[];
  /** Public ticket tiers/offers. Transactions happen on linked external sites. */
  ticket_options?: EventTicketOptionSchema[];

  /** Top-level browse/filter categories for the attendable event itself. */
  event_categories?: EventCategory[];
  /** IANA time zone used to group and render program items by local event day. */
  time_zone?: string;
  /** Event-owned schedule/program data, including alternate plans. */
  program?: EventProgramSchema;

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

  /** Optional map area restriction for rich event maps. */
  bounds?: EventBoundsSchema;
  focus_zoom?: number;
  min_zoom?: number;

  /**
   * Optional polygon dimming overlay drawn outside the event area. Each
   * entry is one ring (the first ring is typically the world outline and
   * subsequent rings are holes cut out for the event area).
   *
   * Wrapped in `{ points: [...] }` because Firestore disallows nested arrays.
   */
  area_polygon?: EventAreaPolygonSchema[];

  /**
   * Legacy region that surfaces the event in the map-island. New promoted
   * events should prefer `promo_radius_m`, centered on `location`, so paid
   * reach stays separate from the real event marker/list location.
   */
  promo_region?: EventPromoRegionSchema;
  /**
   * Promo radius around the event location, in meters. Used only for paid
   * map-island visibility; normal event markers/counts use `location`.
   */
  promo_radius_m?: number;

  /** Sponsor metadata for branding/logo treatments. Does not imply paid advertising. */
  sponsor?: EventSponsorSchema;
  /** True when PK Spot boosts this event in promoted map placements. */
  is_promoted?: boolean;
  /** @deprecated Use `is_promoted`. Kept for older clients and indexes. */
  is_sponsored?: boolean;

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
   * Rich event-level series links. Prefer this for new curated series data;
   * keep `series_ids` populated for search/index/backwards compatibility.
   */
  series_memberships?: EventSeriesMembershipSchema[];

  /**
   * If set, this event is canonically hosted somewhere else (typically
   * EventFrog). UI shows a "View on <provider>" CTA and may hide PK
   * Spot-specific affordances (challenges tab, spot map editing) for
   * thin link-only events.
   */
  external_source?: EventExternalSourceSchema;

  /**
   * Public aggregate maintained from private `/events/{eventId}/rsvps/*`
   * docs by Cloud Functions. Individual RSVP docs stay private to the
   * user, admins, and mutual friends.
   */
  rsvp_counts?: EventRSVPCountsSchema;

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
  promo_bounds_north?: number;
  promo_bounds_south?: number;
  promo_bounds_east?: number;
  promo_bounds_west?: number;
  promo_region_center?: [number, number];
  promo_region_radius_m?: number;
  /** True when the event has an organization organizer. Server-derived. */
  has_organization?: boolean;
  /** True when the event is tied to real or inline venue spots. Server-derived. */
  has_venue_spot?: boolean;
  /** Count of unique real spot ids plus inline event spots. Server-derived. */
  venue_spot_count?: number;
  /** Flattened event/program roles for Typesense faceting. Server-derived. */
  series_roles?: string[];
  /** Qualification targets as `eventId` or `eventId#programItemId`. Server-derived. */
  qualifies_to_keys?: string[];
  /** Required qualifiers as `eventId` or `eventId#programItemId`. Server-derived. */
  required_qualifier_keys?: string[];
}
