import { LOCALE_ID, PLATFORM_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
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
  SearchService,
} from "../../services/search.service";
import { EventsPageComponent } from "./events-page.component";

interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_EVENT_INDEX__?: unknown;
}

const EMPTY_RESULT: EventDiscoverySearchResult = {
  items: [],
  found: 0,
  page: 1,
  facets: { categories: [], series: [], communities: [] },
  invalidItemCount: 0,
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
  searchService: {
    searchEventDiscovery: ReturnType<typeof vi.fn>;
    searchAllEventDiscovery: ReturnType<typeof vi.fn>;
  };
  eventsService: { getEvents: ReturnType<typeof vi.fn> };
}

function createComponent(options?: {
  queryParams?: Record<string, string>;
  admin?: boolean;
  signedIn?: boolean;
  drafts?: PkEvent[];
  platform?: "browser" | "server";
}): TestContext {
  const queryParams = new BehaviorSubject(
    convertToParamMap(options?.queryParams ?? {}),
  );
  const router = { navigate: vi.fn().mockResolvedValue(true) };
  const searchService = {
    searchEventDiscovery: vi.fn().mockResolvedValue(EMPTY_RESULT),
    searchAllEventDiscovery: vi.fn().mockResolvedValue(EMPTY_RESULT),
  };
  const eventsService = {
    getEvents: vi.fn().mockResolvedValue(options?.drafts ?? []),
  };

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
      { provide: LOCALE_ID, useValue: "en-CH" },
      { provide: PLATFORM_ID, useValue: options?.platform ?? "browser" },
    ],
  });

  return {
    component: TestBed.runInInjectionContext(() => new EventsPageComponent()),
    queryParams,
    router,
    searchService,
    eventsService,
  };
}

describe("EventsPageComponent", () => {
  afterEach(() => {
    delete (globalThis as ScreenshotGlobal).__PKSPOT_SCREENSHOT_EVENT_INDEX__;
    globalThis.localStorage?.removeItem("eventsDiscoveryView");
  });

  it("uses adaptive defaults until the user explicitly chooses a view", () => {
    const { component } = createComponent();

    component.containerWidth.set(1200);
    expect(component.view()).toBe("calendar");

    component.containerWidth.set(700);
    expect(component.view()).toBe("list");

    component.onViewChange("calendar");
    expect(component.view()).toBe("calendar");
    expect(globalThis.localStorage?.getItem("eventsDiscoveryView")).toBe(
      "calendar",
    );
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
      "session",
    ]);
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
      replaceUrl: true,
    });

    component.changeMonth(1);
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: {
        month: expect.stringMatching(/^\d{4}-\d{2}$/u),
        day: null,
      },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });

    component.selectDay("2026-08-14");
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { day: "2026-08-14" },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  });
});
