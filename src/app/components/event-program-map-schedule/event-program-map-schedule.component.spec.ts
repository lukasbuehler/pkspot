import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { GeoPoint, Timestamp } from "firebase/firestore";
import {
  Event as PkEvent,
  type EventProgramItem,
} from "../../../db/models/Event";
import { LocalSpot } from "../../../db/models/Spot";
import type {
  EventId,
  EventSchema,
} from "../../../db/schemas/EventSchema";
import type { SpotSchema } from "../../../db/schemas/SpotSchema";
import type { MarkerSchema } from "../map/markers/map-marker.model";
import { MarkerComponent } from "../marker/marker.component";
import { AnalyticsService } from "../../services/analytics.service";
import type { EventProgramOccurrence } from "../../shared/event-program-spots";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { StorageService } from "../../services/firebase/storage.service";
import { MapsApiService } from "../../services/maps-api.service";
import { EventProgramMapScheduleComponent } from "./event-program-map-schedule.component";

describe("EventProgramMapScheduleComponent", () => {
  let fixture: ComponentFixture<EventProgramMapScheduleComponent>;

  const breakfast: EventProgramItem = {
    id: "breakfast",
    title: "Breakfast at the Clubhouse",
    category: "social",
    start: new Date("2026-08-07T07:00:00Z"),
    end: new Date("2026-08-07T08:30:00Z"),
  };
  const training: EventProgramItem = {
    id: "training",
    title: "Brunmatt, Basel",
    description: "Training at Brunmatt.",
    category: "jam",
    start: new Date("2026-08-07T10:00:00Z"),
    end: new Date("2026-08-07T12:30:00Z"),
    spot_ref: { kind: "spot", id: "brunmatt" },
    linked_event_id: "skills-competition",
    participation: {
      note: "Participation is included with the camp ticket.",
    },
  };
  const dinner: EventProgramItem = {
    id: "dinner",
    title: "Dinner at the Clubhouse",
    category: "social",
    start: new Date("2026-08-08T17:00:00Z"),
  };
  const spot = new LocalSpot(
    {
      name: { en: { text: "Schulhaus Brunmatt", provider: "user" } },
      location: new GeoPoint(47.3, 8.5),
      location_raw: { lat: 47.3, lng: 8.5 },
      address: null,
      media: [],
      amenities: {},
    } as SpotSchema,
    "en",
  );
  const occurrence: EventProgramOccurrence = {
    key: "training:spot:brunmatt",
    kind: "spot",
    item: training,
    ref: { kind: "spot", id: "brunmatt" },
    spot,
    start: training.start,
    end: training.end,
    status: "scheduled",
    day: "2026-08-07",
    isActive: false,
    isNext: true,
  };
  const campItem: EventProgramItem = {
    id: "arrival",
    title: "Arrival at Campingplatz Waldhort",
    category: "travel",
    start: new Date("2026-08-07T12:00:00Z"),
    end: new Date("2026-08-07T13:00:00Z"),
    spot_ref: { kind: "custom_marker", id: "camp" },
  };
  const campMarker: MarkerSchema = {
    id: "camp",
    name: "Campingplatz Waldhort",
    location: { lat: 47.5, lng: 7.6 },
    icons: ["camping"],
  };
  const campOccurrence: EventProgramOccurrence = {
    key: "arrival:custom_marker:camp",
    kind: "custom_marker",
    item: campItem,
    ref: { kind: "custom_marker", id: "camp" },
    marker: campMarker,
    start: campItem.start,
    end: campItem.end,
    status: "scheduled",
    day: "2026-08-07",
    isActive: false,
    isNext: false,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: DateTimeFormatService,
          useValue: {
            formatter: (options: Intl.DateTimeFormatOptions) =>
              new Intl.DateTimeFormat("en", options),
            format: (
              value: Date,
              options: Intl.DateTimeFormatOptions,
            ) => new Intl.DateTimeFormat("en", options).format(value),
            formatDateRange: () => "Aug 7, 2026",
          },
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

    fixture = TestBed.createComponent(EventProgramMapScheduleComponent);
    fixture.componentRef.setInput("items", [breakfast, training, dinner]);
    fixture.componentRef.setInput("occurrences", [occurrence]);
    fixture.componentRef.setInput("timeZone", "UTC");
    fixture.componentRef.setInput("selectedDay", "2026-08-07");
  });

  it("groups the full program by day, including items without mapped Spots", async () => {
    await fixture.whenStable();

    expect(
      fixture.componentInstance
        .days()
        .map((day) => day.entries.map((entry) => entry.item.id)),
    ).toEqual([
      ["breakfast", "training"],
      ["dinner"],
    ]);
    expect(fixture.nativeElement.textContent).toContain(
      "Breakfast at the Clubhouse",
    );
    expect(fixture.nativeElement.textContent).toContain("Brunmatt, Basel");
    expect(fixture.nativeElement.textContent).toContain("Schulhaus Brunmatt");
    expect(fixture.nativeElement.textContent).toContain(
      "Participation is included with the camp ticket.",
    );
    expect(
      fixture.nativeElement.querySelector("app-spot-preview-card"),
    ).toBeTruthy();
    expect(fixture.nativeElement.querySelector(".program-spot")).toBeNull();
    expect(
      fixture.nativeElement
        .querySelector(".program-linked-event-fallback")
        .getAttribute("href"),
    ).toContain("/events/skills-competition");
  });

  it("emits day panel and mapped Spot selections", async () => {
    const opened = vi.fn();
    const closed = vi.fn();
    const selected = vi.fn();
    const occurrenceSelected = vi.fn();
    fixture.componentInstance.dayOpened.subscribe(opened);
    fixture.componentInstance.dayClosed.subscribe(closed);
    fixture.componentInstance.spotSelected.subscribe(selected);
    fixture.componentInstance.occurrenceSelected.subscribe(occurrenceSelected);
    await fixture.whenStable();

    const headers = fixture.nativeElement.querySelectorAll(
      "mat-expansion-panel-header",
    ) as NodeListOf<HTMLElement>;
    headers[1].click();
    await fixture.whenStable();

    expect(opened).toHaveBeenCalledWith("2026-08-08");
    expect(closed).toHaveBeenCalledWith("2026-08-07");

    (
      fixture.nativeElement.querySelector(
        ".program-spot-button",
      ) as HTMLButtonElement
    ).click();
    expect(selected).toHaveBeenCalledWith(occurrence);
    expect(occurrenceSelected).not.toHaveBeenCalled();
  });

  it("uses the same compact linked-event preview as the info timeline", async () => {
    const linkedEvent = new PkEvent("skills-competition" as EventId, {
      name: "WPF Skills Competition",
      slug: "skills-competition",
      venue_string: "Theaterplatz",
      locality_string: "Basel, Switzerland",
      start: Timestamp.fromDate(new Date("2026-08-07T09:00:00Z")),
      end: Timestamp.fromDate(new Date("2026-08-07T20:00:00Z")),
    } as EventSchema);
    fixture.componentRef.setInput("linkedEventsById", {
      [linkedEvent.id]: linkedEvent,
    });

    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector(
        "app-event-card.program-linked-event",
      ),
    ).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain(
      "WPF Skills Competition",
    );
    expect(
      fixture.nativeElement.querySelector(
        ".program-linked-event-fallback",
      ),
    ).toBeNull();
  });

  it("resolves, renders, and selects custom event markers from item references", async () => {
    const selected = vi.fn();
    fixture.componentRef.setInput("items", [campItem]);
    fixture.componentRef.setInput("occurrences", []);
    fixture.componentRef.setInput("customMarkers", [campMarker]);
    fixture.componentRef.setInput(
      "now",
      new Date("2026-08-07T12:30:00Z"),
    );
    fixture.componentInstance.occurrenceSelected.subscribe(selected);

    await fixture.whenStable();

    const markerButton = fixture.nativeElement.querySelector(
      ".program-marker-button",
    ) as HTMLButtonElement;
    expect(markerButton.textContent).toContain("Campingplatz Waldhort");
    expect(
      fixture.debugElement.query(By.directive(MarkerComponent))
        .componentInstance.color(),
    ).toBe("secondary");

    markerButton.click();
    expect(selected).toHaveBeenCalledWith(
      expect.objectContaining({
        key: campOccurrence.key,
        kind: "custom_marker",
        marker: campMarker,
      }),
    );
  });
});
