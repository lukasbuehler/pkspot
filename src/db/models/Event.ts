import { GeoPoint, Timestamp } from "firebase/firestore";
import {
  EventBoundsSchema,
  EventCustomMarkerSchema,
  EventCategory,
  EventProgramItemSchema,
  EventProgramPlanSchema,
  EventProgramRuntimeOverrideSchema,
  EventProgramSchema,
  EventAreaPolygonSchema,
  EventExternalSourceSchema,
  EventId,
  EventLinkSchema,
  EventOrganizerSchema,
  EventPromoRegionSchema,
  EventSchema,
  EventSeriesMembershipSchema,
  EventSponsorSchema,
  EventTicketAvailability,
  EventTicketBadge,
  EventTicketOptionSchema,
  InlineEventSpotSchema,
} from "../schemas/EventSchema";
import { EventRSVPCountsSchema } from "../schemas/EventRSVPSchema";
import type { MediaSchema } from "../schemas/Media";
import { LocaleCode, LocaleMap } from "./Interfaces";
import {
  getBestLocale,
  makeLocaleMapFromObject,
} from "../../scripts/LanguageHelpers";

export interface EventTicketOption {
  id: string;
  label: string;
  labelI18n?: LocaleMap;
  description?: string;
  descriptionI18n?: LocaleMap;
  url?: string;
  price?: EventTicketOptionSchema["price"];
  availability?: EventTicketAvailability;
  saleStartsAt?: Date;
  saleEndsAt?: Date;
  validFrom?: Date;
  validUntil?: Date;
  badge?: EventTicketBadge;
}

export interface EventProgramRuntimeOverride
  extends Omit<EventProgramRuntimeOverrideSchema, "start" | "end"> {
  start?: Date;
  end?: Date;
}

export interface EventProgramItem
  extends Omit<
    EventProgramItemSchema,
    "start" | "end" | "runtime_override"
  > {
  start: Date;
  end?: Date;
  runtimeOverride?: EventProgramRuntimeOverride;
}

export interface EventProgramPlan
  extends Omit<EventProgramPlanSchema, "items"> {
  items: EventProgramItem[];
}

export interface EventProgram extends Omit<EventProgramSchema, "plans"> {
  plans: EventProgramPlan[];
}

/**
 * An Event is a parkour-community event (jam, camp, competition) that
 * highlights one or more spots and runs over a defined time window.
 *
 * Driven by Firestore documents at /events/{eventId}. Slugs at /event_slugs.
 */
export class Event {
  readonly id: EventId;
  readonly slug?: string;

  readonly name: string;
  readonly description?: string;
  readonly descriptions?: LocaleMap;

  readonly bannerSrc?: string;
  readonly bannerFit: "cover" | "contain";
  readonly bannerAccentColor?: string;
  readonly logoSrc?: string;
  readonly logoBackgroundColor?: string;
  readonly media: MediaSchema[];
  readonly organizer?: EventOrganizerSchema;

  readonly venueString: string;
  readonly localityString: string;
  readonly location: { lat: number; lng: number };
  readonly start: Date;
  readonly end: Date;
  readonly promoStartsAt?: Date;
  readonly url?: string;
  readonly eventLinks: EventLinkSchema[];
  readonly ticketOptions: EventTicketOption[];
  readonly eventCategories: EventCategory[];
  readonly timeZone?: string;
  readonly program?: EventProgram;

  readonly spotIds: string[];
  readonly inlineSpots: InlineEventSpotSchema[];
  readonly customMarkers: EventCustomMarkerSchema[];
  readonly challengeSpotMap: Record<string, string>;

  readonly bounds?: EventBoundsSchema;
  readonly focusZoom?: number;
  readonly minZoom?: number;
  readonly areaPolygon?: EventAreaPolygonSchema[];
  readonly promoRegion?: EventPromoRegionSchema;

  readonly sponsor?: EventSponsorSchema;
  readonly isSponsored: boolean;
  readonly hasOrganization: boolean;
  readonly hasVenueSpot: boolean;
  readonly venueSpotCount: number;
  readonly communityKeys: string[];
  readonly seriesIds: string[];
  readonly seriesMemberships: EventSeriesMembershipSchema[];
  readonly externalSource?: EventExternalSourceSchema;

  readonly rsvpCounts: EventRSVPCountsSchema;
  readonly published: boolean;

