import { LOCALE_ID } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Timestamp } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { EventSummaryMetaComponent } from "./event-summary-meta.component";

const buildEvent = (
  id: string,
  start: string,
  end: string,
): PkEvent =>
  new PkEvent(id as EventId, {
    name: "Swiss Jam 2026",
    venue_string: "Sportzentrum Josef",
    locality_string: "Zurich, Switzerland",
    start: Timestamp.fromDate(new Date(start)),
    end: Timestamp.fromDate(new Date(end)),
    bounds: { north: 47.4, south: 47.3, east: 8.6, west: 8.5 },
  } as EventSchema);

describe("EventSummaryMetaComponent", () => {
  let fixture: ComponentFixture<EventSummaryMetaComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EventSummaryMetaComponent],
      providers: [{ provide: LOCALE_ID, useValue: "en" }],
    });

    fixture = TestBed.createComponent(EventSummaryMetaComponent);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses semantic status colors for event page status text", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T12:00:00.000Z"));
    fixture.componentRef.setInput(
      "event",
      buildEvent(
        "live-event",
        "2026-06-14T10:00:00.000Z",
        "2026-06-15T10:00:00.000Z",
      ),
    );
    fixture.detectChanges();

    let status = fixture.debugElement.query(By.css(".event-meta"));
    expect(status.attributes["data-status"]).toBe("live");
    expect(getComputedStyle(status.nativeElement).color).toBe(
      "var(--mat-sys-secondary)",
    );

    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    fixture.componentRef.setInput(
      "event",
      buildEvent(
        "upcoming-event",
        "2026-06-14T10:00:00.000Z",
        "2026-06-15T10:00:00.000Z",
      ),
    );
    fixture.detectChanges();

    status = fixture.debugElement.query(By.css(".event-meta"));
    expect(status.attributes["data-status"]).toBe("upcoming");
    expect(getComputedStyle(status.nativeElement).color).toBe(
      "var(--mat-sys-primary)",
    );
  });
});
