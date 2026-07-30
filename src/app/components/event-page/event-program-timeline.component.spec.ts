import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { AccountPreferencesService } from "../../services/account-preferences.service";
import type { WeatherResponse } from "../../weather/weather.models";
import { EventProgramTimelineComponent } from "./event-program-timeline.component";
import { provideRouter } from "@angular/router";
import { GeoPoint, Timestamp } from "firebase/firestore";
import { LocalSpot } from "../../../db/models/Spot";
import { Event as PkEvent } from "../../../db/models/Event";
import type {
  EventId,
  EventSchema,
} from "../../../db/schemas/EventSchema";
import type { SpotSchema } from "../../../db/schemas/SpotSchema";
import { StorageService } from "../../services/firebase/storage.service";
import { MapsApiService } from "../../services/maps-api.service";
import { AnalyticsService } from "../../services/analytics.service";
import { MarkerComponent } from "../marker/marker.component";

describe("EventProgramTimelineComponent", () => {
  let fixture: ComponentFixture<EventProgramTimelineComponent>;
  const response: WeatherResponse = {
    provider: "google",
    mode: "event-forecast",
    location: { lat: 47.37, lng: 8.54 },
    generatedAt: "2026-07-22T06:00:00Z",
    expiresAt: "2026-07-22T06:45:00Z",
    forecast: [
      {
        time: "2026-07-23T08:00:00Z",
        condition: "rain",
        temperatureC: 18,
        precipitationProbabilityPercent: 80,
        isDay: true,
      },
    ],
    dailyForecast: [
      {
        date: "2026-07-23",
        condition: "rain",
        maxTemperatureC: 20,
        minTemperatureC: 14,
      },
    ],
    insights: {
      summary: "Rain likely",
      precipitationRisk: "high",
      sunExposure: "low",
      surfaceDrying: {
        status: "wet",
        confidence: "medium",
        factors: [],
      },
    },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AccountPreferencesService,
          useValue: { temperatureUnit: signal("celsius") },
        },
        { provide: StorageService, useValue: {} },
        {
          provide: MapsApiService,
          useValue: {
            isStreetViewPreviewEnabled: vi.fn(() => false),
            isStreetViewPreviewAllowedAtZoom: vi.fn(() => false),
          },
        },
        {
          provide: AnalyticsService,
          useValue: { trackEvent: vi.fn() },
        },
      ],
    });
    fixture = TestBed.createComponent(EventProgramTimelineComponent);
    fixture.componentRef.setInput("items", [
      {
        id: "training",
        title: "Training",
        category: "workshop",
        start: new Date("2026-07-23T08:30:00Z"),
        end: new Date("2026-07-23T10:00:00Z"),
      },
      {
        id: "later",
        title: "Later",
        category: "social",
        start: new Date("2026-07-24T08:30:00Z"),
      },
    ]);
    fixture.componentRef.setInput("timeZone", "UTC");
    fixture.componentRef.setInput("eventMapRoute", [
      "/events",
      "city-jam",
      "map",
    ]);
    fixture.componentRef.setInput("eventStart", new Date("2026-07-23T08:00:00Z"));
    fixture.componentRef.setInput("eventEnd", new Date("2026-07-24T18:00:00Z"));
    fixture.componentRef.setInput("weather", response);
  });

  it("shows tab, day, and itinerary weather only where forecasts exist", async () => {
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelectorAll(".day-tab-weather")).toHaveLength(1);
    expect(
      fixture.nativeElement.querySelectorAll("app-weather-icon-button"),
    ).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain("20° / 14°");
    expect(fixture.nativeElement.textContent).toContain("18°");
  });

  it("renders the schedule before optional weather bounds are available", async () => {
    fixture.componentRef.setInput("eventStart", undefined);
    fixture.componentRef.setInput("eventEnd", undefined);
    fixture.componentRef.setInput("weather", undefined);

    await fixture.whenStable();

    expect(fixture.nativeElement.querySelectorAll("[role='tab']")).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain("Training");
  });

  it("emits the day and exact itinerary start selections", async () => {
    const selected = vi.fn();
    fixture.componentInstance.weatherSelected.subscribe(selected);
    await fixture.whenStable();

    const controls = fixture.nativeElement.querySelectorAll(
      "app-weather-icon-button button",
    ) as NodeListOf<HTMLButtonElement>;
    controls[0].click();
    controls[1].click();

    expect(selected).toHaveBeenNthCalledWith(1, { date: "2026-07-23" });
    expect(selected).toHaveBeenNthCalledWith(2, {
      date: "2026-07-23",
      time: new Date("2026-07-23T08:30:00Z"),
    });
  });

  it("renders linked compact Spot cards with focused map links", async () => {
    const spot = new LocalSpot(
      {
        name: { en: { text: "Main stage", provider: "user" } },
        location: new GeoPoint(47.3, 8.5),
        location_raw: { lat: 47.3, lng: 8.5 },
        address: null,
        media: [],
        amenities: {},
      } as SpotSchema,
      "en",
    );
    fixture.componentRef.setInput("items", [
      {
        id: "training",
        title: "Training",
        category: "workshop",
        start: new Date("2026-07-23T08:30:00Z"),
        spot_ref: { kind: "inline_spot", id: "main-stage" },
      },
    ]);
    fixture.componentRef.setInput("spotBindings", [
      {
        ref: { kind: "inline_spot", id: "main-stage" },
        spot,
      },
    ]);

    await fixture.whenStable();

    const link = fixture.nativeElement.querySelector(
      ".program-spot-link",
    ) as HTMLAnchorElement;
    expect(fixture.nativeElement.textContent).toContain("Main stage");
    expect(link.getAttribute("href")).toContain(
      "map?mapFilter=program&day=2026-07-23&spotId=main-stage&programItemId=training",
    );
  });

  it("renders custom event markers with focused map links", async () => {
    fixture.componentRef.setInput("items", [
      {
        id: "arrival",
        title: "Arrival",
        category: "travel",
        start: new Date("2026-07-23T08:30:00Z"),
        spot_ref: { kind: "custom_marker", id: "camp" },
      },
    ]);
    fixture.componentRef.setInput("customMarkers", [
      {
        id: "camp",
        name: "Campingplatz Waldhort",
        location: { lat: 47.5, lng: 7.6 },
        icons: ["camping"],
        color: "secondary",
      },
    ]);

    await fixture.whenStable();

    const link = fixture.nativeElement.querySelector(
      ".program-marker-link",
    ) as HTMLAnchorElement;
    expect(fixture.nativeElement.textContent).toContain(
      "Campingplatz Waldhort",
    );
    expect(link.getAttribute("href")).toContain(
      "map?mapFilter=program&day=2026-07-23&markerId=camp&programItemId=arrival",
    );
    expect(
      fixture.debugElement.query(By.directive(MarkerComponent))
        .componentInstance.color(),
    ).toBe("secondary");
  });

  it("renders linked events as compact event previews", async () => {
    const linkedEvent = new PkEvent("skills-open" as EventId, {
      name: "WPF Skills Competition",
      slug: "skills-open",
      venue_string: "Theaterplatz",
      locality_string: "Basel, Switzerland",
      start: Timestamp.fromDate(new Date("2026-07-23T10:00:00Z")),
      end: Timestamp.fromDate(new Date("2026-07-23T20:00:00Z")),
    } as EventSchema);
    fixture.componentRef.setInput("items", [
      {
        id: "competition",
        title: "Skills competition",
        category: "competition",
        start: new Date("2026-07-23T10:00:00Z"),
        linked_event_id: linkedEvent.id,
      },
    ]);
    fixture.componentRef.setInput("linkedEventsById", {
      [linkedEvent.id]: linkedEvent,
    });

    await fixture.whenStable();

    const preview = fixture.nativeElement.querySelector(
      "app-event-card.program-linked-event",
    ) as HTMLElement;
    expect(preview).toBeTruthy();
    expect(preview.classList.contains("compact")).toBe(true);
    expect(preview.textContent).toContain("WPF Skills Competition");
    expect(
      fixture.nativeElement.querySelector(".program-linked-event-fallback"),
    ).toBeNull();
  });
});
