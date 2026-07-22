import { LOCALE_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { provideRouter } from "@angular/router";
import { Timestamp } from "firebase/firestore";
import { BehaviorSubject, throwError } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../../db/models/Event";
import { EventLiveUpdate } from "../../../db/models/EventLiveUpdate";
import type { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { AnalyticsService } from "../../services/analytics.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventLiveUpdatesService } from "../../services/firebase/firestore/event-live-updates.service";
import { NotificationPreferencesService } from "../../services/notification-preferences.service";
import { PushNotificationsService } from "../../services/push-notifications.service";
import { EventLiveUpdatesComponent } from "./event-live-updates.component";

const event = new Event("event-1" as EventId, {
  name: "City Jam",
  slug: "city-jam",
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

describe("EventLiveUpdatesComponent", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("shows the logged-out and empty states without prompting for notification permission", async () => {
    const setup = createComponent();
    await setup.fixture.whenStable();

    expect(setup.fixture.nativeElement.textContent).toContain("Sign in to get live updates");
    expect(setup.fixture.nativeElement.textContent).toContain("No live updates have been published yet");
    expect(setup.push.requestPermissionFromUserAction).not.toHaveBeenCalled();
  });

  it("opts in first, then requests device permission only from the explicit CTA flow", async () => {
    const setup = createComponent({ userId: "attendee-1", pushSupported: true });
    await setup.fixture.whenStable();

    await setup.fixture.componentInstance.enableUpdates();

    expect(setup.liveUpdates.setSubscription).toHaveBeenCalledWith("event-1", true);
    expect(setup.preferences.setPreference).toHaveBeenCalledWith("event_updates", true);
    expect(setup.push.requestPermissionFromUserAction).toHaveBeenCalledOnce();
    expect(setup.analytics.trackEvent).toHaveBeenCalledWith("live_update_opt_in", {
      event_id: "event-1",
    });
  });

  it("keeps in-app updates enabled when system push permission is denied", async () => {
    const subscription$ = new BehaviorSubject(true);
    const setup = createComponent({
      userId: "attendee-1",
      pushSupported: true,
      permission: "denied",
      subscription$,
    });
    await setup.fixture.whenStable();

    expect(setup.fixture.nativeElement.textContent).toContain("Live updates enabled");
    expect(setup.fixture.nativeElement.textContent).toContain("Push notifications are blocked");
    expect(setup.fixture.nativeElement.textContent).toContain("Turn off updates");
  });

  it("renders new updates from the realtime listener without a page refresh", async () => {
    const updates$ = new BehaviorSubject<EventLiveUpdate[]>([]);
    const setup = createComponent({ updates$ });
    await setup.fixture.whenStable();

    updates$.next([
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
    await setup.fixture.whenStable();

    expect(setup.fixture.nativeElement.textContent).toContain("Final moved to 16:00");
    expect(setup.fixture.nativeElement.textContent).toContain("Warm-up starts at 15:30");
    expect(setup.fixture.nativeElement.textContent).toContain("City Crew");
  });

  it("renders the realtime error state", async () => {
    const setup = createComponent({ updatesError: true });
    await setup.fixture.whenStable();
    expect(setup.fixture.nativeElement.textContent).toContain("Live updates could not be loaded");
  });

  it("validates organizer copy before showing the confirmation preview", async () => {
    const setup = createComponent({ userId: "organizer-1", canPublish: true });
    await setup.fixture.whenStable();
    setup.fixture.componentInstance.formModel.update((model) => ({
      ...model,
      title: "x".repeat(81),
    }));

    setup.fixture.componentInstance.showPreview();
    await setup.fixture.whenStable();
    expect(setup.fixture.componentInstance.previewing()).toBe(false);

    setup.fixture.componentInstance.formModel.update((model) => ({
      ...model,
      title: "Meet at the west entrance",
    }));
    setup.fixture.componentInstance.showPreview();
    await setup.fixture.whenStable();
    expect(setup.fixture.nativeElement.textContent).toContain("Confirm live notification");
    expect(setup.fixture.nativeElement.textContent).toContain("People subscribed to this event");
  });
});

function createComponent(options: {
  userId?: string;
  updates$?: BehaviorSubject<EventLiveUpdate[]>;
  updatesError?: boolean;
  subscription$?: BehaviorSubject<boolean>;
  pushSupported?: boolean;
  permission?: "unknown" | "granted" | "denied" | "unsupported";
  canPublish?: boolean;
} = {}) {
  const authState$ = new BehaviorSubject(
    options.userId ? { uid: options.userId } : null,
  );
  const updates$ = options.updates$ ?? new BehaviorSubject<EventLiveUpdate[]>([]);
  const subscription$ = options.subscription$ ?? new BehaviorSubject(false);
  const liveUpdates = {
    observeUpdates: vi.fn(() =>
      options.updatesError
        ? throwError(() => new Error("read failed"))
        : updates$,
    ),
    observeSubscription: vi.fn(() => subscription$),
    setSubscription: vi.fn(async () => undefined),
    canCurrentUserPublish: vi.fn(async () => options.canPublish ?? false),
    publish: vi.fn(async () => ({ updateId: "update-1" })),
  };
  const preferences = { setPreference: vi.fn(async () => undefined) };
  const supported = signal(options.pushSupported ?? false);
  const permissionState = signal(options.permission ?? "unsupported");
  const push = {
    supported,
    permissionState,
    systemAllowsNotifications: signal(permissionState() === "granted"),
    blockedBySystem: signal(permissionState() === "denied"),
    requestPermissionFromUserAction: vi.fn(async () => false),
  };
  const analytics = { trackEvent: vi.fn() };

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthenticationService,
        useValue: {
          user: { uid: options.userId },
          authState$,
          isAdmin: signal(false),
        },
      },
      { provide: EventLiveUpdatesService, useValue: liveUpdates },
      { provide: NotificationPreferencesService, useValue: preferences },
      { provide: PushNotificationsService, useValue: push },
      { provide: AnalyticsService, useValue: analytics },
      { provide: MatSnackBar, useValue: { open: vi.fn() } },
      { provide: LOCALE_ID, useValue: "en" },
    ],
  });
  const fixture = TestBed.createComponent(EventLiveUpdatesComponent);
  fixture.componentRef.setInput("event", event);
  return { fixture, liveUpdates, preferences, push, analytics };
}
