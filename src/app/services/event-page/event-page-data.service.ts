import { Injectable, LOCALE_ID, inject } from "@angular/core";
import { Observable, catchError, firstValueFrom, map, of } from "rxjs";
import { Event as PkEvent } from "../../../db/models/Event";
import { LocaleCode, MediaType } from "../../../db/models/Interfaces";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import {
  EventBoundsSchema,
  EventId,
  InlineEventSpotSchema,
} from "../../../db/schemas/EventSchema";
import { PolygonSchema } from "../../../db/schemas/PolygonSchema";
import { SpotId, SpotSchema } from "../../../db/schemas/SpotSchema";
import { GeoPoint } from "firebase/firestore";
import { SpotChallenge } from "../../../db/models/SpotChallenge";
import { MarkerSchema } from "../../components/map/markers/map-marker.model";
import { EventsService } from "../firebase/firestore/events.service";
import { SpotsService } from "../firebase/firestore/spots.service";
import { SpotChallengesService } from "../firebase/firestore/spot-challenges.service";
import { SWISSJAM25_STATIC } from "../../components/event-page/swissjam25.static";
import { SearchService } from "../search.service";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";

export type EventPageMapMarker = MarkerSchema & {
  spotIndex?: number;
  challengeIndex?: number;
  type?: string;
};

export type NumberedSpotChallenge = SpotChallenge & { number: number };

const EVENT_SPOT_MARKER_PRIORITY = 1_000;
const EVENT_CHALLENGE_MARKER_PRIORITY = 2_000;
const EVENT_CUSTOM_MARKER_PRIORITY = 3_000;

@Injectable({
  providedIn: "root",
})
export class EventPageDataService {
  private _eventsService = inject(EventsService);
  private _spotsService = inject(SpotsService);
  private _challengeService = inject(SpotChallengesService);
  private _search = inject(SearchService);
  private _locale = inject<LocaleCode>(LOCALE_ID);

  async loadEventBySlugOrId(slugOrId: string): Promise<PkEvent | null> {
    let loaded: PkEvent | null = null;
    try {
      loaded = await this._eventsService.getEventBySlugOrId(slugOrId);
    } catch (err) {
      console.warn("EventPageDataService: failed to load event", err);
    }

    if (!loaded && slugOrId === "swissjam25") {
      loaded = new PkEvent("swissjam25" as EventId, SWISSJAM25_STATIC);
    }

    return loaded;
  }

  observeEventBySlugOrId(slugOrId: string): Observable<PkEvent | null> {
    return this._eventsService.observeEventBySlugOrId(slugOrId).pipe(
      map((loaded) => loaded ?? this._staticFallbackEvent(slugOrId)),
      catchError((err) => {
        console.warn("EventPageDataService: failed to observe event", err);
        return of(this._staticFallbackEvent(slugOrId));
      }),
    );
  }

  eventCanonicalPath(event: PkEvent): string {
    return `/events/${event.slug ?? event.id}`;
  }

  eventMapBounds(event: PkEvent): EventBoundsSchema {
    if (event.bounds) return event.bounds;

    const latitudeRadius = 0.005;
    const longitudeRadius =
      latitudeRadius /
      Math.max(Math.cos((event.location.lat * Math.PI) / 180), 0.1);

    return {
      north: event.location.lat + latitudeRadius,
      south: event.location.lat - latitudeRadius,
      east: event.location.lng + longitudeRadius,
      west: event.location.lng - longitudeRadius,
    };
  }

  async loadEventSpots(event: PkEvent): Promise<(Spot | LocalSpot)[]> {
    const inline = event.inlineSpots.map((spot) =>
      this.buildInlineSpot(event.id, spot),
    );

    if (event.spotIds.length === 0) {
      return inline;
    }

    const previewSpots = await this._search
      .searchSpotPreviewsByIds(event.spotIds)
      .catch((err) => {
        console.warn("EventPageDataService: failed to load spot previews", err);
        return [];
      });
    const previewsById = new Map(
      previewSpots.map((preview) => [String(preview.id), preview]),
    );
    const missingIds = event.spotIds.filter(
      (id) => !previewsById.has(String(id)),
    );
    const fallbackSpots = await Promise.all(
      missingIds.map((id) =>
        firstValueFrom(
          this._spotsService.getSpotById$(id as SpotId, this._locale),
        ).catch(() => null),
      ),
    );
    const fallbackById = new Map(
      fallbackSpots
        .filter((spot): spot is Spot => !!spot)
        .map((spot) => [String(spot.id), spot]),
    );
    const loaded = event.spotIds
      .map(
        (id) =>
          fallbackById.get(String(id)) ??
          this._buildSpotPreview(previewsById.get(String(id))),
      )
      .filter((spot): spot is Spot | LocalSpot => !!spot);

    return [...inline, ...loaded];
  }

