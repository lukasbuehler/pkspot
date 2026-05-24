import { Injectable, LOCALE_ID, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { Event as PkEvent } from "../../../db/models/Event";
import { LocaleCode, MediaType } from "../../../db/models/Interfaces";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { EventId, InlineEventSpotSchema } from "../../../db/schemas/EventSchema";
import { PolygonSchema } from "../../../db/schemas/PolygonSchema";
import { SpotId, SpotSchema } from "../../../db/schemas/SpotSchema";
import { GeoPoint } from "firebase/firestore";
import { SpotChallenge } from "../../../db/models/SpotChallenge";
import { MarkerSchema } from "../../components/marker/marker.component";
import { EventsService } from "../firebase/firestore/events.service";
import { SpotsService } from "../firebase/firestore/spots.service";
import { SpotChallengesService } from "../firebase/firestore/spot-challenges.service";
import { SWISSJAM25_STATIC } from "../../components/event-page/swissjam25.static";

export type EventPageMapMarker = MarkerSchema & {
  spotIndex?: number;
  challengeIndex?: number;
  type?: string;
};

export type NumberedSpotChallenge = SpotChallenge & { number: number };

@Injectable({
  providedIn: "root",
})
export class EventPageDataService {
  private _eventsService = inject(EventsService);
  private _spotsService = inject(SpotsService);
  private _challengeService = inject(SpotChallengesService);
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

  eventCanonicalPath(event: PkEvent): string {
    return `/events/${event.slug ?? event.id}`;
  }

  async loadEventSpots(event: PkEvent): Promise<(Spot | LocalSpot)[]> {
    const inline = event.inlineSpots.map((spot) =>
      this.buildInlineSpot(event.id, spot),
    );

    if (event.spotIds.length === 0) {
      return inline;
    }

    const loaded = await Promise.all(
      event.spotIds.map((id) =>
        firstValueFrom(
          this._spotsService.getSpotById$(id as SpotId, this._locale),
        ).catch(() => null),
      ),
    );

    return [...inline, ...loaded.filter((spot): spot is Spot => !!spot)];
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
      type: "event-spot",
      spotIndex,
    }));
  }

  customMarkers(event: PkEvent | null): MarkerSchema[] {
    return (event?.customMarkers ?? []).map((marker) => ({
      name: marker.name,
      color: marker.color,
      location: marker.location,
      icons: marker.icons,
      priority: marker.priority,
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
        type: "challenge",
        challengeIndex: index,
      });
    });
    return markers;
  }

  buildAreaPolygon(
    event: PkEvent | null,
    mapsApiLoaded: boolean,
  ): PolygonSchema | null {
    if (!event?.areaPolygon || !mapsApiLoaded) {
      return null;
    }

    const paths = new google.maps.MVCArray<
      google.maps.MVCArray<google.maps.LatLng>
    >(
      event.areaPolygon.map(
        (ring) =>
          new google.maps.MVCArray<google.maps.LatLng>(
            ring.points.map((point) => new google.maps.LatLng(point.lat, point.lng)),
          ),
      ),
    );

    return {
      paths,
      strokeOpacity: 0,
      strokeWeight: 0,
      fillColor: "#000000",
      fillOpacity: 0.5,
    };
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
}