  constructor(id: EventId, data: EventSchema, locale: LocaleCode = "en") {
    this.id = id;
    this.slug = data.slug;
    this.name = data.name;
    this.descriptions = Event.mapDescriptionLocaleMap(data);
    this.description =
      Event.descriptionForLocale(this.descriptions, locale) ?? data.description;
    this.bannerSrc = data.banner_src;
    this.bannerFit = data.banner_fit ?? "cover";
    this.bannerAccentColor = data.banner_accent_color;
    this.logoSrc = data.logo_src;
    this.logoBackgroundColor = data.logo_background_color;
    this.media = data.media ?? [];
    this.organizer = data.organizer;
    this.venueString = data.venue_string;
    this.localityString = data.locality_string;
    this.location =
      Event.toLatLng(data.location_raw, data.location) ??
      (data.bounds ? Event.boundsCenter(data.bounds) : { lat: 0, lng: 0 });
    this.start = Event.toDate(data.start);
    this.end = Event.toDate(data.end);
    this.promoStartsAt = data.promo_starts_at
      ? Event.toDate(data.promo_starts_at)
      : undefined;
    this.url = data.url;
    this.eventLinks = data.event_links ?? [];
    this.ticketOptions = (data.ticket_options ?? []).map((option) => ({
      id: option.id,
      label:
        Event.localizedText(option.label_i18n, locale) ??
        option.label,
      labelI18n: Event.mapLocaleMap(option.label_i18n),
      description:
        Event.localizedText(option.description_i18n, locale) ??
        option.description,
      descriptionI18n: Event.mapLocaleMap(option.description_i18n),
      url: option.url,
      price: option.price,
      availability: option.availability,
      saleStartsAt: option.sale_starts_at
        ? Event.toDate(option.sale_starts_at)
        : undefined,
      saleEndsAt: option.sale_ends_at
        ? Event.toDate(option.sale_ends_at)
        : undefined,
      validFrom: option.valid_from ? Event.toDate(option.valid_from) : undefined,
      validUntil: option.valid_until
        ? Event.toDate(option.valid_until)
        : undefined,
      badge: option.badge,
    }));
    this.eventCategories = data.event_categories ?? [];
    this.timeZone = data.time_zone;
    this.program = data.program
      ? Event.mapProgram(data.program, locale)
      : undefined;
    this.spotIds = data.spot_ids ?? [];
    this.inlineSpots = data.inline_spots ?? [];
    this.customMarkers = data.custom_markers ?? [];
    this.challengeSpotMap = data.challenge_spot_map ?? {};
    this.bounds = data.bounds ?? undefined;
    this.focusZoom = data.focus_zoom;
    this.minZoom = data.min_zoom;
    this.areaPolygon = data.area_polygon ?? undefined;
    this.promoRegion =
      data.promo_region ??
      (typeof data.promo_radius_m === "number" && data.promo_radius_m > 0
        ? {
            center: this.location,
            radius_m: data.promo_radius_m,
          }
        : undefined);
    this.sponsor = data.sponsor;
    this.isSponsored = data.is_sponsored ?? false;
    this.hasOrganization =
      data.has_organization ?? (data.organizer?.type === "organization");
    this.venueSpotCount =
      data.venue_spot_count ??
      new Set(data.spot_ids ?? []).size + (data.inline_spots?.length ?? 0);
    this.hasVenueSpot = data.has_venue_spot ?? this.venueSpotCount > 0;
    this.communityKeys = data.community_keys ?? [];
    this.seriesMemberships = data.series_memberships ?? [];
    this.seriesIds = Event.uniqueSeriesIds(
      data.series_ids,
      this.seriesMemberships,
    );
    this.externalSource = data.external_source;
    this.rsvpCounts = data.rsvp_counts ?? {
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    };
    this.published = data.published ?? true;
  }

  /** Status relative to a given moment (defaults to now). */
  status(now: Date = new Date()): "upcoming" | "live" | "past" {
    if (now < this.start) return "upcoming";
    if (now > this.end) return "past";
    return "live";
  }

  isLive(now: Date = new Date()): boolean {
    return this.status(now) === "live";
  }

  isUpcoming(now: Date = new Date()): boolean {
    return this.status(now) === "upcoming";
  }

  isPast(now: Date = new Date()): boolean {
    return this.status(now) === "past";
  }

  /**
   * True when the map-island promo for this event should be active right
   * now: a `promo_region` is set, the current time is past `promo_starts_at`
   * (or `start` if no explicit lead time), and the event has not ended.
   */
  isPromotable(now: Date = new Date()): boolean {
    if (!this.promoRegion) return false;
    if (now > this.end) return false;
    const promoStart = this.promoStartsAt ?? this.start;
    return now >= promoStart;
  }

  /** Sponsor logo if available, otherwise the event's own logo. */
  effectiveBadgeLogoSrc(): string | undefined {
    return this.sponsor?.logo_src ?? this.logoSrc;
  }

  /** Optional sponsor-provided background for badge/logo treatments. */
  effectiveBadgeLogoBackgroundColor(): string | undefined {
    return this.sponsor?.logo_background_color ?? this.logoBackgroundColor;
  }

