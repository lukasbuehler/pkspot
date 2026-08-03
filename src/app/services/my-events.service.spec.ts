import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BehaviorSubject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "./firebase/authentication.service";
import { AnalyticsService } from "./analytics.service";
import { EventsService } from "./firebase/firestore/events.service";
import { EventLiveUpdatesService } from "./firebase/firestore/event-live-updates.service";
import { UsersService } from "./firebase/firestore/users.service";
import { MyEventsService } from "./my-events.service";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { PushNotificationsService } from "./push-notifications.service";

describe("MyEventsService", () => {
  const authState = new BehaviorSubject<{ uid: string } | null>(null);
  const privateData = new BehaviorSubject<{
    going_events?: string[];
    saved_events?: string[];
  } | null>(null);
  const events = {
    setMyRsvp: vi.fn(),
    clearMyRsvp: vi.fn(),
    getMyRsvp: vi.fn(),
  };
  const users = {
    getPrivateData: vi.fn(() => privateData),
    updateEventRelationship: vi.fn(
      async (
        _userId: string,
        eventId: string,
        relationship: "going" | "saved" | null,
      ) => {
        const current = privateData.value ?? {};
        privateData.next({
          going_events: [
            ...(current.going_events ?? []).filter((id) => id !== eventId),
            ...(relationship === "going" ? [eventId] : []),
          ],
          saved_events: [
            ...(current.saved_events ?? []).filter((id) => id !== eventId),
            ...(relationship === "saved" ? [eventId] : []),
          ],
        });
      },
    ),
  };
  const liveUpdates = {
    ensureDefaultNotificationLevel: vi.fn(),
  };
  const push = {
    supported: vi.fn(() => true),
    systemAllowsNotifications: vi.fn(() => false),
    requestPermissionFromUserAction: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    authState.next(null);
    privateData.next(null);
    events.setMyRsvp.mockResolvedValue(undefined);
    events.clearMyRsvp.mockResolvedValue(undefined);
    events.getMyRsvp.mockResolvedValue(null);
    liveUpdates.ensureDefaultNotificationLevel.mockResolvedValue(true);
    push.requestPermissionFromUserAction.mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthenticationService,
          useValue: {
            user: { uid: "" },
            authState$: authState,
          },
        },
        {
          provide: AnalyticsService,
          useValue: { trackEvent: vi.fn() },
        },
        { provide: EventsService, useValue: events },
        { provide: UsersService, useValue: users },
        { provide: EventLiveUpdatesService, useValue: liveUpdates },
        { provide: PushNotificationsService, useValue: push },
        {
          provide: NotificationPreferencesService,
          useValue: {
            preferences: vi.fn(() => ({
              event_updates: true,
              event_reminders: true,
              event_reminder_offsets_minutes: [120],
            })),
          },
        },
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });
  });

  it("lets signed-out users save an event on their device", async () => {
    const service = TestBed.inject(MyEventsService);

    await service.saveEvent("event-1");

    expect(service.savedEventIds()).toEqual(["event-1"]);
    expect(events.setMyRsvp).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("pkspot:saved-events:v1") ?? "[]"))
      .toEqual(["event-1"]);
  });

  it("maps Save and Going to distinct signed-in relationships", async () => {
    authState.next({ uid: "user-1" });
    const service = TestBed.inject(MyEventsService);

    await service.saveEvent("event-1", "none");
    await service.markGoing("event-2", "all");

    expect(events.setMyRsvp).toHaveBeenNthCalledWith(
      1,
      "event-1",
      "interested",
    );
    expect(events.setMyRsvp).toHaveBeenNthCalledWith(2, "event-2", "going");
    expect(service.savedEventIds()).toEqual(["event-1"]);
    expect(service.goingEventIds()).toEqual(["event-2"]);
    await vi.waitFor(() =>
      expect(liveUpdates.ensureDefaultNotificationLevel).toHaveBeenCalledWith(
        "event-2",
        "all",
        [120],
      ),
    );
  });

  it("migrates device saves as interested after sign-in", async () => {
    localStorage.setItem(
      "pkspot:saved-events:v1",
      JSON.stringify(["event-1"]),
    );
    const service = TestBed.inject(MyEventsService);

    authState.next({ uid: "user-1" });

    await vi.waitFor(() =>
      expect(events.setMyRsvp).toHaveBeenCalledWith("event-1", "interested"),
    );
    expect(users.updateEventRelationship).toHaveBeenCalledWith(
      "user-1",
      "event-1",
      "saved",
    );
    expect(service.localSavedEventIds()).toEqual([]);
  });
});
