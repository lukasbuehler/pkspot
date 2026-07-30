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
          useValue: { format: vi.fn(() => "16:00") },
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
    const selected = vi.fn();
    fixture.componentRef.setInput("occurrences", [occurrence]);
    fixture.componentRef.setInput("showSpotCards", false);
    fixture.componentInstance.occurrenceSelected.subscribe(selected);

    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("16:00");
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