  /**
   * Whether the given map viewport intersects the event's promo region.
   * Supports both bounds-box and center+radius region shapes.
   */
  intersectsViewport(viewport: EventBoundsSchema): boolean {
    if (!this.promoRegion) return false;

    if (this.promoRegion.bounds) {
      return Event.boundsIntersect(this.promoRegion.bounds, viewport);
    }

    if (
      this.promoRegion.center &&
      typeof this.promoRegion.radius_m === "number"
    ) {
      return Event.viewportIntersectsCircle(
        viewport,
        this.promoRegion.center,
        this.promoRegion.radius_m,
      );
    }

    return false;
  }

  /**
   * True when the map's center point is inside the promo region. This is
   * stricter than `intersectsViewport` and prevents broad map views from
   * surfacing a promo just because the region is somewhere on-screen.
   */
  containsPromoPoint(point: { lat: number; lng: number }): boolean {
    if (!this.promoRegion) return false;

    if (this.promoRegion.bounds) {
      return Event.pointInBounds(point, this.promoRegion.bounds);
    }

    if (
      this.promoRegion.center &&
      typeof this.promoRegion.radius_m === "number"
    ) {
      return (
        Event.haversineMeters(this.promoRegion.center, point) <=
        this.promoRegion.radius_m
      );
    }

    return false;
  }

  /**
   * Center point used when ranking overlapping promoted events for the map
   * island. Bounds-based promo regions rank from the center of the box.
   */
  promoCenter(): { lat: number; lng: number } | undefined {
    if (!this.promoRegion) return undefined;
    if (this.promoRegion.center) return this.promoRegion.center;
    if (!this.promoRegion.bounds) return undefined;

    return Event.boundsCenter(this.promoRegion.bounds);
  }

  /**
   * Approximate promo-region radius in meters. Circle regions use their
   * configured radius; bounds regions use center-to-corner distance.
   */
  promoRadiusMeters(): number {
    if (!this.promoRegion) return Number.POSITIVE_INFINITY;

    if (typeof this.promoRegion.radius_m === "number") {
      return this.promoRegion.radius_m;
    }

    if (!this.promoRegion.bounds) return Number.POSITIVE_INFINITY;

    const center = Event.boundsCenter(this.promoRegion.bounds);
    return Event.haversineMeters(center, {
      lat: this.promoRegion.bounds.north,
      lng: this.promoRegion.bounds.east,
    });
  }

  /**
   * Distance from a map viewport center to the event's promo center. Used
   * to prefer local promoted events over broader regional campaigns.
   */
  distanceFromPromoCenterMeters(point: { lat: number; lng: number }): number {
    const center = this.promoCenter();
    if (!center) return Number.POSITIVE_INFINITY;
    return Event.haversineMeters(center, point);
  }

  static boundsIntersect(a: EventBoundsSchema, b: EventBoundsSchema): boolean {
    if (a.south > b.north) return false;
    if (a.north < b.south) return false;
    if (a.west > b.east) return false;
    if (a.east < b.west) return false;
    return true;
  }

  static pointInBounds(
    point: { lat: number; lng: number },
    bounds: EventBoundsSchema,
  ): boolean {
    return (
      point.lat >= bounds.south &&
      point.lat <= bounds.north &&
      point.lng >= bounds.west &&
      point.lng <= bounds.east
    );
  }

  /**
   * Approximate intersection check between a viewport rectangle and a
   * geographic circle. Sufficient for surfacing event chips when panning
   * the map; not a precise spherical geometry calculation.
   */
  static viewportIntersectsCircle(
    viewport: EventBoundsSchema,
    center: { lat: number; lng: number },
    radiusM: number,
  ): boolean {
    const closestLat = Math.max(
      viewport.south,
      Math.min(center.lat, viewport.north),
    );
    const closestLng = Math.max(
      viewport.west,
      Math.min(center.lng, viewport.east),
    );
    const distanceM = Event.haversineMeters(
      { lat: center.lat, lng: center.lng },
      { lat: closestLat, lng: closestLng },
    );
    return distanceM <= radiusM;
  }

