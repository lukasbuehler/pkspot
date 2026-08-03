import { LOCALE_ID, PLATFORM_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { ActivatedRoute, convertToParamMap, Router } from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { AnalyticsService } from "../../services/analytics.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { SeriesService } from "../../services/firebase/firestore/series.service";
import {
  EventDiscoverySearchResult,
  EventSearchPreview,
  SearchService,
} from "../../services/search.service";
import { EventDiscoveryIssuesDialogComponent } from "./event-discovery-issues-dialog.component";
import { EventsPageComponent } from "./events-page.component";
import { MyEventContextService } from "../../services/my-event-context.service";
import { EventNotificationMigrationService } from "../../services/event-notification-migration.service";
import { NotificationPreferencesService } from "../../services/notification-preferences.service";

interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_EVENT_INDEX__?: unknown;
}

const EMPTY_RESULT: EventDiscoverySearchResult = {
  items: [],
  found: 0,
  page: 1,
  facets: { categories: [], series: [], communities: [] },
  invalidItems: [],
  invalidItemCount: 0,
};

const INVALID_EVENT_PREVIEW: EventSearchPreview = {
  id: "missing-zone",
  slug: "missing-zone",
  name: "Event without a time zone",
  venueString: "Test Hall",
  localityString: "Zurich, Switzerland",
  isSponsored: false,
  hasOrganization: false,
  hasVenueSpot: false,
  venueSpotCount: 0,
  startSeconds: Date.parse("2026-08-14T10:00:00.000Z") / 1000,
  endSeconds: Date.parse("2026-08-14T18:00:00.000Z") / 1000,
  lifecycleStatus: "planned",
  eventLinks: [],
  ticketOptions: [],
  spotIds: [],
  communityKeys: ["country:ch"],
  seriesIds: [],
  eventCategories: ["jam"],
  rsvpCounts: { going: 2, interested: 1, notgoing: 0, total: 3 },
  seriesRoles: [],
  qualifiesToKeys: [],
  requiredQualifierKeys: [],
};

const flushResources = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
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
    start: "2026-08-14T10:00:00.000Z",
    end: "2026-08-15T10:00:00.000Z",
    time_zone: "Europe/Zurich",
    published: false,
    bounds: {
      north: 47.4,
      south: 47.3,
      east: 8.6,
      west: 8.5,
    },
    ...extra,
  } as unknown as EventSchema);

const buildAuthService = (
  user: { uid: string; data: null } | null = null,
  admin = false,
) => ({
  user: user ?? { data: null },
  authState$: new BehaviorSubject(user),
  isAdmin: signal(admin),
});

interface TestContext {
  component: EventsPageComponent;
  queryParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  router: { navigate: ReturnType<typeof vi.fn> };
  dialog: { open: ReturnType<typeof vi.fn> };
  searchService: {
    searchEventDiscovery: ReturnType<typeof vi.fn>;
    searchAllEventDiscovery: ReturnType<typeof vi.fn>;
    searchInvalidEventDiscovery: ReturnType<typeof vi.fn>;
  };
  eventsService: { getEvents: ReturnType<typeof vi.fn> };
  notificationMigration: { maybePrompt: ReturnType<typeof vi.fn> };
}

function createComponent(options?: {
  queryParams?: Record<string, string>;
  admin?: boolean;
  signedIn?: boolean;
  drafts?: PkEvent[];
  searchResult?: EventDiscoverySearchResult;
  invalidEvents?: EventSearchPreview[];
  goingEvents?: PkEvent[];
  savedEvents?: PkEvent[];
  personalEventsLoading?: boolean;
  platform?: "browser" | "server";
}): TestContext {
  const queryParams = new BehaviorSubject(
    convertToParamMap(options?.queryParams ?? {}),
  );
  const router = { navigate: vi.fn().mockResolvedValue(true) };
  const dialog = { open: vi.fn() };
  const searchService = {
    searchEventDiscovery: vi.fn().mockResolvedValue(
      options?.searchResult ?? EMPTY_RESULT,
    ),
    searchAllEventDiscovery: vi.fn().mockResolvedValue(
      options?.searchResult ?? EMPTY_RESULT,
    ),
    searchInvalidEventDiscovery: vi
      .fn()
      .mockResolvedValue(options?.invalidEvents ?? []),
  };
  const eventsService = {
    getEvents: vi.fn().mockResolvedValue(options?.drafts ?? []),
  };
  const notificationMigration = { maybePrompt: vi.fn().mockResolvedValue(undefined) };

  TestBed.configureTestingModule({
    providers: [
      { provide: SearchService, useValue: searchService },
      { provide: EventsService, useValue: eventsService },
      {
        provide: SeriesService,
        useValue: { getSeriesByIds: vi.fn().mockResolvedValue({}) },
      },
      {
        provide: AuthenticationService,
        useValue: buildAuthService(
          options?.signedIn ? { uid: "signed-in", data: null } : null,
          options?.admin,
        ),
      },
      {
        provide: AnalyticsService,
        useValue: { trackEvent: vi.fn() },
      },
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap: queryParams.asObservable() },
      },
      { provide: Router, useValue: router },
      { provide: MatDialog, useValue: dialog },
      { provide: LOCALE_ID, useValue: "en-CH" },
      { provide: PLATFORM_ID, useValue: options?.platform ?? "browser" },
      {
        provide: MyEventContextService,
        useValue: {
          liveEvents: signal<PkEvent[]>([]),
          goingEvents: signal<PkEvent[]>(options?.goingEvents ?? []),
          savedEvents: signal<PkEvent[]>(options?.savedEvents ?? []),
          isLoading: signal(options?.personalEventsLoading ?? false),
          now: signal(new Date("2026-08-14T12:00:00.000Z")),
        },
      },
      {
        provide: EventNotificationMigrationService,
        useValue: notificationMigration,
      },
      {
        provide: NotificationPreferencesService,
        useValue: {
          loading: signal(false),
          preferences: signal({ event_reminders: false }),
          hasHandledPrompt: vi.fn(() => false),
        },
      },
    ],
  });

  return {
    component: TestBed.runInInjectionContext(() => new EventsPageComponent()),
    queryParams,
    router,
    dialog,
    searchService,
    eventsService,
    notificationMigration,
  };
}

