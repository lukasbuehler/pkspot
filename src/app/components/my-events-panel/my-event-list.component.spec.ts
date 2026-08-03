import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import type { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { MyEventListComponent } from "./my-event-list.component";

const event = new PkEvent("saved-event" as EventId, {
  name: "Saved event",
  slug: "saved-event",
  start: "2026-08-05T10:00:00Z",
  end: "2026-08-05T12:00:00Z",
  time_zone: "Europe/Zurich",
} as unknown as EventSchema);

describe("MyEventListComponent", () => {
  it("renders the shared event row and emits when it is selected", async () => {
    TestBed.configureTestingModule({
      imports: [MyEventListComponent],
      providers: [
        provideRouter([]),
        {
          provide: DateTimeFormatService,
          useValue: { formatDateRange: () => "05.08.26" },
        },
      ],
    });
    const fixture = TestBed.createComponent(MyEventListComponent);
    const selected = vi.fn();
    fixture.componentRef.setInput("events", [event]);
    fixture.componentRef.setInput("emptyTab", "saved");
    fixture.componentInstance.eventSelected.subscribe(selected);

    await fixture.whenStable();

    const row = fixture.debugElement.query(By.css(".my-event-row"));
    expect(row.nativeElement.textContent).toContain("Saved event");

    fixture.componentInstance.eventSelected.emit();
    expect(selected).toHaveBeenCalledOnce();
  });
});
