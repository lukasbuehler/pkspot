import { TestBed } from "@angular/core/testing";
import type { EventProgramMarkerOccurrence } from "../../shared/event-program-spots";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { EventProgramOccurrenceListComponent } from "./event-program-occurrence-list.component";

describe("EventProgramOccurrenceListComponent", () => {
  it("renders and selects program times for custom event markers", async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DateTimeFormatService,
          useValue: {
            format: vi.fn(
              (value: Date, options: Intl.DateTimeFormatOptions) =>
                options.weekday
                  ? value.getUTCDate() === 5
                    ? "Wed, Aug 5"
                    : "Thu, Aug 6"
                  : "16:00",
            ),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(
      EventProgramOccurrenceListComponent,
    );
    const occurrence = {
      key: "dinner:custom_marker:camp",
      kind: "custom_marker",
      ref: { kind: "custom_marker", id: "camp" },
      marker: {
        id: "camp",
        name: "Campingplatz Waldhort",
        location: { lat: 47.49, lng: 7.6 },
      },
      item: {
        id: "dinner",
        title: "Dinner at the Clubhouse",
        category: "social",
        start: new Date("2026-08-05T16:00:00.000Z"),
      },
      start: new Date("2026-08-05T16:00:00.000Z"),
      status: "scheduled",
      day: "2026-08-05",
      isActive: false,
      isNext: true,
    } satisfies EventProgramMarkerOccurrence;
    const nextDayOccurrence = {
      ...occurrence,
      key: "breakfast:custom_marker:camp",
      item: {
        ...occurrence.item,
        id: "breakfast",
        title: "Breakfast at the Clubhouse",
        start: new Date("2026-08-06T16:00:00.000Z"),
      },
      start: new Date("2026-08-06T16:00:00.000Z"),
      day: "2026-08-06",
      isNext: false,
    } satisfies EventProgramMarkerOccurrence;
    const selected = vi.fn();
    fixture.componentRef.setInput("occurrences", [
      occurrence,
      nextDayOccurrence,
    ]);
    fixture.componentRef.setInput("showSpotCards", false);
    fixture.componentInstance.occurrenceSelected.subscribe(selected);

    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("16:00");
    expect(fixture.nativeElement.textContent).toContain("Wed, Aug 5");
    expect(fixture.nativeElement.textContent).toContain("Thu, Aug 6");
    expect(fixture.nativeElement.textContent).toContain(
      "Dinner at the Clubhouse",
    );
    expect(fixture.nativeElement.textContent).toContain(
      "Campingplatz Waldhort",
    );
    expect(fixture.nativeElement.textContent).toContain("Next");

    (
      fixture.nativeElement.querySelector(".occurrence-row") as HTMLButtonElement
    ).click();
    expect(selected).toHaveBeenCalledWith(occurrence);
  });
});
