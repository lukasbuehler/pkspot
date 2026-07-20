import { LOCALE_ID, PLATFORM_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap, Router } from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import {
  EventCategory,
  EventId,
  EventSchema,
} from "../../../db/schemas/EventSchema";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { SeriesService } from "../../services/firebase/firestore/series.service";
import { EventsPageComponent } from "./events-page.component";

interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_EVENT_INDEX__?: unknown;
}

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const buildEvent = (
  id: string,
  name: string,
  eventCategories: EventCategory[] = [],
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
    event_categories: eventCategories,
    ...extra,
  } as unknown as EventSchema);

describe("EventsPageComponent", () => {
  afterEach(() => {
    delete (globalThis as ScreenshotGlobal).__PKSPOT_SCREENSHOT_EVENT_INDEX__;
  });

  it("loads events during server-side initialization", async () => {
    const event = buildEvent("swissjam26", "Swiss Jam 2026");
    const eventsService = {
      getEvents: vi.fn().mockResolvedValue([event]),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: eventsService },
        {
          provide: SeriesService,
          useValue: { getSeriesByIds: vi.fn().mockResolvedValue({}) },
        },
        {
          provide: AuthenticationService,
          useValue: { user: { data: null }, isAdmin: signal(false) },
        },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventsPageComponent(),
    );

    component.ngOnInit();
    await flushPromises();

    expect(eventsService.getEvents).toHaveBeenCalledWith({ sortByNext: true });
    expect(component.loading()).toBe(false);
    expect(component.events()).toContain(event);
  });

  it("uses deterministic event index data for screenshot rendering", async () => {
    const eventsService = { getEvents: vi.fn() };
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
          event_categories: ["jam"],
          series_ids: ["visual-series"],
        },
      ],
      seriesById: {
        "visual-series": { id: "visual-series", name: "Visual Series" },
      },
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: eventsService },
        { provide: SeriesService, useValue: { getSeriesByIds: vi.fn() } },
        {
          provide: AuthenticationService,
          useValue: { user: { data: null }, isAdmin: signal(false) },
        },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventsPageComponent(),
    );
    component.ngOnInit();
    await flushPromises();

    expect(eventsService.getEvents).not.toHaveBeenCalled();
    expect(component.events().map((event) => event.name)).toEqual([
      "Visual Jam",
    ]);
    expect(component.seriesById()["visual-series"]?.name).toBe(
      "Visual Series",
    );
    expect(component.loading()).toBe(false);
  });

  it("filters events by selected categories", () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: { getEvents: vi.fn() } },
        {
          provide: SeriesService,
          useValue: { getSeriesByIds: vi.fn().mockResolvedValue({}) },
        },
        {
          provide: AuthenticationService,
          useValue: { user: { data: null }, isAdmin: signal(false) },
        },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventsPageComponent(),
    );
    const competition = buildEvent("skill-comp", "Skill Competition", [
      "competition",
    ]);
    const jam = buildEvent("city-jam", "City Jam", ["jam"]);
    const camp = buildEvent("summer-camp", "Summer Camp", ["camp"]);
    const workshop = buildEvent("workshop", "Workshop", ["workshop"]);
    component.events.set([competition, jam, camp, workshop]);

    expect(component.categoryFilterOptions().map((option) => option.id)).toEqual(
      ["competition", "jam", "camp"],
    );

    component.toggleCategoryFilter("competition");
    expect(component.filteredEvents()).toEqual([competition]);

    component.toggleCategoryFilter("jam");
    expect(component.filteredEvents()).toEqual([competition, jam]);

    component.clearCategoryFilters();
    expect(component.filteredEvents()).toEqual([
      competition,
      jam,
      camp,
      workshop,
    ]);
  });

  it("adds series logo metadata to series filter options", () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: { getEvents: vi.fn() } },
        {
          provide: SeriesService,
          useValue: { getSeriesByIds: vi.fn().mockResolvedValue({}) },
        },
        {
          provide: AuthenticationService,
          useValue: { user: { data: null }, isAdmin: signal(false) },
        },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventsPageComponent(),
    );
    component.events.set([
      buildEvent("swissjam26", "Swiss Jam 2026", [], {
        series_ids: ["parkour-earth"],
      }),
    ]);
    component.seriesById.set({
      "parkour-earth": {
        id: "parkour-earth",
        name: "Parkour Earth",
        logo_src: "assets/logos/parkour_earth.jpg",
        logo_background_color: "#ffffff",
      },
    });

    expect(component.seriesFilterOptions()).toEqual([
      {
        id: "parkour-earth",
        count: 1,
        label: "Parkour Earth",
        logoSrc: "assets/logos/parkour_earth.jpg",
        logoBackground: "#ffffff",
      },
    ]);
  });

  it("restores selected filters from URL query params", () => {
    const queryParamMap = new BehaviorSubject(
      convertToParamMap({
        category: "jam,competition,unknown",
        series: "parkour-earth, swissjam",
      }),
    );

    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: { getEvents: vi.fn() } },
        {
          provide: SeriesService,
          useValue: { getSeriesByIds: vi.fn().mockResolvedValue({}) },
        },
        {
          provide: AuthenticationService,
          useValue: { user: { data: null }, isAdmin: signal(false) },
        },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: queryParamMap.asObservable() },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventsPageComponent(),
    );

    expect(component.selectedCategories()).toEqual(["jam", "competition"]);
    expect(component.selectedSeriesIds()).toEqual([
      "parkour-earth",
      "swissjam",
    ]);

    queryParamMap.next(convertToParamMap({ category: "camp" }));

    expect(component.selectedCategories()).toEqual(["camp"]);
    expect(component.selectedSeriesIds()).toEqual([]);
  });

  it("updates URL query params when filters change", () => {
    const route = {
      queryParamMap: new BehaviorSubject(convertToParamMap({})).asObservable(),
    };
    const router = { navigate: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: { getEvents: vi.fn() } },
        {
          provide: SeriesService,
          useValue: { getSeriesByIds: vi.fn().mockResolvedValue({}) },
        },
        {
          provide: AuthenticationService,
          useValue: { user: { data: null }, isAdmin: signal(false) },
        },
        { provide: ActivatedRoute, useValue: route },
        { provide: Router, useValue: router },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new EventsPageComponent(),
    );

    component.toggleCategoryFilter("competition");
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: route,
      queryParams: { category: "competition", series: null },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });

    component.toggleSeriesFilter("parkour-earth");
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: route,
      queryParams: {
        category: "competition",
        series: "parkour-earth",
      },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });

    component.clearCategoryFilters();
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: route,
      queryParams: { category: null, series: "parkour-earth" },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  });
});
