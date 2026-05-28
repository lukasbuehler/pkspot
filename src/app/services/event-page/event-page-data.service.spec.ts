import { TestBed } from "@angular/core/testing";
import { LOCALE_ID } from "@angular/core";
import { firstValueFrom, of } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

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

  it("observes events by slug through EventsService", async () => {
    const event = buildEvent("city-jam");
    const eventsService = {
      observeEventBySlugOrId: vi.fn(() => of(event)),
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

    await expect(firstValueFrom(service.observeEventBySlugOrId("city-jam")))
      .resolves.toBe(event);
    expect(eventsService.observeEventBySlugOrId).toHaveBeenCalledWith(
      "city-jam",
    );
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
        ignoreCollisions: true,
        priority: 1000,
        type: "event-spot",
        spotIndex: 0,
      }),
    ]);
    expect(service.customMarkers(event)).toEqual([
      expect.objectContaining({
        name: "Info stand",
        icons: ["info"],
        priority: 3000,
        type: "event-custom",
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

  it("prioritizes event custom markers above challenge markers and spot markers", () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SpotsService, useValue: {} },
        { provide: SpotChallengesService, useValue: {} },
        { provide: LOCALE_ID, useValue: "en" },
      ],
    });

    const service = TestBed.inject(EventPageDataService);
    const event = buildEvent("city-jam", {
      custom_markers: [
        {
          name: "Meetup point",
          location: { lat: 47.31, lng: 8.51 },
          icons: ["flag"],
        },
      ],
    });
    const challenge = {
      name: () => "Precision",
      location: () => ({ lat: 47.31, lng: 8.51 }),
    };
    const spot = {
      name: () => "Main Spot",
      location: () => ({ lat: 47.31, lng: 8.51 }),
    };

    const customMarker = service.customMarkers(event)[0];
    const challengeMarker = service.challengeMarkers([challenge as never])[0];
    const spotMarker = service.spotMapMarkers([spot as never])[0];

    expect(customMarker.priority).toBeGreaterThan(
      challengeMarker.priority as number,
    );
    expect(challengeMarker.priority).toBeGreaterThan(
      spotMarker.priority as number,
    );
  });

  it("builds event area polygons as a client-side cutout from one saved ring", () => {
    class MockLatLng {
      constructor(
        private readonly latValue: number,
        private readonly lngValue: number,
      ) {}

      lat(): number {
        return this.latValue;
      }

      lng(): number {
        return this.lngValue;
      }
    }

    class MockMVCArray<T> {
      constructor(private readonly items: T[]) {}

      getLength(): number {
        return this.items.length;
      }

      getAt(index: number): T {
        return this.items[index];
      }
    }

    vi.stubGlobal("google", {
      maps: {
        LatLng: MockLatLng,
        MVCArray: MockMVCArray,
      },
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SpotsService, useValue: {} },
        { provide: SpotChallengesService, useValue: {} },
        { provide: LOCALE_ID, useValue: "en" },
      ],
    });

    const service = TestBed.inject(EventPageDataService);
    const event = buildEvent("city-jam", {
      area_polygon: [
        {
          points: [
            { lat: 47.31, lng: 8.51 },
            { lat: 47.32, lng: 8.53 },
            { lat: 47.3, lng: 8.54 },
          ],
        },
      ],
    });

    const polygon = service.buildAreaPolygon(event, true);
    const paths =
      polygon?.paths as unknown as MockMVCArray<MockMVCArray<MockLatLng>>;

    expect(paths.getLength()).toBe(2);
    expect(paths.getAt(0).getLength()).toBe(4);
    expect(paths.getAt(1).getLength()).toBe(3);
    expect(paths.getAt(1).getAt(0).lat()).toBeCloseTo(47.3);

    const outer = Array.from({ length: paths.getAt(0).getLength() }, (_, index) => ({
      lat: paths.getAt(0).getAt(index).lat(),
      lng: paths.getAt(0).getAt(index).lng(),
    }));
    expect(Math.max(...outer.map((point) => point.lat))).toBeCloseTo(47.45);
    expect(Math.min(...outer.map((point) => point.lat))).toBeCloseTo(47.25);
    expect(Math.max(...outer.map((point) => point.lng))).toBeCloseTo(8.65);
    expect(Math.min(...outer.map((point) => point.lng))).toBeCloseTo(8.45);
  });

  it("ignores legacy outer rings and uses the visible viewport for the cutout", () => {
    class MockLatLng {
      constructor(
        private readonly latValue: number,
        private readonly lngValue: number,
      ) {}

      lat(): number {
        return this.latValue;
      }

      lng(): number {
        return this.lngValue;
      }
    }

    class MockMVCArray<T> {
      constructor(private readonly items: T[]) {}

      getLength(): number {
        return this.items.length;
      }

      getAt(index: number): T {
        return this.items[index];
      }
    }

    vi.stubGlobal("google", {
      maps: {
        LatLng: MockLatLng,
        MVCArray: MockMVCArray,
      },
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SpotsService, useValue: {} },
        { provide: SpotChallengesService, useValue: {} },
        { provide: LOCALE_ID, useValue: "en" },
      ],
    });

    const service = TestBed.inject(EventPageDataService);
    const event = buildEvent("city-jam", {
      area_polygon: [
        {
          points: [
            { lat: 0, lng: -90 },
            { lat: 0, lng: 90 },
            { lat: 90, lng: -90 },
            { lat: 90, lng: 90 },
          ],
        },
        {
          area_name: "Main area",
          points: [
            { lat: 47.31, lng: 8.51 },
            { lat: 47.32, lng: 8.53 },
            { lat: 47.3, lng: 8.54 },
          ],
        },
        {
          area_name: "Warmup area",
          points: [
            { lat: 47.34, lng: 8.55 },
            { lat: 47.35, lng: 8.56 },
            { lat: 47.33, lng: 8.57 },
          ],
        },
      ],
    });

    const polygon = service.buildAreaPolygon(event, true, {
      north: 47.5,
      south: 47.2,
      east: 8.7,
      west: 8.4,
    });
    const paths =
      polygon?.paths as unknown as MockMVCArray<MockMVCArray<MockLatLng>>;

    expect(paths.getLength()).toBe(3);
    expect(paths.getAt(0).getLength()).toBe(4);
    expect(paths.getAt(1).getAt(0).lat()).toBeCloseTo(47.3);
    expect(paths.getAt(2).getAt(0).lat()).toBeCloseTo(47.33);

    const outer = Array.from(
      { length: paths.getAt(0).getLength() },
      (_, index) => ({
        lat: paths.getAt(0).getAt(index).lat(),
        lng: paths.getAt(0).getAt(index).lng(),
      }),
    );
    expect(Math.max(...outer.map((point) => point.lat))).toBeCloseTo(47.65);
    expect(Math.min(...outer.map((point) => point.lat))).toBeCloseTo(47.05);
    expect(Math.max(...outer.map((point) => point.lng))).toBeCloseTo(8.85);
    expect(Math.min(...outer.map((point) => point.lng))).toBeCloseTo(8.25);
  });
});
