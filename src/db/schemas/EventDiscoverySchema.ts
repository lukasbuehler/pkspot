import { EventSchema } from "./EventSchema";
import { eventIsPublished } from "./EventNormalization";

export const EVENT_DISCOVERY_COLLECTION = "event_discovery";

/**
 * Deliberately small, public-only view of an event. This is disposable
 * derived data for Firestore discovery and Typesense, never a write source.
 */
export const EVENT_DISCOVERY_FIELDS = [
  "name",
  "description",
  "description_i18n",
  "slug",
  "banner_src",
  "banner_fit",
  "banner_accent_color",
  "logo_src",
  "logo_fit",
  "logo_background_color",
  "organizer",
  "organizer_name",
  "featured_participants",
  "venue_string",
  "locality_string",
  "location",
  "location_raw",
  "start",
  "end",
  "url",
  "event_links",
  "ticket_options",
  "event_categories",
  "promo_starts_at",
  "spot_ids",
  "bounds",
  "promo_region",
  "promo_radius_m",
  "sponsor",
  "is_promoted",
  "is_sponsored",
  "community_keys",
  "series_ids",
  "external_source",
  "rsvp_counts",
  "kind",
  "schedule_mode",
  "lifecycle_status",
  "priority",
  "attendance",
  "notification_policy",
  "start_seconds",
  "end_seconds",
  "promo_starts_at_seconds",
  "bounds_center",
  "bounds_radius_m",
  "promo_bounds_north",
  "promo_bounds_south",
  "promo_bounds_east",
  "promo_bounds_west",
  "promo_region_center",
  "promo_region_radius_m",
  "has_organization",
  "has_venue_spot",
  "venue_spot_count",
  "series_roles",
  "qualifies_to_keys",
  "required_qualifier_keys",
  "time_updated",
] as const satisfies readonly (keyof EventSchema)[];

type EventDiscoveryField = (typeof EVENT_DISCOVERY_FIELDS)[number];

export type EventDiscoverySchema = Pick<EventSchema, EventDiscoveryField> & {
  publication_state: "published";
  visibility: "public";
  published: true;
};

export const isEventPubliclyDiscoverable = (
  event: Partial<EventSchema>,
): boolean =>
  eventIsPublished(event) && (event.visibility ?? "public") === "public";

export const isEventOpenableByKnownReference = (
  event: Partial<EventSchema>,
): boolean =>
  eventIsPublished(event) && (event.visibility ?? "public") !== "private";

export const buildEventDiscoveryProjection = (
  event: EventSchema,
): EventDiscoverySchema | null => {
  if (!isEventPubliclyDiscoverable(event)) return null;

  // Typesense requires these fields. If a mobile-shaped source write has not
  // yet received its server-normalized GeoPoint, the next source write will
  // retry projection creation.
  if (
    typeof event.name !== "string" ||
    typeof event.venue_string !== "string" ||
    typeof event.locality_string !== "string" ||
    !event.location ||
    !event.start ||
    !event.end
  ) {
    return null;
  }

  const projection: Partial<EventDiscoverySchema> = {
    publication_state: "published",
    visibility: "public",
    published: true,
  };
  const source = event as unknown as Record<string, unknown>;
  const target = projection as Record<string, unknown>;
  for (const field of EVENT_DISCOVERY_FIELDS) {
    if (source[field] !== undefined) target[field] = source[field];
  }
  return projection as EventDiscoverySchema;
};
