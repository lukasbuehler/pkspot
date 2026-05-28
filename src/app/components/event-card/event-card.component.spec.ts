import { LOCALE_ID } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { Timestamp } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { EventCardComponent } from "./event-card.component";

const buildEvent = (
  id: string,
  start: string,
  end: string,
  extra: Partial<EventSchema> = {},
): PkEvent =>
  new PkEvent(id as EventId, {
    name: "Swiss Jam 2026",
    slug: "swissjam26",
    venue_string: "Sportzentrum Josef",
    locality_string: "Zurich, Switzerland",
    start: Timestamp.fromDate(new Date(start)),
    end: Timestamp.fromDate(new Date(end)),
    bounds: { north: 47.4, south: 47.3, east: 8.6, west: 8.5 },
    ...extra,
  } as EventSchema);

describe("EventCardComponent", () => {
  let fixture: ComponentFixture<EventCardComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EventCardComponent],
      providers: [provideRouter([]), { provide: LOCALE_ID, useValue: "en" }],
    });

    fixture = TestBed.createComponent(EventCardComponent);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("links cards to the canonical event slug route", () => {
    fixture.componentRef.setInput(
      "event",
      buildEvent(
        "event-123",
        "2026-06-14T10:00:00.000Z",
        "2026-06-15T10:00:00.000Z",
      ),
    );

    fixture.detectChanges();

    expect(fixture.componentInstance.route()).toEqual([
      "/events",
      "swissjam26",
    ]);
    expect(
      fixture.debugElement.query(By.css("a.event-card-action")),
    ).toBeTruthy();
    expect(
      fixture.debugElement.query(By.css("button.event-card-action")),
    ).toBeNull();
  });

  it("falls back to the event id when no slug exists", () => {
    fixture.componentRef.setInput(
      "event",
      buildEvent(
        "event-123",
        "2026-06-14T10:00:00.000Z",
        "2026-06-15T10:00:00.000Z",
        { slug: undefined },
      ),
    );

    fixture.detectChanges();

    expect(fixture.componentInstance.route()).toEqual(["/events", "event-123"]);
  });

  it("marks live events distinctly from upcoming and past events", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T12:00:00.000Z"));
    fixture.componentRef.setInput(
      "event",
      buildEvent(
        "event-123",
        "2026-06-14T10:00:00.000Z",
        "2026-06-15T10:00:00.000Z",
      ),
    );

    fixture.detectChanges();

    const card = fixture.debugElement.query(By.css("mat-card"));
    const status = fixture.debugElement.query(By.css(".status-line"));

    expect(fixture.componentInstance.status()).toBe("live");
    expect(card.attributes["data-status"]).toBe("live");
    expect(status.nativeElement.textContent).toContain("Ongoing");
  });

  it("formats far upcoming events in weeks instead of long day counts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T10:00:00.000Z"));
    fixture.componentRef.setInput(
      "event",
      buildEvent(
        "event-123",
        "2026-06-14T10:00:00.000Z",
        "2026-06-15T10:00:00.000Z",
      ),
    );

    fixture.detectChanges();

    const status = fixture.debugElement.query(By.css(".status-line"));
    expect(status.nativeElement.textContent).toContain("in 3 weeks");
  });

  it("uses semantic status colors for live and upcoming cards", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T12:00:00.000Z"));
    fixture.componentRef.setInput(
      "event",
      buildEvent(
        "event-123",
        "2026-06-14T10:00:00.000Z",
        "2026-06-15T10:00:00.000Z",
      ),
    );
    fixture.detectChanges();

    let status = fixture.debugElement.query(By.css(".status-line"));
    expect(getComputedStyle(status.nativeElement).color).toBe(
      "var(--mat-sys-secondary)",
    );

    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    fixture.componentRef.setInput(
      "event",
      buildEvent(
        "event-456",
        "2026-06-14T10:00:00.000Z",
        "2026-06-15T10:00:00.000Z",
      ),
    );
    fixture.detectChanges();

    status = fixture.debugElement.query(By.css(".status-line"));
    expect(getComputedStyle(status.nativeElement).color).toBe(
      "var(--mat-sys-primary)",
    );
  });

  it("emits selection instead of navigating in select mode", () => {
    const event = buildEvent(
      "event-123",
      "2026-06-14T10:00:00.000Z",
      "2026-06-15T10:00:00.000Z",
    );
    const selected: PkEvent[] = [];
    fixture.componentRef.setInput("event", event);
    fixture.componentRef.setInput("selectMode", true);
    fixture.componentInstance.select.subscribe((value) => selected.push(value));

    fixture.detectChanges();
    fixture.debugElement.query(By.css("button.event-card-action")).nativeElement.click();

    expect(selected).toEqual([event]);
    expect(fixture.debugElement.query(By.css("a.event-card-action"))).toBeNull();
  });
});

describe("EventCardComponent localization", () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it("formats relative event timing with the active locale", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T10:00:00.000Z"));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [EventCardComponent],
      providers: [provideRouter([]), { provide: LOCALE_ID, useValue: "de" }],
    });

    const fixture = TestBed.createComponent(EventCardComponent);
    fixture.componentRef.setInput(
      "event",
      buildEvent(
        "event-123",
        "2026-06-14T10:00:00.000Z",
        "2026-06-15T10:00:00.000Z",
      ),
    );

    fixture.detectChanges();

    const status = fixture.debugElement.query(By.css(".status-line"));
    expect(status.nativeElement.textContent).toContain("in 3 Wochen");
  });
});