  private static haversineMeters(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number },
  ): number {
    const R = 6371e3;
    const φ1 = (a.lat * Math.PI) / 180;
    const φ2 = (b.lat * Math.PI) / 180;
    const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
    const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
    const h =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  private static boundsCenter(bounds: EventBoundsSchema): {
    lat: number;
    lng: number;
  } {
    return {
      lat: (bounds.north + bounds.south) / 2,
      lng: (bounds.east + bounds.west) / 2,
    };
  }

  private static uniqueSeriesIds(
    seriesIds: string[] | undefined,
    memberships: EventSeriesMembershipSchema[],
  ): string[] {
    return Array.from(
      new Set([
        ...(seriesIds ?? []),
        ...memberships.map((membership) => membership.series_id),
      ]),
    );
  }

  private static mapProgram(
    program: EventProgramSchema,
    locale: LocaleCode,
  ): EventProgram {
    return {
      ...program,
      plans: program.plans.map((plan) => ({
        ...plan,
        label: Event.localizedText(plan.label_i18n, locale) ?? plan.label,
        condition_label:
          Event.localizedText(plan.condition_label_i18n, locale) ??
          plan.condition_label,
        items: plan.items.map((item) => Event.mapProgramItem(item, locale)),
      })),
    };
  }

  private static mapDescriptionLocaleMap(
    data: EventSchema
  ): LocaleMap | undefined {
    if (data.description_i18n) {
      return makeLocaleMapFromObject(data.description_i18n);
    }
    if (typeof data.description === "string" && data.description.trim()) {
      return makeLocaleMapFromObject({ en: data.description });
    }
    return undefined;
  }

  private static descriptionForLocale(
    descriptions: LocaleMap | undefined,
    locale: LocaleCode
  ): string | undefined {
    const locales = Object.keys(descriptions ?? {});
    if (locales.length === 0) return undefined;
    const bestLocale = getBestLocale(locales, locale);
    return descriptions?.[bestLocale]?.text;
  }

  private static localizedText(
    value: LocaleMap | Record<string, string> | undefined,
    locale: LocaleCode,
  ): string | undefined {
    const localeMap = Event.mapLocaleMap(value);
    return Event.descriptionForLocale(localeMap, locale);
  }

  private static mapLocaleMap(
    value: LocaleMap | Record<string, string> | undefined,
  ): LocaleMap | undefined {
    return value ? makeLocaleMapFromObject(value) : undefined;
  }

  private static mapProgramItem(
    item: EventProgramItemSchema,
    locale: LocaleCode,
  ): EventProgramItem {
    const { runtime_override: runtimeOverrideSchema, ...rest } = item;
    return {
      ...rest,
      title: Event.localizedText(item.title_i18n, locale) ?? item.title,
      description:
        Event.localizedText(item.description_i18n, locale) ?? item.description,
      participation: item.participation
        ? {
            ...item.participation,
            note:
              Event.localizedText(item.participation.note_i18n, locale) ??
              item.participation.note,
            qualification_hint:
              Event.localizedText(
                item.participation.qualification_hint_i18n,
                locale,
              ) ?? item.participation.qualification_hint,
          }
        : undefined,
      start: Event.toDate(item.start),
      end: item.end ? Event.toDate(item.end) : undefined,
      runtimeOverride: runtimeOverrideSchema
        ? Event.mapRuntimeOverride(runtimeOverrideSchema, locale)
        : undefined,
    };
  }

  private static mapRuntimeOverride(
    override: EventProgramRuntimeOverrideSchema,
    locale: LocaleCode,
  ): EventProgramRuntimeOverride {
    return {
      ...override,
      note: Event.localizedText(override.note_i18n, locale) ?? override.note,
      start: override.start ? Event.toDate(override.start) : undefined,
      end: override.end ? Event.toDate(override.end) : undefined,
    };
  }

  private static toLatLng(
    raw:
      | { lat?: number | string; lng?: number | string }
      | undefined,
    point:
      | GeoPoint
      | { latitude?: number | string; longitude?: number | string }
      | undefined,
  ): { lat: number; lng: number } | undefined {
    const lat = Number(raw?.lat ?? point?.latitude);
    const lng = Number(raw?.lng ?? point?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    return { lat, lng };
  }

  private static toDate(
    value:
      | Timestamp
      | Date
      | { seconds: number | string; nanoseconds?: number | string }
      | { _seconds: number | string; _nanoseconds?: number | string }
      | string
      | number,
  ): Date {
    if (value instanceof Date) return value;
    if (typeof value === "string") return new Date(value);
    if (typeof value === "number") return new Date(value);
    if (typeof (value as Timestamp).toDate === "function") {
      return (value as Timestamp).toDate();
    }
    const tsLike = value as {
      seconds?: number | string;
      nanoseconds?: number | string;
      _seconds?: number | string;
      _nanoseconds?: number | string;
    };
    const seconds = Number(tsLike.seconds ?? tsLike._seconds);
    const nanoseconds = Number(tsLike.nanoseconds ?? tsLike._nanoseconds ?? 0);
    if (Number.isFinite(seconds)) {
      return new Date(
        seconds * 1000 +
          Math.floor((Number.isFinite(nanoseconds) ? nanoseconds : 0) / 1e6),
      );
    }
    return new Date(NaN);
  }
}
