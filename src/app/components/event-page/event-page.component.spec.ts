import { LocationStrategy } from "@angular/common";
import { LOCALE_ID, PLATFORM_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ActivatedRoute, convertToParamMap, Router } from "@angular/router";
import { BehaviorSubject, of } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { AnalyticsService } from "../../services/analytics.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { SeriesService } from "../../services/firebase/firestore/series.service";
import { SpotChallengesService } from "../../services/firebase/firestore/spot-challenges.service";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { MapsApiService } from "../../services/maps-api.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { ResponsiveService } from "../../services/responsive.service";
import { StructuredDataService } from "../../services/structured-data.service";
import { eventHeroMedia } from "../event-display/event-display.helpers";
import { EventInfoPageComponent } from "./event-page.component";

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

const buildEvent = (
  id: string,
  name: string,
  extra: Partial<EventSchema> = {},
): PkEvent =>
  new PkEvent(id as EventId, {
    name,
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

const seriesServiceStub = () => ({
  getSeriesByIds: vi.fn(async () => ({})),
});

describe("EventInfoPageComponent", () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it("exposes dummy event info as text and structured data for crawlers", () => {
    const structuredDataService = {
      addStructuredData: vi.fn(),
      removeStructuredData: vi.fn(),
    };
    const metaTagService = {
      setEventMetaTags: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SeriesService, useValue: seriesServiceStub() },
        { provide: SpotsService, useValue: {} },
        { provide: SpotChallengesService, useValue: {} },
        {
          provide: AuthenticationService,
          useValue: { user: { data: null }, isAdmin: signal(false) },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ slug: "dummy-city-jam" })),
            queryParams: of({}),
            data: of({ routeName: "Event" }),
            snapshot: {
              paramMap: convertToParamMap({ slug: "dummy-city-jam" }),
            },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: LocationStrategy, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MetaTagService, useValue: metaTagService },
        { provide: StructuredDataService, useValue: structuredDataService },
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
          },
        },
        { provide: ResponsiveService, useValue: {} },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventInfoPageComponent(),
    );
    const event = buildEvent("dummy-city-jam", "Dummy City Jam", {
      description: "A dummy event page for crawler-readable parkour jam info.",
      venue_string: "Dummy Training Hall",
      locality_string: "Dummy City, Switzerland",
    });

    component.event.set(event);
    flushSignalEffects();

    expect(component.name()).toBe("Dummy City Jam");
    expect(component.description()).toBe(
      "A dummy event page for crawler-readable parkour jam info.",
    );
    expect(event.venueString).toBe("Dummy Training Hall");
    expect(event.localityString).toBe("Dummy City, Switzerland");
    expect(metaTagService.setEventMetaTags).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: "Dummy City Jam",
        description: "A dummy event page for crawler-readable parkour jam info.",
      }),
      "/events/dummy-city-jam",
    );
    expect(structuredDataService.addStructuredData).toHaveBeenLastCalledWith(
      "event",
      expect.objectContaining({
        "@type": "Event",
        name: "Dummy City Jam",
        description: "A dummy event page for crawler-readable parkour jam info.",
        location: expect.objectContaining({
          name: "Dummy Training Hall",
          address: expect.objectContaining({
            addressLocality: "Dummy City, Switzerland",
          }),
        }),
        url: "https://pkspot.app/en/events/dummy-city-jam",
      }),
    );
  });

  it("reloads the event when Angular reuses the component for a new route param", async () => {
    const swissjam26 = buildEvent("swissjam26", "Swiss Jam 2026");
    const updatedSwissjam26 = buildEvent(
      "swissjam26",
      "Swiss Jam 2026 Updated",
    );
    const wpfCamp = buildEvent("wpf-camp", "WPF Camp");
    const paramMap = new BehaviorSubject(
      convertToParamMap({ slug: "swissjam26" }),
    );
    const eventStreams = new Map<string, BehaviorSubject<PkEvent | null>>();
    const eventsService = {
      observeEventBySlugOrId: vi.fn((slug: string) => {
        const stream = new BehaviorSubject<PkEvent | null>(
          slug === "wpf-camp" ? wpfCamp : swissjam26,
        );
        eventStreams.set(slug, stream);
        return stream.asObservable();
      }),
    };
    const metaTagService = {
      setEventMetaTags: vi.fn(),
    };
    const structuredDataService = {
      addStructuredData: vi.fn(),
      removeStructuredData: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: eventsService },
        { provide: SeriesService, useValue: seriesServiceStub() },
        { provide: SpotsService, useValue: {} },
        { provide: SpotChallengesService, useValue: {} },
        {
          provide: AuthenticationService,
          useValue: { user: { data: null }, isAdmin: signal(false) },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap,
            queryParams: of({}),
            data: of({ routeName: "Event" }),
            snapshot: { paramMap: convertToParamMap({ slug: "swissjam26" }) },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: LocationStrategy, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        {
          provide: MetaTagService,
          useValue: metaTagService,
        },
        {
          provide: StructuredDataService,
          useValue: structuredDataService,
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
          },
        },
        { provide: ResponsiveService, useValue: {} },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventInfoPageComponent(),
    );

    component.ngOnInit();
    await flushPromises();
    flushSignalEffects();

    expect(component.event()).toBe(swissjam26);
    expect(eventsService.observeEventBySlugOrId).toHaveBeenCalledWith(
      "swissjam26",
    );
    expect(metaTagService.setEventMetaTags).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: "Swiss Jam 2026",
        description: expect.stringContaining("Event in Zurich, Switzerland"),
      }),
      "/events/swissjam26",
    );
    expect(structuredDataService.addStructuredData).toHaveBeenLastCalledWith(
      "event",
      expect.objectContaining({
        "@type": "Event",
        name: "Swiss Jam 2026",
        url: "https://pkspot.app/en/events/swissjam26",
      }),
    );

    eventStreams.get("swissjam26")?.next(updatedSwissjam26);
    await flushPromises();
    flushSignalEffects();

    expect(component.event()).toBe(updatedSwissjam26);
    expect(metaTagService.setEventMetaTags).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: "Swiss Jam 2026 Updated",
      }),
      "/events/swissjam26",
    );
    expect(structuredDataService.addStructuredData).toHaveBeenLastCalledWith(
      "event",
      expect.objectContaining({
        "@type": "Event",
        name: "Swiss Jam 2026 Updated",
        url: "https://pkspot.app/en/events/swissjam26",
      }),
    );

    paramMap.next(convertToParamMap({ slug: "wpf-camp" }));
    await flushPromises();
    flushSignalEffects();

    expect(eventsService.observeEventBySlugOrId).toHaveBeenCalledWith(
      "wpf-camp",
    );
    expect(component.event()).toBe(wpfCamp);
    expect(metaTagService.setEventMetaTags).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: "WPF Camp",
        description: expect.stringContaining("Event in Zurich, Switzerland"),
      }),
      "/events/wpf-camp",
    );
    expect(structuredDataService.addStructuredData).toHaveBeenLastCalledWith(
      "event",
      expect.objectContaining({
        "@type": "Event",
        name: "WPF Camp",
        url: "https://pkspot.app/en/events/wpf-camp",
      }),
    );
  });

  it("localizes upcoming relative time and does not label past events as now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T10:00:00.000Z"));

    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SeriesService, useValue: seriesServiceStub() },
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
            data: of({ routeName: "Event" }),
            snapshot: { paramMap: convertToParamMap({ slug: "swissjam26" }) },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: LocationStrategy, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MetaTagService, useValue: { setEventMetaTags: vi.fn() } },
        {
          provide: StructuredDataService,
          useValue: {
            addStructuredData: vi.fn(),
            removeStructuredData: vi.fn(),
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
          },
        },
        { provide: ResponsiveService, useValue: {} },
        { provide: LOCALE_ID, useValue: "de" },
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventInfoPageComponent(),
    );

    component.event.set(buildEvent("swissjam26", "Swiss Jam 2026"));
    flushSignalEffects();

    expect(component.statusLabel()).toBe("Starts in 3 Wochen");
    expect(component.showRsvp()).toBe(true);

    vi.setSystemTime(new Date("2026-06-20T10:00:00.000Z"));
    component.event.set(
      buildEvent("past-event", "Past Event", {
        start: "2026-06-14T10:00:00.000Z",
        end: "2026-06-15T10:00:00.000Z",
      }),
    );
    flushSignalEffects();

    expect(component.statusLabel()).toBe("Past event");
    expect(component.showRsvp()).toBe(false);

    vi.setSystemTime(new Date("2026-06-14T12:00:00.000Z"));
    component.event.set(buildEvent("live-event", "Live Event"));
    flushSignalEffects();

    expect(component.showRsvp()).toBe(false);
  });

  it("uses Firestore series documents for event series labels and logos", async () => {
    const seriesService = {
      getSeriesByIds: vi.fn(async () => ({
        "parkour-earth": {
          id: "parkour-earth",
          name: "Parkour Earth",
          logo_src: "assets/logos/parkour_earth.jpg",
          logo_background_color: "#ffffff",
        },
      })),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SeriesService, useValue: seriesService },
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
            data: of({ routeName: "Event" }),
            snapshot: { paramMap: convertToParamMap({ slug: "swissjam26" }) },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: LocationStrategy, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MetaTagService, useValue: { setEventMetaTags: vi.fn() } },
        {
          provide: StructuredDataService,
          useValue: {
            addStructuredData: vi.fn(),
            removeStructuredData: vi.fn(),
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
          },
        },
        { provide: ResponsiveService, useValue: {} },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventInfoPageComponent(),
    );

    component.event.set(
      buildEvent("swissjam26", "Swiss Jam 2026", {
        series_ids: ["parkour-earth"],
      }),
    );
    flushSignalEffects();
    await flushPromises();

    expect(component.visibleSeriesTags()).toEqual([
      { seriesId: "parkour-earth" },
    ]);
    expect(seriesService.getSeriesByIds).toHaveBeenCalledWith([
      "parkour-earth",
    ]);
    expect(component.seriesLabel("parkour-earth")).toBe("Parkour Earth");
    expect(component.seriesVisual("parkour-earth")).toEqual({
      logoSrc: "assets/logos/parkour_earth.jpg",
      background: "#ffffff",
    });
  });

  it("loads series documents referenced by qualification event cards", async () => {
    const seriesService = {
      getSeriesByIds: vi.fn(async () => ({
        "parkour-earth": {
          id: "parkour-earth",
          name: "Parkour Earth",
          logo_src: "assets/logos/parkour_earth.jpg",
        },
        "sport-parkour-league": {
          id: "sport-parkour-league",
          name: "Sport Parkour League",
          logo_src: "assets/logos/spl.jpg",
        },
      })),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SeriesService, useValue: seriesService },
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
            data: of({ routeName: "Event" }),
            snapshot: { paramMap: convertToParamMap({ slug: "swissjam26" }) },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: LocationStrategy, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MetaTagService, useValue: { setEventMetaTags: vi.fn() } },
        {
          provide: StructuredDataService,
          useValue: {
            addStructuredData: vi.fn(),
            removeStructuredData: vi.fn(),
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
          },
        },
        { provide: ResponsiveService, useValue: {} },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventInfoPageComponent(),
    );

    component.event.set(
      buildEvent("swissjam26", "Swiss Jam 2026", {
        series_ids: ["parkour-earth"],
      }),
    );
    component.qualifierEventsById.set({
      "spl5-qualifier": buildEvent("spl5-qualifier", "SPL5 Qualifier", {
        series_ids: ["sport-parkour-league"],
      }),
    });
    flushSignalEffects();
    await flushPromises();

    expect(component.visibleSeriesIds()).toEqual([
      "parkour-earth",
      "sport-parkour-league",
    ]);
    expect(seriesService.getSeriesByIds).toHaveBeenLastCalledWith([
      "parkour-earth",
      "sport-parkour-league",
    ]);
    expect(component.seriesVisual("sport-parkour-league")).toEqual({
      logoSrc: "assets/logos/spl.jpg",
      background: "var(--mat-sys-surface-container-high)",
    });
  });

  it("hides plain series tags when role-specific memberships are visible", () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SeriesService, useValue: seriesServiceStub() },
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
            data: of({ routeName: "Event" }),
            snapshot: { paramMap: convertToParamMap({ slug: "swissjam26" }) },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: LocationStrategy, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MetaTagService, useValue: { setEventMetaTags: vi.fn() } },
        {
          provide: StructuredDataService,
          useValue: {
            addStructuredData: vi.fn(),
            removeStructuredData: vi.fn(),
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
          },
        },
        { provide: ResponsiveService, useValue: {} },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventInfoPageComponent(),
    );

    component.event.set(
      buildEvent("swissjam26", "Swiss Jam 2026", {
        series_ids: ["swiss-parkour-tour", "parkour-earth"],
        series_memberships: [
          {
            series_id: "swiss-parkour-tour",
            role: "championship",
          },
          {
            series_id: "parkour-earth",
            role: "qualifier",
          },
        ],
      }),
    );
    flushSignalEffects();

    expect(component.visibleSeriesTags()).toEqual([
      { seriesId: "swiss-parkour-tour", role: "championship" },
      { seriesId: "parkour-earth", role: "qualifier" },
    ]);
  });

  it("collapses qualification event grids to one row and expands them on demand", () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SeriesService, useValue: seriesServiceStub() },
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
            data: of({ routeName: "Event" }),
            snapshot: { paramMap: convertToParamMap({ slug: "swissjam26" }) },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: LocationStrategy, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MetaTagService, useValue: { setEventMetaTags: vi.fn() } },
        {
          provide: StructuredDataService,
          useValue: {
            addStructuredData: vi.fn(),
            removeStructuredData: vi.fn(),
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
          },
        },
        { provide: ResponsiveService, useValue: {} },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventInfoPageComponent(),
    );
    const membership = {
      series_id: "swiss-parkour-tour",
      role: "championship",
      qualification_paths: [
        {
          id: "spt-qualifiers",
          label_i18n: {
            en: {
              text: "Swiss Parkour Tour qualifiers",
              provider: "admin",
            },
          },
          requirement_mode: "any",
          requirements: [
            { kind: "event", event_id: "qualifier-1" },
            { kind: "event", event_id: "qualifier-2" },
            { kind: "event", event_id: "qualifier-3" },
            { kind: "event", event_id: "qualifier-4" },
          ],
        },
      ],
    } as const;
    const path = component.qualificationPathsFor(membership)[0];

    component.qualificationGridColumns.set(3);
    component.qualifierEventsById.set({
      "qualifier-1": buildEvent("qualifier-1", "Qualifier 1"),
      "qualifier-2": buildEvent("qualifier-2", "Qualifier 2"),
      "qualifier-3": buildEvent("qualifier-3", "Qualifier 3"),
      "qualifier-4": buildEvent("qualifier-4", "Qualifier 4"),
    });

    expect(
      component.qualificationPathLabel(path),
    ).toBe("Swiss Parkour Tour qualifiers");
    expect(component.qualificationPathRequirementLabel(path)).toBe(
      "Qualify through one of these events",
    );
    expect(
      component.visibleQualificationPathEvents(membership, path),
    ).toHaveLength(3);
    expect(component.hasHiddenQualificationPathEvents(path)).toBe(true);

    component.toggleQualificationPath(membership, path);

    expect(
      component.visibleQualificationPathEvents(membership, path),
    ).toHaveLength(4);
  });

  it("builds the hero carousel from the banner followed by inline spot images", () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SeriesService, useValue: seriesServiceStub() },
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
            data: of({ routeName: "Event" }),
            snapshot: { paramMap: convertToParamMap({ slug: "swissjam26" }) },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: LocationStrategy, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MetaTagService, useValue: { setEventMetaTags: vi.fn() } },
        {
          provide: StructuredDataService,
          useValue: {
            addStructuredData: vi.fn(),
            removeStructuredData: vi.fn(),
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
          },
        },
        { provide: ResponsiveService, useValue: {} },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventInfoPageComponent(),
    );

    const event = buildEvent("swissjam26", "Swiss Jam 2026", {
      banner_src: "assets/swissjam/swissjam0.jpg",
      inline_spots: [
        {
          id: "main",
          name: "Main",
          location: { lat: 47.38, lng: 8.55 },
          images: [
            "assets/swissjam/swissjam2.jpg",
            "assets/swissjam/swissjam0.jpg",
            "assets/swissjam/swissjam1.jpg",
          ],
        },
      ],
    });
    component.event.set(event);

    expect(
      eventHeroMedia(event).map((media) => media.getPreviewImageSrc()),
    ).toEqual([
      "assets/swissjam/swissjam0.jpg",
      "assets/swissjam/swissjam2.jpg",
      "assets/swissjam/swissjam1.jpg",
    ]);
  });

  it("keeps social tags and structured data images in sync with external media", () => {
    const metaTagService = {
      setEventMetaTags: vi.fn(),
    };
    const structuredDataService = {
      addStructuredData: vi.fn(),
      removeStructuredData: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SeriesService, useValue: seriesServiceStub() },
        { provide: SpotsService, useValue: {} },
        { provide: SpotChallengesService, useValue: {} },
        {
          provide: AuthenticationService,
          useValue: { user: { data: null }, isAdmin: signal(false) },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ slug: "media-event" })),
            queryParams: of({}),
            data: of({ routeName: "Event" }),
            snapshot: { paramMap: convertToParamMap({ slug: "media-event" }) },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: LocationStrategy, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MetaTagService, useValue: metaTagService },
        { provide: StructuredDataService, useValue: structuredDataService },
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
          },
        },
        { provide: ResponsiveService, useValue: {} },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventInfoPageComponent(),
    );

    const event = buildEvent("media-event", "Media Event", {
      url: "https://example.com/media-event",
      banner_src: undefined,
      media: [
        {
          src: "https://cdn.example.com/event-photo.jpg",
          type: "image",
          isInStorage: false,
        },
        {
          src: "https://cdn.example.com/event-video.mp4",
          type: "video",
          isInStorage: false,
        },
      ],
    });
    component.event.set(event);
    flushSignalEffects();

    expect(metaTagService.setEventMetaTags).toHaveBeenLastCalledWith(
      expect.objectContaining({
        image: "https://cdn.example.com/event-photo.jpg",
      }),
      "/events/media-event",
    );
    expect(structuredDataService.addStructuredData).toHaveBeenLastCalledWith(
      "event",
      expect.objectContaining({
        image: ["https://cdn.example.com/event-photo.jpg"],
        sameAs: "https://example.com/media-event",
        offers: undefined,
      }),
    );
    expect(
      eventHeroMedia(event).map((media) => media.getPreviewImageSrc()),
    ).toEqual([
      "https://cdn.example.com/event-photo.jpg",
      "https://cdn.example.com/event-video.mp4",
    ]);
  });

  it("emits ticket options as structured data offers", () => {
    const structuredDataService = {
      addStructuredData: vi.fn(),
      removeStructuredData: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: {} },
        { provide: SeriesService, useValue: seriesServiceStub() },
        { provide: SpotsService, useValue: {} },
        { provide: SpotChallengesService, useValue: {} },
        {
          provide: AuthenticationService,
          useValue: { user: { data: null }, isAdmin: signal(false) },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ slug: "ticket-event" })),
            queryParams: of({}),
            data: of({ routeName: "Event" }),
            snapshot: { paramMap: convertToParamMap({ slug: "ticket-event" }) },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: LocationStrategy, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MetaTagService, useValue: { setEventMetaTags: vi.fn() } },
        { provide: StructuredDataService, useValue: structuredDataService },
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
          },
        },
        { provide: ResponsiveService, useValue: {} },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventInfoPageComponent(),
    );

    component.seriesById.set({
      "swiss-parkour-tour": {
        id: "swiss-parkour-tour",
        name: "Swiss Parkour Tour",
        slug: "swiss-parkour-tour",
        organizer: "Swiss Parkour Association",
        organizer_url: "https://swissparkour.ch",
      },
    });
    component.event.set(
      buildEvent("ticket-event", "Ticket Event", {
        external_source: {
          provider: "eventfrog",
          id: "123",
          url: "https://eventfrog.ch/ticket-event",
        },
        series_ids: ["swiss-parkour-tour"],
        ticket_options: [
          {
            id: "early",
            label: "Early bird",
            url: "https://tickets.example.com/early",
            price: { amount: 35, currency: "CHF" },
            availability: "available",
            sale_ends_at: "2026-06-01T00:00:00.000Z",
          },
          {
            id: "regular",
            label: "Regular",
            url: "https://tickets.example.com/regular",
            price: { amount: 45, currency: "CHF" },
            availability: "coming_soon",
          },
          {
            id: "info",
            label: "Registration info",
            url: "https://tickets.example.com/info",
          },
        ],
        program: {
          active_plan_id: "main",
          plans: [
            {
              id: "main",
              label: "Main program",
              kind: "main",
              items: [
                {
                  id: "speed-qualifier",
                  title: "Speed qualifier",
                  description: "Timed qualifier rounds.",
                  category: "competition",
                  start: "2026-06-14T12:00:00.000Z",
                  end: "2026-06-14T14:00:00.000Z",
                  runtime_override: {
                    start: "2026-06-14T12:30:00.000Z",
                    status: "delayed",
                  },
                },
              ],
            },
          ],
        },
      } as Partial<EventSchema>),
    );
    flushSignalEffects();

    expect(structuredDataService.addStructuredData).toHaveBeenLastCalledWith(
      "event",
      expect.objectContaining({
        offers: [
          expect.objectContaining({
            "@type": "Offer",
            name: "Early bird",
            url: "https://tickets.example.com/early",
            price: 35,
            priceCurrency: "CHF",
            availability: "https://schema.org/InStock",
            priceValidUntil: "2026-06-01T00:00:00.000Z",
          }),
          expect.objectContaining({
            name: "Regular",
            availability: "https://schema.org/PreOrder",
          }),
        ],
        organizer: expect.objectContaining({
          "@type": "Organization",
          name: "Swiss Parkour Association",
          url: "https://swissparkour.ch",
        }),
        sameAs: "https://eventfrog.ch/ticket-event",
        superEvent: expect.objectContaining({
          "@type": "EventSeries",
          name: "Swiss Parkour Tour",
          url: "https://pkspot.app/en/series/swiss-parkour-tour",
          organizer: expect.objectContaining({
            name: "Swiss Parkour Association",
          }),
        }),
        subEvent: [
          expect.objectContaining({
            "@type": "Event",
            name: "Speed qualifier",
            startDate: "2026-06-14T12:30:00.000Z",
            endDate: "2026-06-14T14:00:00.000Z",
            eventStatus: "https://schema.org/EventPostponed",
            superEvent: expect.objectContaining({
              name: "Ticket Event",
              url: "https://pkspot.app/en/events/ticket-event",
            }),
          }),
        ],
      }),
    );
  });
});
