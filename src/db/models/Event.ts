import { Timestamp } from "firebase/firestore";
import {
  EventBoundsSchema,
  EventCustomMarkerSchema,
  EventId,
  EventPromoRegionSchema,
  EventSchema,
  EventSponsorSchema,
  InlineEventSpotSchema,
} from "../schemas/EventSchema";

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

  readonly bannerSrc?: string;
  readonly logoSrc?: string;

  readonly venueString: string;
  readonly localityString: string;
  readonly start: Date;
  readonly end: Date;
  readonly promoStartsAt?: Date;
  readonly url?: string;

  readonly spotIds: string[];
  readonly inlineSpots: InlineEventSpotSchema[];
  readonly customMarkers: EventCustomMarkerSchema[];
  readonly challengeSpotMap: Record<string, string>;

  readonly bounds: EventBoundsSchema;
  readonly focusZoom?: number;
  readonly areaPolygon?: Array<{ points: Array<{ lat: number; lng: number }> }>;
  readonly promoRegion?: EventPromoRegionSchema;

  readonly sponsor?: EventSponsorSchema;

  readonly structuredData?: Record<string, any>;
  readonly published: boolean;

  constructor(id: EventId, data: EventSchema) {
    this.id = id;
    this.slug = data.slug;
    this.name = data.name;
    this.description = data.description;
    this.bannerSrc = data.banner_src;
    this.logoSrc = data.logo_src;
    this.venueString = data.venue_string;
    this.localityString = data.locality_string;
    this.start = Event.toDate(data.start);
    this.end = Event.toDate(data.end);
    this.promoStartsAt = data.promo_starts_at
      ? Event.toDate(data.promo_starts_at)
      : undefined;
    this.url = data.url;
    this.spotIds = data.spot_ids ?? [];
    this.inlineSpots = data.inline_spots ?? [];
    this.customMarkers = data.custom_markers ?? [];
    this.challengeSpotMap = data.challenge_spot_map ?? {};
    this.bounds = data.bounds;
    this.focusZoom = data.focus_zoom;
    this.areaPolygon = data.area_polygon;
    this.promoRegion = data.promo_region;
    this.sponsor = data.sponsor;
    this.structuredData = data.structured_data;
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
        this.promoRegion.radius_m
      );
    }

    return false;
  }

  static boundsIntersect(a: EventBoundsSchema, b: EventBoundsSchema): boolean {
    if (a.south > b.north) return false;
    if (a.north < b.south) return false;
    if (a.west > b.east) return false;
    if (a.east < b.west) return false;
    return true;
  }

  /**
   * Approximate intersection check between a viewport rectangle and a
   * geographic circle. Sufficient for surfacing event chips when panning
   * the map; not a precise spherical geometry calculation.
   */
  static viewportIntersectsCircle(
    viewport: EventBoundsSchema,
    center: { lat: number; lng: number },
    radiusM: number
  ): boolean {
    const closestLat = Math.max(
      viewport.south,
      Math.min(center.lat, viewport.north)
    );
    const closestLng = Math.max(
      viewport.west,
      Math.min(center.lng, viewport.east)
    );
    const distanceM = Event.haversineMeters(
      { lat: center.lat, lng: center.lng },
      { lat: closestLat, lng: closestLng }
    );
    return distanceM <= radiusM;
  }

  private static haversineMeters(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number }
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

  private static toDate(
    value:
      | Timestamp
      | Date
      | { seconds: number; nanoseconds: number }
      | string
  ): Date {
    if (value instanceof Date) return value;
    if (typeof value === "string") return new Date(value);
    if (typeof (value as Timestamp).toDate === "function") {
      return (value as Timestamp).toDate();
    }
    const tsLike = value as { seconds: number; nanoseconds: number };
    if (typeof tsLike.seconds === "number") {
      return new Date(
        tsLike.seconds * 1000 + Math.floor((tsLike.nanoseconds ?? 0) / 1e6)
      );
    }
    return new Date(NaN);
  }
}
