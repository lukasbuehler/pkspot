import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import type { EventProgramItem } from "../../../db/models/Event";
import { DateTimeFormatService } from "../../services/date-time-format.service";

import { EventProgramDayTimelineComponent } from "./event-program-day-timeline.component";

describe("EventProgramDayTimelineComponent", () => {
  let component: EventProgramDayTimelineComponent;
  let fixture: ComponentFixture<EventProgramDayTimelineComponent>;
  const item: EventProgramItem = {
    id: "training",
    title: "Training",
    description: "Training together.",
    category: "workshop",
    start: new Date("2026-08-07T10:00:00Z"),
    end: new Date("2026-08-07T12:30:00Z"),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: DateTimeFormatService,
          useValue: {
            format: (
              value: Date,
              options: Intl.DateTimeFormatOptions,
            ) => new Intl.DateTimeFormat("en", options).format(value),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(EventProgramDayTimelineComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput("entries", [
      {
        item,
        start: item.start,
        end: item.end,
        status: "scheduled",
        spots: [],
        markers: [],
      },
    ]);
    fixture.componentRef.setInput("dayKey", "2026-08-07");
    fixture.componentRef.setInput("timeZone", "UTC");
  });

  it("renders the shared timeline item layout", async () => {
    await fixture.whenStable();

    expect(component).toBeTruthy();
    expect(fixture.nativeElement.querySelector(".program-item")).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain("Training");
    expect(fixture.nativeElement.textContent).toContain("Workshop");
    expect(fixture.nativeElement.textContent).toContain("10:00");
    expect(fixture.nativeElement.textContent).toContain(
      "10:00 AM - 12:30 PM",
    );
  });
});