  async loadEventChallenges(
    event: PkEvent,
    spots: (Spot | LocalSpot)[],
  ): Promise<(SpotChallenge | null)[]> {
    if (Object.keys(event.challengeSpotMap).length === 0) {
      return [];
    }

    return Promise.all(
      Object.entries(event.challengeSpotMap).map(([challengeId, spotId]) => {
        const spot = spots.find(
          (candidate) =>
            candidate instanceof Spot && candidate.id === (spotId as SpotId),
        );
        if (!(spot instanceof Spot)) {
          return Promise.resolve(null);
        }
        return this._challengeService
          .getSpotChallenge(spot, challengeId)
          .then((challenge) => challenge ?? null)
          .catch(() => null);
      }),
    );
  }

  numberChallenges(
    challenges: (SpotChallenge | null)[],
  ): NumberedSpotChallenge[] {
    return challenges
      .map((challenge, index) => [challenge, index] as const)
      .filter(([challenge]) => challenge instanceof SpotChallenge)
      .map(
        ([challenge, index]) =>
          ({
            ...(challenge as SpotChallenge),
            number: index + 1,
          }) as NumberedSpotChallenge,
      );
  }

  spotMapMarkers(spots: (Spot | LocalSpot)[]): EventPageMapMarker[] {
    return spots.map((spot, spotIndex) => ({
      name: spot.name(),
      location: spot.location(),
      icons: [spot instanceof Spot && spot.isIconic ? "stars" : "location_on"],
      color: "primary",
      priority: EVENT_SPOT_MARKER_PRIORITY,
      ignoreCollisions: true,
      type: "event-spot",
      spotIndex,
    }));
  }

  eventLocationMarker(event: PkEvent | null): EventPageMapMarker | null {
    if (!event) return null;
    return {
      name: event.name,
      location: event.location,
      icons: ["event", "place"],
      color: "tertiary",
      priority: "required",
      type: "event-location",
    };
  }

  customMarkers(event: PkEvent | null): MarkerSchema[] {
    return (event?.customMarkers ?? []).map((marker) => ({
      name: marker.name,
      color: marker.color,
      location: marker.location,
      icons: marker.icons,
      priority:
        marker.priority === "required"
          ? "required"
          : Math.max(marker.priority ?? 0, EVENT_CUSTOM_MARKER_PRIORITY),
      type: "event-custom",
    }));
  }

  challengeMarkers(
    challenges: (SpotChallenge | null)[],
    selectedLabels: string[] = [],
    selectedParticipantTypes: string[] = [],
  ): EventPageMapMarker[] {
    const markers: EventPageMapMarker[] = [];
    challenges.forEach((challenge, index) => {
      if (!challenge || !challenge.location()) return;
      const matchesFilter =
        (!selectedLabels.length ||
          (challenge.label && selectedLabels.includes(challenge.label))) &&
        (!selectedParticipantTypes.length ||
          (challenge.participantType &&
            selectedParticipantTypes.includes(challenge.participantType)));

      markers.push({
        name: challenge.name(),
        location: challenge.location()!,
        color: matchesFilter ? "primary" : "gray",
        number: index + 1,
        priority: EVENT_CHALLENGE_MARKER_PRIORITY,
        type: "challenge",
        challengeIndex: index,
      });
    });
    return markers;
  }

  buildAreaPolygon(
    event: PkEvent | null,
    mapsApiLoaded: boolean,
    outerBounds?: EventBoundsSchema | null,
  ): PolygonSchema | null {
    if (!event?.areaPolygon || !mapsApiLoaded) {
      return null;
    }

    const eventAreaRings = this._eventAreaRings(event.areaPolygon);
    if (eventAreaRings.length === 0) {
      return null;
    }

    const outerRing = this._outerCutoutRing(
      outerBounds ?? this.eventMapBounds(event),
    );
    const paths = new google.maps.MVCArray<
      google.maps.MVCArray<google.maps.LatLng>
    >([
      this._toGoogleRing(outerRing),
      ...eventAreaRings.map((eventAreaRing) =>
        this._toGoogleRing(this._oppositeWinding(eventAreaRing, outerRing)),
      ),
    ]);

    return {
      paths,
      strokeOpacity: 0,
      strokeWeight: 0,
      fillColor: "#000000",
      fillOpacity: 0.5,
    };
  }

  private _eventAreaRings(
    rings: NonNullable<PkEvent["areaPolygon"]>,
  ): Array<Array<{ lat: number; lng: number }>> {
    return rings
      .filter((ring) => this._isEventAreaRing(ring))
      .map((ring) => ring.points)
      .filter((points) => points.length >= 3);
  }

