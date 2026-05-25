import { LocationStrategy } from "@angular/common";
import { LOCALE_ID, PLATFORM_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ActivatedRoute, convertToParamMap, Router } from "@angular/router";
import { of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { AnalyticsService } from "../../services/analytics.service";
import { EventPageDataService } from "../../services/event-page/event-page-data.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { SpotChallengesService } from "../../services/firebase/firestore/spot-challenges.service";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { MapsApiService } from "../../services/maps-api.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { ResponsiveService } from "../../services/responsive.service";
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

const buildEvent = (id: string): PkEvent =>
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
  } as unknown as EventSchema);

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

  it("orders map markers so custom pins and challenges win collisions before event spots", () => {
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
      ["event-custom", "challenge", "event-spot"],
    );
  });
});
