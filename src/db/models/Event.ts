import { Timestamp } from "firebase/firestore";
import {
  EventBoundsSchema,
  EventCustomMarkerSchema,
  EventExternalSourceSchema,
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
  readonly bannerFit: "cover" | "contain";
  readonly bannerAccentColor?: string;
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
  readonly minZoom?: number;
  readonly areaPolygon?: Array<{ points: Array<{ lat: number; lng: number }> }>;
  readonly promoRegion?: EventPromoRegionSchema;

  readonly sponsor?: EventSponsorSchema;
  readonly communityKeys: string[];
  readonly seriesIds: string[];
  readonly externalSource?: EventExternalSourceSchema;

  readonly structuredData?: Record<string, any>;
  readonly published: boolean;

  constructor(id: EventId, data: EventSchema) {
    this.id = id;
    this.slug = data.slug;
    this.name = data.name;
    this.description = data.description;
    this.bannerSrc = data.banner_src;
    this.bannerFit = data.banner_fit ?? "cover";
    this.bannerAccentColor = data.banner_accent_color;
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
    this.minZoom = data.min_zoom;
    this.areaPolygon = data.area_polygon;
    this.promoRegion = data.promo_region;
    this.sponsor = data.sponsor;
    this.communityKeys = data.community_keys ?? [];
    this.seriesIds = data.series_ids ?? [];
    this.externalSource = data.external_source;
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

  /** Optional sponsor-provided background for badge/logo treatments. */
  effectiveBadgeLogoBackgroundColor(): string | undefined {
    return this.sponsor?.logo_background_color;
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
