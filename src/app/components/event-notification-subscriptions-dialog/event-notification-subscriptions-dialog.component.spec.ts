import { TestBed } from "@angular/core/testing";
import { MatDialogRef } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { provideRouter } from "@angular/router";
import { Timestamp } from "firebase/firestore";
import { BehaviorSubject } from "rxjs";
import { Event } from "../../../db/models/Event";
import type { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { EventsService } from "../../services/firebase/firestore/events.service";
import {
  EventLiveUpdatesService,
  type EventNotificationSubscription,
} from "../../services/firebase/firestore/event-live-updates.service";
import { EventNotificationSubscriptionsDialogComponent } from "./event-notification-subscriptions-dialog.component";

describe("EventNotificationSubscriptionsDialogComponent", () => {
  const subscriptions = new BehaviorSubject<EventNotificationSubscription[]>([
    { eventId: "event-1", level: "all" },
  ]);
  const event = new Event("event-1" as EventId, {
    name: "City Jam",
    slug: "city-jam",
    start: Timestamp.fromDate(new Date("2099-07-21T10:00:00Z")),
    end: Timestamp.fromDate(new Date("2099-07-21T18:00:00Z")),
    published: true,
  } as EventSchema);
  const liveUpdates = {
    observeCurrentUserSubscriptions: vi.fn(() => subscriptions),
    setNotificationLevel: vi.fn(async () => undefined),
  };

  beforeEach(() => {
    liveUpdates.setNotificationLevel.mockClear();
    subscriptions.next([{ eventId: "event-1", level: "all" }]);
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: EventLiveUpdatesService, useValue: liveUpdates },
        {
          provide: EventsService,
          useValue: {
            getEventById: vi.fn(async () => event),
          },
        },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it("shows the signed-in user's subscribed events", async () => {
    const fixture = TestBed.createComponent(
      EventNotificationSubscriptionsDialogComponent,
    );
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(fixture.componentInstance.loading()).toBe(false),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("City Jam");
    expect(fixture.nativeElement.textContent).toContain("All");
    expect(fixture.nativeElement.querySelector('a[href="/events/city-jam"]')).toBeTruthy();
  });

  it("updates a per-event notification level", async () => {
    const fixture = TestBed.createComponent(
      EventNotificationSubscriptionsDialogComponent,
    );
    fixture.detectChanges();
    await fixture.whenStable();

    await fixture.componentInstance.notificationLevelChanged(
      "event-1",
      "reminders",
    );

    expect(liveUpdates.setNotificationLevel).toHaveBeenCalledWith(
      "event-1",
      "reminders",
    );
  });
});