  private _isEventAreaRing(
    ring: NonNullable<PkEvent["areaPolygon"]>[number],
  ): boolean {
    if (ring.area_name?.toLowerCase() === "outer") {
      return false;
    }

    if (this._isLegacyOuterRing(ring.points)) {
      return false;
    }

    return ring.points.every(
      (point) =>
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lng) &&
        Math.abs(point.lat) < 85,
    );
  }

  private _isLegacyOuterRing(
    points: Array<{ lat: number; lng: number }>,
  ): boolean {
    return (
      this._matchesRing(points, [
        { lat: 0, lng: -90 },
        { lat: 0, lng: 90 },
        { lat: 90, lng: -90 },
        { lat: 90, lng: 90 },
      ]) ||
      this._matchesRing(points, [
        { lat: -85, lng: -180 },
        { lat: -85, lng: 180 },
        { lat: 85, lng: 180 },
        { lat: 85, lng: -180 },
      ])
    );
  }

  private _matchesRing(
    points: Array<{ lat: number; lng: number }>,
    expected: Array<{ lat: number; lng: number }>,
  ): boolean {
    return (
      points.length === expected.length &&
      points.every(
        (point, index) =>
          point.lat === expected[index].lat && point.lng === expected[index].lng,
      )
    );
  }

  private _outerCutoutRing(
    bounds: EventBoundsSchema,
  ): Array<{ lat: number; lng: number }> {
    const latPadding = Math.max((bounds.north - bounds.south) * 0.5, 0.001);
    const lngPadding = Math.max((bounds.east - bounds.west) * 0.5, 0.001);
    const north = Math.min(85, bounds.north + latPadding);
    const south = Math.max(-85, bounds.south - latPadding);
    const east = Math.min(179.999, bounds.east + lngPadding);
    const west = Math.max(-179.999, bounds.west - lngPadding);

    return this._clockwise([
      { lat: south, lng: west },
      { lat: north, lng: west },
      { lat: north, lng: east },
      { lat: south, lng: east },
    ]);
  }

  private _oppositeWinding(
    ring: Array<{ lat: number; lng: number }>,
    reference: Array<{ lat: number; lng: number }>,
  ): Array<{ lat: number; lng: number }> {
    return this._signedArea(reference) < 0
      ? this._counterClockwise(ring)
      : this._clockwise(ring);
  }

  private _clockwise(
    ring: Array<{ lat: number; lng: number }>,
  ): Array<{ lat: number; lng: number }> {
    return this._signedArea(ring) <= 0 ? ring : [...ring].reverse();
  }

  private _counterClockwise(
    ring: Array<{ lat: number; lng: number }>,
  ): Array<{ lat: number; lng: number }> {
    return this._signedArea(ring) >= 0 ? ring : [...ring].reverse();
  }

  private _signedArea(ring: Array<{ lat: number; lng: number }>): number {
    return ring.reduce((area, point, index) => {
      const next = ring[(index + 1) % ring.length];
      return area + point.lng * next.lat - next.lng * point.lat;
    }, 0);
  }

  private _toGoogleRing(
    ring: Array<{ lat: number; lng: number }>,
  ): google.maps.MVCArray<google.maps.LatLng> {
    return new google.maps.MVCArray<google.maps.LatLng>(
      ring.map((point) => new google.maps.LatLng(point.lat, point.lng)),
    );
  }

  buildInlineSpot(_eventId: string, inline: InlineEventSpotSchema): LocalSpot {
    const data: SpotSchema = {
        location: new GeoPoint(inline.location.lat, inline.location.lng),
        name: {
          [this._locale]: { text: inline.name, provider: "user" },
        },
        address: null,
        bounds: inline.bounds?.map((bounds) => new GeoPoint(bounds.lat, bounds.lng)),
        media: (inline.images ?? []).map((src) => ({
          src,
          type: MediaType.Image,
          isInStorage: false,
        })),
        description: inline.description
          ? ({
              [this._locale]: { text: inline.description, provider: "user" },
            } as SpotSchema["description"])
          : undefined,
        is_iconic: inline.is_iconic ?? false,
        amenities: {},
      };
    return new LocalSpot(data, this._locale);
  }

  private _buildSpotPreview(preview: SpotPreviewData | undefined): LocalSpot | null {
    if (!preview) return null;
    const rawLocation =
      preview.location_raw ??
      (preview.location
        ? { lat: preview.location.latitude, lng: preview.location.longitude }
        : null);
    if (!rawLocation) return null;

    const data: SpotSchema = {
      location: new GeoPoint(rawLocation.lat, rawLocation.lng),
      location_raw: rawLocation,
      name: {
        [this._locale]: { text: preview.name, provider: "user" },
      },
      address: null,
      bounds: preview.bounds,
      bounds_raw: preview.bounds_raw,
      media: preview.imageSrc
        ? [
            {
              src: preview.imageSrc,
              type: MediaType.Image,
              isInStorage: false,
            },
          ]
        : [],
      is_iconic: preview.isIconic,
      type: preview.type as SpotSchema["type"],
      access: preview.access as SpotSchema["access"],
      amenities: preview.amenities ?? {},
    };
    return new LocalSpot(data, this._locale);
  }

  private _staticFallbackEvent(slugOrId: string): PkEvent | null {
    if (slugOrId !== "swissjam25") return null;
    return new PkEvent("swissjam25" as EventId, SWISSJAM25_STATIC);
  }
}
