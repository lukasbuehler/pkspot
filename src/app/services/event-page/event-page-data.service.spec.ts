import { TestBed } from "@angular/core/testing";
import { LOCALE_ID } from "@angular/core";
import { firstValueFrom, of } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { MediaType } from "../../../db/models/Interfaces";
import { EventsService } from "../firebase/firestore/events.service";
import { SpotsService } from "../firebase/firestore/spots.service";
import { SpotChallengesService } from "../firebase/firestore/spot-challenges.service";
import { EventPageDataService } from "./event-page-data.service";
import { SearchService } from "../search.service";

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
        { provide: SearchService, useValue: {} },
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
        { provide: SearchService, useValue: {} },
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
        { provide: SearchService, useValue: {} },
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
          id: "info-stand",
          name: "Info stand",
          description: "Pick up your wristband here.",
          locality: "Main hall",
          google_place_id: "google-place-1",
          url: "https://example.com/info",
          media: [
            {
              src: "https://example.com/info.jpg",
              type: MediaType.Image,
              isInStorage: false,
            },
          ],
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
        id: "info-stand",
        name: "Info stand",
        description: "Pick up your wristband here.",
        locality: "Main hall",
        googlePlaceId: "google-place-1",
        url: "https://example.com/info",
        media: [
          {
            src: "https://example.com/info.jpg",
            type: MediaType.Image,
            isInStorage: false,
          },
        ],
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

  it("expands event map bounds to include loaded marker locations", () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SpotsService, useValue: {} },
        { provide: SpotChallengesService, useValue: {} },
        { provide: SearchService, useValue: {} },
        { provide: LOCALE_ID, useValue: "en" },
      ],
    });

    const service = TestBed.inject(EventPageDataService);
    const event = buildEvent("city-jam");

    expect(
      service.eventMapBounds(event, [
        { lat: 47.8, lng: 8.2 },
        { lat: 47.2, lng: 8.9 },
      ]),
    ).toEqual({
      north: 47.8,
      south: 47.2,
      east: 8.9,
      west: 8.2,
    });
  });

  it("normalizes inverted saved event bounds before passing them to maps", () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SpotsService, useValue: {} },
        { provide: SpotChallengesService, useValue: {} },
        { provide: SearchService, useValue: {} },
        { provide: LOCALE_ID, useValue: "en" },
      ],
    });

    const service = TestBed.inject(EventPageDataService);
    const event = buildEvent("city-jam", {
      bounds: {
        north: 47.3,
        south: 47.4,
        east: 8.5,
        west: 8.6,
      },
    });

    expect(service.eventMapBounds(event)).toEqual({
      north: 47.4,
      south: 47.3,
      east: 8.6,
      west: 8.5,
    });
  });

  it("pads collapsed saved event bounds before passing them to maps", () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SpotsService, useValue: {} },
        { provide: SpotChallengesService, useValue: {} },
        { provide: SearchService, useValue: {} },
        { provide: LOCALE_ID, useValue: "en" },
      ],
    });

    const service = TestBed.inject(EventPageDataService);
    const event = buildEvent("city-jam", {
      bounds: {
        north: 49.1951,
        south: 49.1951,
        east: 16.6068,
        west: 16.6068,
      },
    });

    const bounds = service.eventMapBounds(event);

    expect(bounds.north).toBeGreaterThan(bounds.south);
    expect(bounds.east).toBeGreaterThan(bounds.west);
  });

  it("loads linked event spots from Typesense previews", async () => {
    const searchService = {
      searchSpotPreviewsByIds: vi.fn(() =>
        Promise.resolve([
          {
            id: "spot-1",
            name: "Preview Spot",
            location_raw: { lat: 47.33, lng: 8.54 },
            locality: "Zurich",
            imageSrc: "",
            isIconic: true,
          },
        ]),
      ),
    };
    const spotsService = {
      getSpotById$: vi.fn(() => of(null)),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SpotsService, useValue: spotsService },
        { provide: SpotChallengesService, useValue: {} },
        { provide: SearchService, useValue: searchService },
        { provide: LOCALE_ID, useValue: "en" },
      ],
    });

    const service = TestBed.inject(EventPageDataService);
    const event = buildEvent("city-jam", {
      spot_ids: ["spot-1"],
    });

    const spots = await service.loadEventSpots(event);

    expect(searchService.searchSpotPreviewsByIds).toHaveBeenCalledWith([
      "spot-1",
    ]);
    expect(spotsService.getSpotById$).not.toHaveBeenCalled();
    expect(spots[0]?.name()).toBe("Preview Spot");
    expect(spots[0]?.location()).toEqual({ lat: 47.33, lng: 8.54 });
  });

  it("falls back to Firestore slug lookup for unresolved event spot refs", async () => {
    const slugSpot = {
      id: "spot-id-1",
      slug: "in-motion-academy",
      name: () => "In Motion Academy",
      location: () => ({ lat: 49.1951, lng: 16.6068 }),
    };
    const searchService = {
      searchSpotPreviewsByIds: vi.fn(() => Promise.resolve([])),
    };
    const spotsService = {
      getSpotById$: vi.fn(() => of(null)),
      getSpotBySlug: vi.fn(() => Promise.resolve(slugSpot)),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SpotsService, useValue: spotsService },
        { provide: SpotChallengesService, useValue: {} },
        { provide: SearchService, useValue: searchService },
        { provide: LOCALE_ID, useValue: "en" },
      ],
    });

    const service = TestBed.inject(EventPageDataService);
    const event = buildEvent("parkour-earth-worlds", {
      spot_ids: ["in-motion-academy"],
    });

    const spots = await service.loadEventSpots(event);

    expect(spotsService.getSpotBySlug).toHaveBeenCalledWith(
      "in-motion-academy",
      "en",
    );
    expect(spots[0]?.name()).toBe("In Motion Academy");
    expect(spots[0]?.location()).toEqual({ lat: 49.1951, lng: 16.6068 });
  });

  it("prioritizes event custom markers above challenge markers and spot markers", () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SpotsService, useValue: {} },
        { provide: SpotChallengesService, useValue: {} },
        { provide: SearchService, useValue: {} },
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
        { provide: SearchService, useValue: {} },
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
        { provide: SearchService, useValue: {} },
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
