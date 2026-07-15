import { LocationStrategy } from "@angular/common";
import { LOCALE_ID, PLATFORM_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ActivatedRoute, convertToParamMap, Router } from "@angular/router";
import { GeoPoint } from "firebase/firestore";
import { of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
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
    const eventPageData = {
      eventCanonicalPath: vi.fn(() => "/events/swissjam26"),
      customMarkers: vi.fn(() => [
        {
          name: "Custom",
          location: { lat: 47.3, lng: 8.5 },
          priority: 3000,
          type: "event-custom",
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

    expect(component.staticMarkers().map((marker) => marker.type)).toEqual([
      "event-custom",
    ]);
    expect(component.mapPriorityMarkers().map((marker) => marker.type)).toEqual(
      ["event-custom", "challenge"],
    );
    expect(component.spotMapMarkers().map((marker) => marker.type)).toEqual([
      "event-spot",
    ]);

    const localSpot = buildLocalSpot("Inline spot");
    component.spots.set([localSpot]);
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
      queryParams: { spotId: null },
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
