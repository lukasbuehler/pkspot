import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { provideRouter } from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { EventLiveUpdatesService } from "../../services/firebase/firestore/event-live-updates.service";
import { PushNotificationsService } from "../../services/push-notifications.service";
import { NotificationPreferencesService } from "../../services/notification-preferences.service";
import { NotificationOptInService } from "../../services/notification-opt-in.service";
import { MyEventsService } from "../../services/my-events.service";
import { EventRsvpComponent } from "./event-rsvp.component";

type ScreenshotGlobal = typeof globalThis & {
  __PKSPOT_SCREENSHOT_EVENT_RSVPS__?: unknown;
};

describe("EventRsvpComponent", () => {
  let component: EventRsvpComponent;
  let fixture: ComponentFixture<EventRsvpComponent>;
  const authState$ = new BehaviorSubject<{ uid: string } | null>({
    uid: "user-1",
  });
  const eventsService = {
    getMyRsvp: vi.fn(() => Promise.resolve(null)),
    setMyRsvp: vi.fn(() => Promise.resolve()),
    clearMyRsvp: vi.fn(() => Promise.resolve()),
  };
  const liveUpdatesService = {
    ensureDefaultNotificationLevel: vi.fn(() => Promise.resolve(true)),
  };
  const pushNotifications = {
    supported: vi.fn(() => true),
    systemAllowsNotifications: vi.fn(() => false),
    requestPermissionFromUserAction: vi.fn(() => Promise.resolve(true)),
  };
  const notificationPreferences = {
    loading: vi.fn(() => false),
    preferences: vi.fn(() => ({
      event_reminders: true,
      event_updates: true,
    })),
  };
  const notificationOptIn = {
    maybePrompt: vi.fn(() => Promise.resolve(null)),
  };
  const relationship = signal<"going" | "saved" | null>(null);
  const myEvents = {
    relationshipFor: vi.fn(() => relationship()),
    saveEvent: vi.fn(async () => relationship.set("saved")),
    setRsvp: vi.fn(
      async (
        eventId: string,
        rsvp: "going" | "interested" | "notgoing",
        level: "all" | "event_updates" | "reminders" | "none",
      ) => {
        await eventsService.setMyRsvp(eventId, rsvp);
        if (
          (rsvp === "going" || rsvp === "interested") &&
          level !== "none"
        ) {
          const preferences = notificationPreferences.preferences();
          const channelEnabled =
            level === "all"
              ? preferences.event_reminders || preferences.event_updates
              : level === "reminders"
                ? preferences.event_reminders
                : preferences.event_updates;
          if (
            channelEnabled &&
            pushNotifications.supported() &&
            !pushNotifications.systemAllowsNotifications()
          ) {
            await pushNotifications.requestPermissionFromUserAction();
          }
          await liveUpdatesService.ensureDefaultNotificationLevel(
            eventId,
            level,
          );
        }
      },
    ),
    clearRsvp: vi.fn(async (eventId: string) => {
      relationship.set(null);
      await eventsService.clearMyRsvp(eventId);
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    relationship.set(null);
    delete (globalThis as ScreenshotGlobal).__PKSPOT_SCREENSHOT_EVENT_RSVPS__;
    authState$.next({ uid: "user-1" });
    eventsService.getMyRsvp.mockResolvedValue(null);
    eventsService.setMyRsvp.mockResolvedValue(undefined);
    eventsService.clearMyRsvp.mockResolvedValue(undefined);
    liveUpdatesService.ensureDefaultNotificationLevel.mockResolvedValue(true);
    pushNotifications.requestPermissionFromUserAction.mockResolvedValue(true);
    notificationPreferences.preferences.mockReturnValue({
      event_reminders: true,
      event_updates: true,
    });
    notificationOptIn.maybePrompt.mockResolvedValue(null);
    await TestBed.configureTestingModule({
      imports: [EventRsvpComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: EventsService, useValue: eventsService },
        { provide: MyEventsService, useValue: myEvents },
        { provide: EventLiveUpdatesService, useValue: liveUpdatesService },
        { provide: PushNotificationsService, useValue: pushNotifications },
        {
          provide: NotificationPreferencesService,
          useValue: notificationPreferences,
        },
        { provide: NotificationOptInService, useValue: notificationOptIn },
        {
          provide: AuthenticationService,
          useValue: {
            user: { uid: "user-1" },
            authState$,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventRsvpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("leaves the visible counts unchanged after a save while the aggregate is stale", async () => {
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.componentRef.setInput("counts", {
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    await component.selectRsvp("going");

    expect(component.loadedRsvp()).toBe("going");
    expect(component.displayCounts()).toEqual({
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    });
  });

  it("emits the saved RSVP so contextual event controls can appear inline", async () => {
    const changed = vi.fn();
    component.rsvpChanged.subscribe(changed);
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.detectChanges();
    await fixture.whenStable();

    await component.selectRsvp("interested");

    expect(changed).toHaveBeenLastCalledWith("interested");
  });

  it("applies the event notification default when going or interested is saved", async () => {
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.componentRef.setInput("defaultNotificationLevel", "reminders");
    fixture.detectChanges();
    await fixture.whenStable();

    await component.selectRsvp("interested");
    await vi.waitFor(() =>
      expect(
        liveUpdatesService.ensureDefaultNotificationLevel,
      ).toHaveBeenCalledWith("event-1", "reminders"),
    );

    expect(
      pushNotifications.requestPermissionFromUserAction,
    ).toHaveBeenCalledOnce();
  });

  it("does not enable notifications for not going", async () => {
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.detectChanges();
    await fixture.whenStable();

    await component.selectRsvp("notgoing");

    expect(
      liveUpdatesService.ensureDefaultNotificationLevel,
    ).not.toHaveBeenCalled();
    expect(
      pushNotifications.requestPermissionFromUserAction,
    ).not.toHaveBeenCalled();
  });

  it("respects global event-channel opt-outs when requesting device permission", async () => {
    notificationPreferences.preferences.mockReturnValue({
      event_reminders: false,
      event_updates: false,
    });
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.detectChanges();
    await fixture.whenStable();

    await component.selectRsvp("going");

    expect(
      pushNotifications.requestPermissionFromUserAction,
    ).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(
        liveUpdatesService.ensureDefaultNotificationLevel,
      ).toHaveBeenCalledWith("event-1", "all"),
    );
  });

  it("emits null after clearing a response", async () => {
    const changed = vi.fn();
    component.rsvpChanged.subscribe(changed);
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.detectChanges();
    await fixture.whenStable();

    await component.selectRsvp("going");
    await component.clearRsvp();

    expect(changed).toHaveBeenLastCalledWith(null);
  });

  it("keeps a removed relationship hidden while the private index catches up", async () => {
    relationship.set("going");
    myEvents.clearRsvp.mockResolvedValueOnce(undefined);
    fixture.componentRef.setInput("eventId", "event-1");
    await fixture.whenStable();

    expect(component.myEventsRsvp()).toBe("going");

    await component.clearRsvp();
    await fixture.whenStable();

    expect(relationship()).toBe("going");
    expect(component.myEventsRsvp()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("Add to My Events");
  });

  it("does not add my loaded response to the visible aggregate", async () => {
    eventsService.getMyRsvp.mockResolvedValue({
      user_id: "user-1",
      event_id: "event-1",
      rsvp: "going",
      time_created: new Date(),
      time_updated: new Date(),
    });
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.componentRef.setInput("counts", {
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.selectedRsvp()).toBe("going");
    expect(component.displayCounts()).toEqual({
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    });
  });

  it("shows updated counts only when the event aggregate changes", async () => {
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.componentRef.setInput("counts", {
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    await component.selectRsvp("going");

    fixture.componentRef.setInput("counts", {
      going: 1,
      interested: 0,
      notgoing: 0,
      total: 1,
    });
    fixture.detectChanges();

    expect(component.displayCounts()).toEqual({
      going: 1,
      interested: 0,
      notgoing: 0,
      total: 1,
    });
  });

  it("uses fancy counters in the visible aggregate counts", async () => {
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.componentRef.setInput("counts", {
      going: 2,
      interested: 1,
      notgoing: 0,
      total: 3,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelectorAll("app-fancy-counter"),
    ).toHaveLength(2);
  });

  it("shows the selected RSVP in a menu button when a response is loaded", async () => {
    eventsService.getMyRsvp.mockResolvedValue({
      user_id: "user-1",
      event_id: "event-1",
      rsvp: "going",
      time_created: new Date(),
      time_updated: new Date(),
    });
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector("mat-button-toggle-group"),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector(".rsvp-menu-button"),
    ).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain("Going");
    expect(fixture.nativeElement.querySelector(".rsvp-remove-button")).toBeNull();

    fixture.nativeElement.querySelector(".rsvp-menu-button").click();
    await fixture.whenStable();

    const removeMenuItem = document.body.querySelector(
      ".rsvp-remove-menu-item",
    );
    expect(removeMenuItem).toBeTruthy();
    expect(
      removeMenuItem?.querySelector("mat-icon")?.textContent,
    ).toContain("event_busy");
  });

  it("uses an injected store screenshot RSVP without loading remote user data", async () => {
    (globalThis as ScreenshotGlobal).__PKSPOT_SCREENSHOT_EVENT_RSVPS__ = {
      "event-1": "interested",
    };

    fixture.componentRef.setInput("eventId", "event-1");
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(eventsService.getMyRsvp).not.toHaveBeenCalled();
    expect(component.selectedRsvp()).toBe("interested");
    expect(fixture.nativeElement.textContent).toContain("Interested");
  });

  it("prompts for an RSVP in the menu button when no response is loaded", async () => {
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.componentRef.setInput("counts", {
      going: 1,
      interested: 0,
      notgoing: 0,
      total: 1,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Add to My Events");
    expect(fixture.nativeElement.querySelector(".rsvp-menu-button")).toBeTruthy();
    expect(
      fixture.nativeElement
        .querySelector(".rsvp-disclaimer-help")
        ?.getAttribute("aria-label"),
    ).toBe(
      "These numbers show PK Spot user intent, not tickets bought.",
    );
  });

  it("lets signed-out users save Interested locally and remove it again", async () => {
    authState$.next(null);
    fixture.componentRef.setInput("eventId", "event-1");
    await fixture.whenStable();

    await component.selectInterested();
    await fixture.whenStable();

    expect(myEvents.saveEvent).toHaveBeenCalledWith("event-1", "all");
    expect(component.myEventsRsvp()).toBe("interested");
    expect(fixture.nativeElement.textContent).toContain("Interested");

    await component.clearRsvp();
    await fixture.whenStable();

    expect(component.myEventsRsvp()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("Add to My Events");
  });

  it("updates the menu button after saving an edited RSVP", async () => {
    eventsService.getMyRsvp.mockResolvedValue({
      user_id: "user-1",
      event_id: "event-1",
      rsvp: "going",
      time_created: new Date(),
      time_updated: new Date(),
    });
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.componentRef.setInput("counts", {
      going: 1,
      interested: 0,
      notgoing: 0,
      total: 1,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    await component.selectRsvp("interested");
    fixture.detectChanges();

    expect(component.selectedRsvp()).toBe("interested");
    expect(
      fixture.nativeElement.querySelector("mat-button-toggle-group"),
    ).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("Interested");
    expect(
      fixture.nativeElement.querySelector(".rsvp-disclaimer-help"),
    ).toBeTruthy();
  });

  it("shows the RSVP prompt again after clearing a response", async () => {
    eventsService.getMyRsvp.mockResolvedValue({
      user_id: "user-1",
      event_id: "event-1",
      rsvp: "going",
      time_created: new Date(),
      time_updated: new Date(),
    });
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.detectChanges();
    await fixture.whenStable();

    await component.clearRsvp();
    fixture.detectChanges();

    expect(component.selectedRsvp()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("Add to My Events");
  });

  it("can hide the RSVP disclaimer", async () => {
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.componentRef.setInput("showDisclaimer", false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector(".rsvp-disclaimer-help"),
    ).toBeNull();
  });

  it("shows only aggregate counts in preview mode", async () => {
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.componentRef.setInput("preview", true);
    fixture.componentRef.setInput("counts", {
      going: 2,
      interested: 1,
      notgoing: 0,
      total: 3,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(eventsService.getMyRsvp).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelectorAll("app-fancy-counter")).toHaveLength(2);
    expect(fixture.nativeElement.querySelector(".rsvp-menu-button")).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain("Sign in");
    expect(fixture.nativeElement.textContent).not.toContain(
      "These numbers show",
    );
    expect(
      fixture.nativeElement.querySelector(".rsvp-disclaimer-help"),
    ).toBeNull();
  });
});
