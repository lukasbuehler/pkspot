import { LOCALE_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Timestamp } from "firebase/firestore";
import { BehaviorSubject, throwError } from "rxjs";
import { Event } from "../../../db/models/Event";
import { EventLiveUpdate } from "../../../db/models/EventLiveUpdate";
import type { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { AnalyticsService } from "../../services/analytics.service";
import { EventLiveUpdatesService } from "../../services/firebase/firestore/event-live-updates.service";
import { EventLiveUpdatesComponent } from "./event-live-updates.component";

const event = new Event("event-1" as EventId, {
  name: "City Jam",
  venue_string: "Main park",
  locality_string: "Zurich",
  start: Timestamp.fromDate(new Date("2099-07-21T10:00:00Z")),
  end: Timestamp.fromDate(new Date("2099-07-21T18:00:00Z")),
  organizer: {
    type: "organization",
    organization: { id: "org-1", name: "City Crew", slug: "city-crew" },
  },
} as unknown as EventSchema);

describe("EventLiveUpdatesComponent", () => {
  it("renders realtime updates without attendee or organizer controls", async () => {
    const updates = new BehaviorSubject<EventLiveUpdate[]>([]);
    const fixture = createComponent(updates);
    await fixture.whenStable();
    expect(fixture.nativeElement.hidden).toBe(true);

    updates.next([
      new EventLiveUpdate("update-1", {
        event_id: "event-1",
        type: "schedule_change",
        title: "Final moved to 16:00",
        message: "Warm-up starts at 15:30.",
        status: "published",
        created_at: Timestamp.now(),
        created_by: "organizer-1",
        published_at: Timestamp.now(),
      }),
    ]);
    await fixture.whenStable();

    expect(fixture.nativeElement.hidden).toBe(false);
    expect(fixture.nativeElement.textContent).toContain("Final moved to 16:00");
    expect(fixture.nativeElement.textContent).not.toContain("Get live updates");
    expect(fixture.nativeElement.textContent).not.toContain("Publish organizer update");
  });

  it("renders the realtime error state", async () => {
    const fixture = createComponent(null);
    await fixture.whenStable();
    expect(fixture.nativeElement.hidden).toBe(false);
    expect(fixture.nativeElement.textContent).toContain(
      "Live updates could not be loaded",
    );
  });

  it("shows what changed without repeating the untranslated reschedule title", async () => {
    const updates = new BehaviorSubject<EventLiveUpdate[]>([
      new EventLiveUpdate("update-2", {
        event_id: "event-1",
        type: "event_rescheduled",
        title: "Event rescheduled",
        previous_scheduled_for: Timestamp.fromDate(new Date("2099-07-21T09:45:00Z")),
        previous_scheduled_until: Timestamp.fromDate(new Date("2099-07-21T17:45:00Z")),
        scheduled_for: Timestamp.fromDate(new Date("2099-07-21T10:00:00Z")),
        scheduled_until: Timestamp.fromDate(new Date("2099-07-21T18:00:00Z")),
        status: "published",
        created_at: Timestamp.now(),
        created_by: "organizer-1",
        published_at: Timestamp.now(),
      }),
    ]);
    const fixture = createComponent(updates);
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(text.match(/Event rescheduled/g)).toHaveLength(1);
    expect(fixture.nativeElement.querySelector(".timing-change")?.textContent).toContain("→");
    expect(fixture.nativeElement.querySelector(".timing-change")?.textContent).toContain("+15 min");
  });
});

function createComponent(updates: BehaviorSubject<EventLiveUpdate[]> | null) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: EventLiveUpdatesService,
        useValue: {
          observeUpdates: vi.fn(() =>
            updates ?? throwError(() => new Error("read failed")),
          ),
        },
      },
      { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
      { provide: LOCALE_ID, useValue: "en" },
    ],
  });
  const fixture = TestBed.createComponent(EventLiveUpdatesComponent);
  fixture.componentRef.setInput("event", event);
  return fixture;
}
