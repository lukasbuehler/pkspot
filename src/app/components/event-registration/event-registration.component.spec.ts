import { TestBed } from "@angular/core/testing";
import { BehaviorSubject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import {
  EventAdmissionStateSchema,
  EventRegistrationSchema,
} from "../../../db/schemas/EventRegistrationSchema";
import { AnalyticsService } from "../../services/analytics.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventLiveUpdatesService } from "../../services/firebase/firestore/event-live-updates.service";
import { EventRegistrationsService } from "../../services/firebase/firestore/event-registrations.service";
import { NotificationPreferencesService } from "../../services/notification-preferences.service";
import { PushNotificationsService } from "../../services/push-notifications.service";
import { EventRegistrationComponent } from "./event-registration.component";

const registration$ =
  new BehaviorSubject<EventRegistrationSchema | null>(null);
const state$ = new BehaviorSubject<EventAdmissionStateSchema>({
  registered: 2,
  waitlisted: 0,
  time_updated: new Date(),
});
const authState$ = new BehaviorSubject<{ uid: string } | null>({
  uid: "user-1",
});
const registrations = {
  observeMyRegistration: vi.fn(() => registration$),
  observeAdmissionState: vi.fn(() => state$),
  register: vi.fn(),
  cancel: vi.fn(),
};
const liveUpdates = { ensureDefaultNotificationLevel: vi.fn() };

const event = (capacity = 10, waitlist = true): PkEvent =>
  new PkEvent("event-1" as EventId, {
    name: "Registration test",
    venue_string: "Gym",
    locality_string: "Zurich",
    location_raw: { lat: 47.37, lng: 8.54 },
    start: new Date(Date.now() + 86_400_000),
    end: new Date(Date.now() + 90_000_000),
    attendance: {
      social: "rsvp",
      admission: "registration",
      capacity,
      waitlist,
    },
    notification_policy: "all",
  } as unknown as EventSchema);

describe("EventRegistrationComponent", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    registration$.next(null);
    state$.next({
      registered: 2,
      waitlisted: 0,
      time_updated: new Date(),
    });
    authState$.next({ uid: "user-1" });
    registrations.register.mockResolvedValue({
      status: "registered",
      registered: 3,
      waitlisted: 0,
    });
    registrations.cancel.mockResolvedValue({
      status: "cancelled",
      registered: 2,
      waitlisted: 0,
    });
    liveUpdates.ensureDefaultNotificationLevel.mockResolvedValue(true);

    await TestBed.configureTestingModule({
      imports: [EventRegistrationComponent],
      providers: [
        {
          provide: EventRegistrationsService,
          useValue: registrations,
        },
        {
          provide: AuthenticationService,
          useValue: {
            user: { uid: "user-1" },
            authState$,
          },
        },
        {
          provide: AnalyticsService,
          useValue: { trackEvent: vi.fn() },
        },
        {
          provide: EventLiveUpdatesService,
          useValue: liveUpdates,
        },
        {
          provide: PushNotificationsService,
          useValue: {
            supported: vi.fn(() => false),
            systemAllowsNotifications: vi.fn(() => false),
            requestPermissionFromUserAction: vi.fn(),
          },
        },
        {
          provide: NotificationPreferencesService,
          useValue: {
            preferences: vi.fn(() => ({
              event_updates: true,
              event_reminders: true,
            })),
          },
        },
      ],
    }).compileComponents();
  });

  it("registers and applies the event notification default", async () => {
    const fixture = TestBed.createComponent(EventRegistrationComponent);
    fixture.componentRef.setInput("event", event());
    await fixture.whenStable();

    await fixture.componentInstance.register();

    expect(registrations.register).toHaveBeenCalledWith("event-1");
    expect(liveUpdates.ensureDefaultNotificationLevel).toHaveBeenCalledWith(
      "event-1",
      "all",
    );
  });

  it("offers the waitlist when capacity is full", async () => {
    state$.next({
      registered: 2,
      waitlisted: 1,
      time_updated: new Date(),
    });
    const fixture = TestBed.createComponent(EventRegistrationComponent);
    fixture.componentRef.setInput("event", event(2, true));
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("Join waitlist");
    expect(fixture.componentInstance.canJoinWaitlist()).toBe(true);
  });

  it("cancels an active registration", async () => {
    registration$.next({
      user_id: "user-1",
      event_id: "event-1",
      status: "registered",
      time_created: new Date(),
      time_updated: new Date(),
    });
    const fixture = TestBed.createComponent(EventRegistrationComponent);
    fixture.componentRef.setInput("event", event());
    await fixture.whenStable();

    await fixture.componentInstance.cancel();

    expect(registrations.cancel).toHaveBeenCalledWith("event-1");
  });
});
