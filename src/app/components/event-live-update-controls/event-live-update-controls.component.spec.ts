import { LOCALE_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { provideRouter } from "@angular/router";
import { Timestamp } from "firebase/firestore";
import { BehaviorSubject } from "rxjs";
import { Event } from "../../../db/models/Event";
import type { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { AnalyticsService } from "../../services/analytics.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventLiveUpdatesService } from "../../services/firebase/firestore/event-live-updates.service";
import { PushNotificationsService } from "../../services/push-notifications.service";
import {
  EventLiveUpdateControlsComponent,
  buildEventCalendar,
} from "./event-live-update-controls.component";

const event = new Event("event-1" as EventId, {
  name: "City Jam",
  slug: "city-jam",
  description: "A community jam.",
  venue_string: "Main park",
  locality_string: "Zurich",
  start: Timestamp.fromDate(new Date("2099-07-21T10:00:00Z")),
  end: Timestamp.fromDate(new Date("2099-07-21T18:00:00Z")),
  published: true,
  organizer: {
    type: "organization",
    organization: { id: "org-1", name: "City Crew", slug: "city-crew" },
  },
} as unknown as EventSchema);

describe("EventLiveUpdateControlsComponent", () => {
  it("builds a portable calendar entry with event time and location", () => {
    const calendar = buildEventCalendar(event);
    expect(calendar).toContain("DTSTART:20990721T100000Z");
    expect(calendar).toContain("DTEND:20990721T180000Z");
    expect(calendar).toContain("LOCATION:Main park\\, Zurich");
  });

  it("shows the event notification label and menu", async () => {
    const setup = createComponent();
    await setup.fixture.whenStable();
    expect(setup.fixture.nativeElement.textContent).toContain("Event Notifications");
    expect(setup.fixture.nativeElement.textContent).toContain("All");
    expect(setup.fixture.nativeElement.textContent).not.toContain("Add to calendar");
    expect(setup.fixture.componentInstance.notificationIcon()).toBe(
      "notifications_active",
    );
  });

  it("stores the selected event channels and requests permission from the explicit menu choice", async () => {
    const setup = createComponent();
    await setup.fixture.whenStable();
    setup.fixture.componentInstance.notificationPreferenceChanged("reminders");
    await vi.waitFor(() =>
      expect(setup.liveUpdates.setNotificationLevel).toHaveBeenCalledWith(
        "event-1",
        "reminders",
      ),
    );

    expect(setup.push.requestPermissionFromUserAction).toHaveBeenCalledOnce();
    expect(
      setup.push.requestPermissionFromUserAction.mock.invocationCallOrder[0],
    ).toBeLessThan(
      setup.liveUpdates.setNotificationLevel.mock.invocationCallOrder[0],
    );
  });

  it("shows none when the user has no event subscription", async () => {
    const setup = createComponent(null);
    await setup.fixture.whenStable();
    expect(setup.fixture.componentInstance.notificationLevel()).toBe("none");
    expect(setup.liveUpdates.setNotificationLevel).not.toHaveBeenCalled();
  });
});

function createComponent(initialLevel: "all" | null = "all") {
  TestBed.resetTestingModule();
  const authState$ = new BehaviorSubject<{ uid: string } | null>({ uid: "user-1" });
  const subscriptions = new BehaviorSubject(initialLevel);
  const liveUpdates = {
    observeNotificationLevel: vi.fn(() => subscriptions),
    setNotificationLevel: vi.fn(async () => undefined),
  };
  const push = {
    permissionState: signal("unknown"),
    supported: signal(true),
    blockedBySystem: signal(false),
    systemAllowsNotifications: signal(false),
    requestPermissionFromUserAction: vi.fn(async () => true),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthenticationService,
        useValue: { user: { uid: "user-1" }, authState$ },
      },
      { provide: EventLiveUpdatesService, useValue: liveUpdates },
      { provide: PushNotificationsService, useValue: push },
      { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
      { provide: MatSnackBar, useValue: { open: vi.fn() } },
      { provide: LOCALE_ID, useValue: "en" },
    ],
  });
  const fixture = TestBed.createComponent(EventLiveUpdateControlsComponent);
  fixture.componentRef.setInput("event", event);
  return { fixture, liveUpdates, push };
}
