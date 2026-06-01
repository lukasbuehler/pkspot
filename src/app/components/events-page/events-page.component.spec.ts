import { LOCALE_ID, PLATFORM_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
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
});
