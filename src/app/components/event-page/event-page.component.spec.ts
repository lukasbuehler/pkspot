import { LocationStrategy } from "@angular/common";
import { LOCALE_ID, PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ActivatedRoute, convertToParamMap, Router } from "@angular/router";
import { BehaviorSubject, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { AnalyticsService } from "../../services/analytics.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { SpotChallengesService } from "../../services/firebase/firestore/spot-challenges.service";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { MapsApiService } from "../../services/maps-api.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { ResponsiveService } from "../../services/responsive.service";
import { StructuredDataService } from "../../services/structured-data.service";
import { EventPageComponent } from "./event-page.component";

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const buildEvent = (id: string, name: string): PkEvent =>
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
  } as unknown as EventSchema);

describe("EventPageComponent", () => {
  it("reloads the event when Angular reuses the component for a new route param", async () => {
    const swissjam26 = buildEvent("swissjam26", "Swiss Jam 2026");
    const wpfCamp = buildEvent("wpf-camp", "WPF Camp");
    const paramMap = new BehaviorSubject(
      convertToParamMap({ slug: "swissjam26" }),
    );
    const eventsService = {
      getEventBySlugOrId: vi.fn((slug: string) =>
        Promise.resolve(slug === "wpf-camp" ? wpfCamp : swissjam26),
      ),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: eventsService },
        { provide: SpotsService, useValue: {} },
        { provide: SpotChallengesService, useValue: {} },
        { provide: AuthenticationService, useValue: { user: { data: null } } },
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
          useValue: {
            setEventMetaTags: vi.fn(),
          },
        },
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
      () => new EventPageComponent(),
    );

    component.ngOnInit();
    await flushPromises();

    expect(component.event()).toBe(swissjam26);

    paramMap.next(convertToParamMap({ slug: "wpf-camp" }));
    await flushPromises();

    expect(eventsService.getEventBySlugOrId).toHaveBeenCalledWith("wpf-camp");
    expect(component.event()).toBe(wpfCamp);
  });
});
