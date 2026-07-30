import { LocationStrategy } from "@angular/common";
import { LOCALE_ID, PLATFORM_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ActivatedRoute, convertToParamMap, Router } from "@angular/router";
import { GeoPoint } from "firebase/firestore";
import { of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { MediaType } from "../../../db/models/Interfaces";
import { LocalSpot } from "../../../db/models/Spot";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { SpotId, SpotSchema } from "../../../db/schemas/SpotSchema";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { AnalyticsService } from "../../services/analytics.service";
import { EventPageDataService } from "../../services/event-page/event-page-data.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { SpotChallengesService } from "../../services/firebase/firestore/spot-challenges.service";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { MapsApiService } from "../../services/maps-api.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { ResponsiveService } from "../../services/responsive.service";
import { GoogleMap2dComponent } from "../google-map-2d/google-map-2d.component";
import { EventMapPageComponent } from "./event-map-page.component";

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const flushSignalEffects = () => {
  const maybeFlushEffects = TestBed as unknown as {
    flushEffects?: () => void;
  };
  maybeFlushEffects.flushEffects?.();
};

const buildEvent = (id: string, extra: Partial<EventSchema> = {}): PkEvent =>
  new PkEvent(id as EventId, {
    name: "Swiss Jam 2026",
    slug: id,
    venue_string: "Test Venue",
    locality_string: "Zurich, Switzerland",
    start: "2026-06-14T10:00:00.000Z",
    end: "2026-06-15T10:00:00.000Z",
    bounds: {
      north: 47.4,
      south: 47.3,
      east: 8.6,
      west: 8.5,
    },
    ...extra,
  } as unknown as EventSchema);

const buildLocalSpot = (name: string): LocalSpot =>
  new LocalSpot(
    {
      name: {
        en: { text: name, provider: "user" },
      },
      location: new GeoPoint(47.3, 8.5),
      location_raw: { lat: 47.3, lng: 8.5 },
      address: null,
      media: [],
      amenities: {},
    } as SpotSchema,
    "en",
  );

describe("EventMapPageComponent", () => {
  it("keeps the map view noindex and canonicalized to the event info page", async () => {
    const event = buildEvent("swissjam26");
    const eventPageData = {
      loadEventBySlugOrId: vi.fn(() => Promise.resolve(event)),
      eventCanonicalPath: vi.fn(() => "/events/swissjam26"),
    };
    const metaTagService = {
      setEventMetaTags: vi.fn(),
      setRobotsContent: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: EventPageDataService, useValue: eventPageData },
        { provide: EventsService, useValue: {} },
        { provide: SpotsService, useValue: {} },
        { provide: SpotChallengesService, useValue: {} },
        {
          provide: AuthenticationService,
          useValue: { user: { data: null }, isAdmin: signal(false) },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ slug: "swissjam26" })),
            queryParams: of({}),
            data: of({ routeName: "Event Map" }),
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: LocationStrategy, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MetaTagService, useValue: metaTagService },
        {
          provide: MapsApiService,
          useValue: {
            isApiLoaded: vi.fn(() => true),
            loadGoogleMapsApi: vi.fn(),
          },
        },
        {
          provide: AnalyticsService,
          useValue: {
            addUtmToUrl: vi.fn((url?: string) => url),
            trackEvent: vi.fn(),
          },
        },
        { provide: ResponsiveService, useValue: { isDesktop: signal(true) } },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventMapPageComponent(),
    );

    component.ngOnInit();
    await flushPromises();
    flushSignalEffects();

    expect(metaTagService.setEventMetaTags).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: "Swiss Jam 2026",
      }),
      "/events/swissjam26",
    );
    expect(metaTagService.setRobotsContent).toHaveBeenLastCalledWith(
      "noindex,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    );
  });

  it("keeps custom pins and challenges in priority markers while event spots use preview markers", () => {
    const router = { navigate: vi.fn() };
    const eventSpotPreview = {
      id: "main-stage" as SpotId,
      name: "Main stage",
      location: new GeoPoint(47.3, 8.5),
      location_raw: { lat: 47.3, lng: 8.5 },
      locality: "",
      imageSrc: "",
      isIconic: false,
    } satisfies SpotPreviewData;
    const eventPageData = {
      eventCanonicalPath: vi.fn(() => "/events/swissjam26"),
      customMarkers: vi.fn(() => [
        {
          id: "camp",
          name: "Custom",
          location: { lat: 47.3, lng: 8.5 },
          color: "tertiary",
          priority: 3000,
          type: "event-custom",
          media: [
            {
              src: "https://example.com/event-marker.jpg",
              type: MediaType.Image,
              isInStorage: false,
            },
          ],
        },
      ]),
      eventLocationMarker: vi.fn(() => ({
        name: "Event location",
        location: { lat: 47.3, lng: 8.5 },
        priority: "required",
        type: "event-location",
      })),
      spotMapMarkers: vi.fn(() => [
        {
          name: "Spot",
          location: { lat: 47.3, lng: 8.5 },
          type: "event-spot",
          spotIndex: 0,
        },
      ]),
      spotPreviewMarkers: vi.fn(() => [eventSpotPreview]),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: EventPageDataService, useValue: eventPageData },
        { provide: EventsService, useValue: {} },
        { provide: SpotsService, useValue: {} },
        { provide: SpotChallengesService, useValue: {} },
        {
          provide: AuthenticationService,
          useValue: { user: { data: null }, isAdmin: signal(false) },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ slug: "swissjam26" })),
            queryParams: of({}),
            data: of({ routeName: "Event Map" }),
          },
        },
        { provide: Router, useValue: router },
        { provide: LocationStrategy, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        {
          provide: MetaTagService,
          useValue: {
            setEventMetaTags: vi.fn(),
            setRobotsContent: vi.fn(),
          },
        },
        {
          provide: MapsApiService,
          useValue: {
            isApiLoaded: vi.fn(() => true),
            loadGoogleMapsApi: vi.fn(),
          },
        },
        {
          provide: AnalyticsService,
          useValue: {
            addUtmToUrl: vi.fn((url?: string) => url),
            trackEvent: vi.fn(),
          },
        },
        { provide: ResponsiveService, useValue: { isDesktop: signal(true) } },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventMapPageComponent(),
    );

    component.event.set(buildEvent("swissjam26"));
    component.markers.set([
      {
        name: "Custom",
        location: { lat: 47.3, lng: 8.5 },
        priority: 3000,
        type: "event-custom",
      },
      {
        name: "Challenge",
        location: { lat: 47.3, lng: 8.5 },
        priority: 2000,
        type: "challenge",
        challengeIndex: 0,
      },
    ]);
    component.spots.set([{} as never]);
    flushSignalEffects();

    expect(component.tab()).toBe("all");
    expect(
      component.mapObjectFilterChips().map((filter) => filter.label),
    ).toEqual(["All", "1 Spot", "1 Event"]);
    expect(component.staticMarkers().map((marker) => marker.type)).toEqual([
      "event-custom",
    ]);
    expect(component.mapPriorityMarkers().map((marker) => marker.type)).toEqual(
      ["event-custom", "challenge"],
    );
    expect(component.spotMapMarkers().map((marker) => marker.type)).toEqual([
      "event-spot",
    ]);

    component.selectTab("event");
    expect(component.mapPriorityMarkers().map((marker) => marker.type)).toEqual([
      "event-custom",
    ]);
    expect(component.highlightedSpots()).toEqual([]);

    const customMarker = component.customMarkers()[0];
    component.selectCustomMarker(customMarker);
    expect(component.selectedCustomMarkerMedia()[0]?.baseSrc).toBe(
      "https://example.com/event-marker.jpg",
    );

    component.selectTab("spots");
    expect(component.mapPriorityMarkers()).toEqual([]);

    component.selectTab("all");
    expect(component.mapPriorityMarkers().map((marker) => marker.type)).toEqual([
      "event-custom",
      "challenge",
    ]);

    const localSpot = buildLocalSpot("Inline spot");
    component.event.set(
      buildEvent("swissjam26", {
        time_zone: "UTC",
        inline_spots: [
          {
            id: "main-stage",
            name: "Main stage",
            location: { lat: 47.3, lng: 8.5 },
          },
        ],
        program: {
          active_plan_id: "main",
          plans: [
            {
              id: "main",
              label: "Main",
              kind: "main",
              items: [
                {
                  id: "training",
                  title: "Training",
                  category: "workshop",
                  start: "2026-06-14T10:00:00.000Z",
                  end: "2026-06-14T12:00:00.000Z",
                  spot_ref: { kind: "inline_spot", id: "main-stage" },
                },
                {
                  id: "jam",
                  title: "Jam",
                  category: "jam",
                  start: "2026-06-14T14:00:00.000Z",
                  spot_ref: { kind: "inline_spot", id: "main-stage" },
                },
                {
                  id: "dinner",
                  title: "Dinner",
                  category: "social",
                  start: "2026-06-14T16:00:00.000Z",
                  end: "2026-06-14T17:00:00.000Z",
                  spot_ref: { kind: "custom_marker", id: "camp" },
                },
              ],
            },
          ],
        },
      }),
    );
    component.spots.set([localSpot]);
    component.spotBindings.set([
      {
        ref: { kind: "inline_spot", id: "main-stage" },
        spot: localSpot,
      },
    ]);
    component.now.set(new Date("2026-06-14T10:30:00.000Z"));
    component.selectedProgramDay.set("2026-06-14");
    component.tab.set("program");

    expect(component.highlightedSpots()).toEqual([eventSpotPreview]);
    expect(component.mapPriorityMarkers()).toEqual([
      expect.objectContaining({
        type: "event-program",
        color: "secondary",
        badge: "+1",
        number: expect.stringContaining("10"),
      }),
      expect.objectContaining({
        type: "event-program",
        name: expect.stringContaining("Custom"),
        color: "tertiary",
        location: { lat: 47.3, lng: 8.5 },
        number: expect.stringContaining("4"),
      }),
    ]);

    component.now.set(new Date("2026-06-14T16:30:00.000Z"));
    expect(component.mapPriorityMarkers()[1]).toEqual(
      expect.objectContaining({
        name: expect.stringContaining("Custom"),
        color: "tertiary",
      }),
    );

    component.selectedProgramDay.set("");
    expect(component.mapPriorityMarkers()[0]?.number).not.toContain("Jun");

    component.openProgramDay("2026-06-14");
    expect(component.selectedProgramDay()).toBe("2026-06-14");

    component.closeProgramDay("2026-06-14");
    expect(component.selectedProgramDay()).toBe("");

    component.markerClick(0);
    expect(component.selectedSpot()).toBe(localSpot);
    expect(component.selectedProgramItemId()).toBe("training");

    component.markerClick(1);
    expect(component.selectedCustomMarker()?.id).toBe("camp");
    expect(component.selectedSpot()).toBeNull();
    expect(component.selectedProgramItemId()).toBe("dinner");
    expect(router.navigate).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({
          mapFilter: "program",
          markerId: "camp",
          spotId: null,
          programItemId: "dinner",
        }),
      }),
    );

    component.selectProgramDay(null);
    expect(component.tab()).toBe("spots");
    expect(component.mapPriorityMarkers()).toEqual([]);
    expect(router.navigate).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({
          mapFilter: "spots",
          day: null,
          programItemId: null,
        }),
      }),
    );

    component.tab.set("all");
    component.selectSpot({
      id: "event-local-spot-0" as SpotId,
      name: "Inline spot",
      location: new GeoPoint(47.3, 8.5),
      location_raw: { lat: 47.3, lng: 8.5 },
      locality: "",
      imageSrc: "",
      isIconic: false,
    } satisfies SpotPreviewData);

    expect(component.selectedSpot()).toBe(localSpot);
  });

  it("syncs selected event spots to the spotId query param and focuses them when the deferred map loads", () => {
    const router = { navigate: vi.fn() };
    const route = {
      paramMap: of(convertToParamMap({ slug: "swissjam26" })),
      queryParams: of({ showHeader: "false" }),
      data: of({ routeName: "Event Map" }),
    };

    TestBed.configureTestingModule({
      providers: [
        {
          provide: EventPageDataService,
          useValue: {
            eventCanonicalPath: vi.fn(() => "/events/swissjam26"),
            customMarkers: vi.fn(() => []),
            eventLocationMarker: vi.fn(() => null),
            spotMapMarkers: vi.fn(() => []),
          },
        },
        { provide: EventsService, useValue: {} },
        { provide: SpotsService, useValue: {} },
        { provide: SpotChallengesService, useValue: {} },
        {
          provide: AuthenticationService,
          useValue: { user: { data: null }, isAdmin: signal(false) },
        },
        { provide: ActivatedRoute, useValue: route },
        { provide: Router, useValue: router },
        { provide: LocationStrategy, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        {
          provide: MetaTagService,
          useValue: {
            setEventMetaTags: vi.fn(),
            setRobotsContent: vi.fn(),
          },
        },
        {
          provide: MapsApiService,
          useValue: {
            isApiLoaded: vi.fn(() => true),
            loadGoogleMapsApi: vi.fn(),
          },
        },
        {
          provide: AnalyticsService,
          useValue: {
            addUtmToUrl: vi.fn((url?: string) => url),
            trackEvent: vi.fn(),
          },
        },
        { provide: ResponsiveService, useValue: { isDesktop: signal(true) } },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventMapPageComponent(),
    );
    const localSpot = buildLocalSpot("Inline spot");
    component.event.set(
      buildEvent("swissjam26", {
        inline_spots: [
          {
            id: "main-stage",
            name: "Main stage",
            location: { lat: 47.3, lng: 8.5 },
          },
        ],
      }),
    );
    component.spots.set([localSpot]);

    component.selectSpot(localSpot);

    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: route,
      queryParams: { spotId: "main-stage" },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });

    const focusOnLocation = vi.fn();
    const map = Object.assign(Object.create(GoogleMap2dComponent.prototype), {
      focusOnLocation,
    }) as GoogleMap2dComponent;
    component.spotMap = map;

    expect(focusOnLocation).toHaveBeenCalledWith(localSpot.location());

    component.deselectSpot();

    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: route,
      queryParams: { spotId: null, markerId: null },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });

    component.event.set(
      buildEvent("swissjam26", {
        inline_spots: [
          {
            name: "Main stage",
            location: { lat: 47.3, lng: 8.5 },
          },
        ],
      }),
    );
    component.selectSpot(localSpot);

    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: route,
      queryParams: { spotId: "event-local-spot-0" },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });

    component.selectedSpot.set(null);
    component.selectSpot("event-local-spot-0" as SpotId, false);

    expect(component.selectedSpot()).toBe(localSpot);
  });
});