describe("EventsPageComponent", () => {
  afterEach(() => {
    delete (globalThis as ScreenshotGlobal).__PKSPOT_SCREENSHOT_EVENT_INDEX__;
    globalThis.localStorage?.removeItem("eventsDiscoveryView");
  });

  it("offers the event notification migration for future personal events", () => {
    const event = buildEvent("future-event", "Future Event", {
      published: true,
      end: "2026-08-15T10:00:00.000Z",
    });
    const { notificationMigration } = createComponent({
      signedIn: true,
      goingEvents: [event],
    });

    (TestBed as unknown as { flushEffects?: () => void }).flushEffects?.();

    expect(notificationMigration.maybePrompt).toHaveBeenCalledWith(1);
  });

  it("does not offer the migration for signed-out users", () => {
    const event = buildEvent("future-event", "Future Event", {
      published: true,
      end: "2026-08-15T10:00:00.000Z",
    });
    const { notificationMigration } = createComponent({ goingEvents: [event] });

    (TestBed as unknown as { flushEffects?: () => void }).flushEffects?.();

    expect(notificationMigration.maybePrompt).not.toHaveBeenCalled();
  });

  it("defaults to the list until the user explicitly chooses a view", () => {
    const { component } = createComponent();

    component.containerWidth.set(1200);
    expect(component.view()).toBe("list");

    component.containerWidth.set(700);
    expect(component.view()).toBe("list");

    component.onViewChange("calendar");
    expect(component.view()).toBe("calendar");
    expect(globalThis.localStorage?.getItem("eventsDiscoveryView")).toBe(
      "calendar",
    );
  });

  it("keeps calendar links without an explicit view backward compatible", () => {
    const { component } = createComponent({
      queryParams: {
        month: "2026-08",
        day: "2026-08-14",
      },
    });

    expect(component.view()).toBe("calendar");
    expect(component.month()).toBe("2026-08");
    expect(component.selectedDay()).toBe("2026-08-14");
  });

  it("lets URL state override the remembered view and restores filters", () => {
    globalThis.localStorage?.setItem("eventsDiscoveryView", "list");
    const { component, queryParams } = createComponent({
      queryParams: {
        view: "calendar",
        month: "2028-02",
        day: "2028-02-29",
        q: "Swiss Jam",
        area: "country:ch",
        category: "jam,competition,unknown",
        series: "parkour-earth,swissjam",
        when: "past",
      },
    });

    expect(component.view()).toBe("calendar");
    expect(component.month()).toBe("2028-02");
    expect(component.selectedDay()).toBe("2028-02-29");
    expect(component.query()).toBe("Swiss Jam");
    expect(component.areaKey()).toBe("country:ch");
    expect(component.selectedCategories()).toEqual(["jam", "competition"]);
    expect(component.selectedSeriesIds()).toEqual([
      "parkour-earth",
      "swissjam",
    ]);
    expect(component.period()).toBe("past");

    queryParams.next(convertToParamMap({ view: "list", when: "upcoming" }));
    expect(component.view()).toBe("list");
    expect(component.query()).toBe("");
    expect(component.selectedCategories()).toEqual([]);
  });

  it("uses Typesense for public results and never requests public Firestore events", async () => {
    const { component, searchService, eventsService } = createComponent({
      queryParams: { view: "list", area: "region:zh", category: "jam" },
    });
    await flushResources();

    expect(searchService.searchEventDiscovery).toHaveBeenCalledWith(
      expect.objectContaining({
        areaKeys: ["region:zh"],
        categories: ["jam"],
        sort: "upcoming",
        page: 1,
        perPage: 24,
      }),
    );
    expect(searchService.searchAllEventDiscovery).not.toHaveBeenCalled();
    expect(eventsService.getEvents).not.toHaveBeenCalled();
    expect(component.events()).toEqual([]);
  });

  it("queries the buffered month through Typesense for calendar view", async () => {
    const { component, searchService } = createComponent({
      queryParams: { view: "calendar", month: "2026-08" },
    });
    await flushResources();

    const request = searchService.searchAllEventDiscovery.mock.calls[0]?.[0];
    expect(request).toEqual(
      expect.objectContaining({
        sort: "calendar",
        startsBeforeSeconds: expect.any(Number),
        endsAfterSeconds: expect.any(Number),
      }),
    );
    expect(request.startsBeforeSeconds).toBeGreaterThan(
      request.endsAfterSeconds,
    );
    expect(component.calendar().monthKey).toBe("2026-08");
  });

  it("updates filter counts from the continuous calendar result", async () => {
    const { component } = createComponent({
      queryParams: { view: "calendar", month: "2026-08" },
      searchResult: {
        ...EMPTY_RESULT,
        facets: {
          categories: [{ value: "jam", count: 1 }],
          series: [{ value: "parkour-earth", count: 1 }],
          communities: [],
        },
      },
    });
    await flushResources();

    component.onContinuousCalendarResult({
      ...EMPTY_RESULT,
      facets: {
        categories: [{ value: "competition", count: 4 }],
        series: [{ value: "parkour-earth", count: 3 }],
        communities: [],
      },
    });

    expect(component.categoryFilterOptions()).toEqual([
      expect.objectContaining({ id: "competition", count: 4 }),
    ]);
    expect(component.seriesFilterOptions()).toEqual([
      expect.objectContaining({ id: "parkour-earth", count: 3 }),
    ]);
  });

  it("keeps authorized drafts in a separate Firestore request", async () => {
    const draft = buildEvent("draft-jam", "Draft Jam");
    const { component, eventsService } = createComponent({
      admin: true,
      signedIn: true,
      drafts: [draft],
    });
    await flushResources();

    expect(eventsService.getEvents).toHaveBeenCalledWith({
      includeUnpublished: true,
      sortByNext: true,
    });
    expect(component.drafts()).toEqual([draft]);
    expect(component.createActions().map((action) => action.id)).toEqual([
      "event",
    ]);
  });

  it("does not offer event or session creation to non-admin users", async () => {
    const { component } = createComponent({ signedIn: true });
    await flushResources();

    expect(component.createActions()).toEqual([]);
  });

  it("opens invalid event previews for admins only", async () => {
    const secondInvalidEvent: EventSearchPreview = {
      ...INVALID_EVENT_PREVIEW,
      id: "missing-end",
      slug: "missing-end",
      name: "Event without an end time",
      endSeconds: undefined,
    };
    const admin = createComponent({
      admin: true,
      signedIn: true,
      queryParams: {
        view: "calendar",
        month: "2026-08",
        area: "region:zh",
        category: "jam",
      },
      invalidEvents: [INVALID_EVENT_PREVIEW, secondInvalidEvent],
    });
    await flushResources();

    expect(admin.searchService.searchInvalidEventDiscovery).toHaveBeenCalledWith(
      { abortSignal: expect.any(AbortSignal) },
    );
    admin.component.openInvalidEventsDialog();

    expect(admin.dialog.open).toHaveBeenCalledWith(
      EventDiscoveryIssuesDialogComponent,
      expect.objectContaining({
        data: {
          events: [INVALID_EVENT_PREVIEW, secondInvalidEvent],
          seriesById: {},
        },
        maxHeight: "90vh",
      }),
    );

    TestBed.resetTestingModule();
    const visitor = createComponent({
      invalidEvents: [INVALID_EVENT_PREVIEW, secondInvalidEvent],
    });
    await flushResources();

    visitor.component.openInvalidEventsDialog();

    expect(
      visitor.searchService.searchInvalidEventDiscovery,
    ).not.toHaveBeenCalled();
    expect(visitor.dialog.open).not.toHaveBeenCalled();
  });

  it("uses deterministic Typesense-shaped data for screenshots", async () => {
    (globalThis as ScreenshotGlobal).__PKSPOT_SCREENSHOT_EVENT_INDEX__ = {
      events: [
        {
          id: "visual-jam",
          name: "Visual Jam",
          slug: "visual-jam",
          venue_string: "Fixture Hall",
          locality_string: "Zurich, Switzerland",
          location_raw: { lat: 47.3769, lng: 8.5417 },
          start: "2026-08-01T10:00:00.000Z",
          end: "2026-08-02T18:00:00.000Z",
          time_zone: "Europe/Zurich",
          event_categories: ["jam"],
          series_ids: ["visual-series"],
        },
      ],
      seriesById: {
        "visual-series": { id: "visual-series", name: "Visual Series" },
      },
    };
    const { component, searchService, eventsService } = createComponent({
      queryParams: { view: "calendar", month: "2026-08" },
    });
    await flushResources();

    expect(component.events().map((event) => event.name)).toEqual([
      "Visual Jam",
    ]);
    expect(component.events()[0]?.timeZone).toBe("Europe/Zurich");
    expect(component.seriesById()["visual-series"]?.name).toBe(
      "Visual Series",
    );
    expect(searchService.searchAllEventDiscovery).not.toHaveBeenCalled();
    expect(eventsService.getEvents).not.toHaveBeenCalled();
  });

  it("updates shareable query parameters for navigation and filters", () => {
    const { component, router } = createComponent();

    component.toggleCategory("competition");
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { category: "competition" },
      queryParamsHandling: "merge",
      replaceUrl: false,
    });

    component.changeMonth(1);
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: {
        month: expect.stringMatching(/^\d{4}-\d{2}$/u),
        day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
      },
      queryParamsHandling: "merge",
      replaceUrl: false,
    });

    component.selectDay("2026-08-14");
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { day: "2026-08-14" },
      queryParamsHandling: "merge",
      replaceUrl: false,
    });

    component.onPeriodChange("upcoming");
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { when: "upcoming" },
      queryParamsHandling: "merge",
      replaceUrl: false,
    });

    component.onViewChange("calendar");
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: {
        view: "calendar",
        month: component.month(),
        day: component.selectedDay(),
      },
      queryParamsHandling: "merge",
      replaceUrl: false,
    });
  });

  it("adds calendar and list defaults to the URL without creating history entries", () => {
    const calendar = createComponent({
      queryParams: { view: "calendar" },
    });

    calendar.component.onContainerResize({ width: 1200 } as DOMRectReadOnly);

    expect(calendar.router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: {
        month: calendar.component.month(),
        day: calendar.component.selectedDay(),
      },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });

    TestBed.resetTestingModule();
    const list = createComponent();
    list.component.onContainerResize({ width: 700 } as DOMRectReadOnly);

    expect(list.router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { when: "upcoming" },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  });

  it("restores an earlier calendar month and day from browser history", () => {
    const { component, queryParams } = createComponent({
      queryParams: {
        view: "calendar",
        month: "2026-08",
        day: "2026-08-14",
        category: "jam",
      },
    });

    queryParams.next(
      convertToParamMap({
        view: "calendar",
        month: "2026-07",
        day: "2026-07-05",
      }),
    );

    expect(component.month()).toBe("2026-07");
    expect(component.selectedDay()).toBe("2026-07-05");
    expect(component.selectedCategories()).toEqual([]);
  });

  it("keeps the current calendar visible while filters refresh", async () => {
    const initialResult = { ...EMPTY_RESULT, found: 1 };
    const refreshedResult = { ...EMPTY_RESULT, found: 2 };
    const { component, queryParams, searchService } = createComponent({
      queryParams: {
        view: "calendar",
        month: "2026-08",
        day: "2026-08-14",
        category: "jam",
      },
      searchResult: initialResult,
    });
    await flushResources();

    let resolveRefresh!: (result: EventDiscoverySearchResult) => void;
    searchService.searchAllEventDiscovery.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    queryParams.next(
      convertToParamMap({
        view: "calendar",
        month: "2026-08",
        day: "2026-08-14",
        category: "competition",
      }),
    );
    await flushResources();

    expect(component.discoveryResource.isLoading()).toBe(true);
    expect(component.discoveryResult()).toBe(initialResult);

    resolveRefresh(refreshedResult);
    await flushResources();

    expect(component.discoveryResource.isLoading()).toBe(false);
    expect(component.discoveryResult()).toBe(refreshedResult);
  });

  it("does not reload calendar results when only the selected day changes", async () => {
    const { component, queryParams, searchService } = createComponent({
      queryParams: {
        view: "calendar",
        month: "2026-08",
        day: "2026-08-14",
        category: "jam",
        series: "swissjam",
      },
    });
    await flushResources();
    searchService.searchAllEventDiscovery.mockClear();

    queryParams.next(
      convertToParamMap({
        view: "calendar",
        month: "2026-08",
        day: "2026-08-15",
        category: "jam",
        series: "swissjam",
      }),
    );
    await flushResources();

    expect(component.selectedDay()).toBe("2026-08-15");
    expect(searchService.searchAllEventDiscovery).not.toHaveBeenCalled();
  });
});
