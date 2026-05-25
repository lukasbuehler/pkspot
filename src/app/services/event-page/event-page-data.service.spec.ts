import { TestBed } from "@angular/core/testing";
import { LOCALE_ID } from "@angular/core";
import { describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { EventsService } from "../firebase/firestore/events.service";
import { SpotsService } from "../firebase/firestore/spots.service";
import { SpotChallengesService } from "../firebase/firestore/spot-challenges.service";
import { EventPageDataService } from "./event-page-data.service";

const buildEvent = (
  id: string,
  patch: Partial<EventSchema> = {},
): PkEvent =>
  new PkEvent(id as EventId, {
    name: "City Jam",
    slug: id,
    venue_string: "Test Venue",
    locality_string: "Zurich, Switzerland",
    location_raw: { lat: 47.35, lng: 8.55 },
    start: "2026-06-14T10:00:00.000Z",
    end: "2026-06-15T10:00:00.000Z",
    bounds: {
      north: 47.4,
      south: 47.3,
      east: 8.6,
      west: 8.5,
    },
    ...patch,
  } as unknown as EventSchema);

describe("EventPageDataService", () => {
  it("loads events by slug through EventsService", async () => {
    const event = buildEvent("city-jam");
    const eventsService = {
      getEventBySlugOrId: vi.fn(() => Promise.resolve(event)),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: eventsService },
        { provide: SpotsService, useValue: {} },
        { provide: SpotChallengesService, useValue: {} },
        { provide: LOCALE_ID, useValue: "en" },
      ],
    });

    const service = TestBed.inject(EventPageDataService);

    await expect(service.loadEventBySlugOrId("city-jam")).resolves.toBe(event);
    expect(eventsService.getEventBySlugOrId).toHaveBeenCalledWith("city-jam");
  });

  it("builds event spot and custom marker data for event maps", () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SpotsService, useValue: {} },
        { provide: SpotChallengesService, useValue: {} },
        { provide: LOCALE_ID, useValue: "en" },
      ],
    });

    const service = TestBed.inject(EventPageDataService);
    const spot = {
      name: () => "Main Spot",
      location: () => ({ lat: 47.3, lng: 8.5 }),
    };
    const event = buildEvent("city-jam", {
      custom_markers: [
        {
          name: "Info stand",
          location: { lat: 47.31, lng: 8.51 },
          icons: ["info"],
          color: "secondary",
        },
      ],
    });

    expect(service.spotMapMarkers([spot as never])).toEqual([
      expect.objectContaining({
        name: "Main Spot",
        type: "event-spot",
        spotIndex: 0,
      }),
    ]);
    expect(service.customMarkers(event)).toEqual([
      expect.objectContaining({
        name: "Info stand",
        icons: ["info"],
      }),
    ]);
    expect(service.eventLocationMarker(event)).toEqual(
      expect.objectContaining({
        name: "City Jam",
        location: { lat: 47.35, lng: 8.55 },
        icons: ["event", "place"],
        priority: "required",
        type: "event-location",
      }),
    );
  });
});
