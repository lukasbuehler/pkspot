import { isPlatformBrowser } from "@angular/common";
import {
  Injectable,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { catchError, map, of, switchMap } from "rxjs";
import type { EventNotificationLevel } from "../../db/schemas/EventLiveUpdateSchema";
import type { EventRSVPOption } from "../../db/schemas/EventRSVPSchema";
import { AnalyticsService } from "./analytics.service";
import { AuthenticationService } from "./firebase/authentication.service";
import { EventsService } from "./firebase/firestore/events.service";
import { EventLiveUpdatesService } from "./firebase/firestore/event-live-updates.service";
import { UsersService } from "./firebase/firestore/users.service";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { PushNotificationsService } from "./push-notifications.service";

export type MyEventRelationship = "going" | "saved" | null;

const LOCAL_SAVED_EVENTS_KEY = "pkspot:saved-events:v1";

@Injectable({ providedIn: "root" })
export class MyEventsService {
  private readonly _auth = inject(AuthenticationService);
  private readonly _analytics = inject(AnalyticsService);
  private readonly _events = inject(EventsService);
  private readonly _users = inject(UsersService);
  private readonly _liveUpdates = inject(EventLiveUpdatesService);
  private readonly _push = inject(PushNotificationsService);
  private readonly _preferences = inject(NotificationPreferencesService);
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _localSavedEventIds = signal(this._readLocalSavedEvents());
  private _migrationUserId = "";

  readonly userId = toSignal(
    this._auth.authState$.pipe(map((user) => user?.uid ?? null)),
    { initialValue: this._auth.user.uid || null },
  );
  readonly privateData = toSignal(
    this._auth.authState$.pipe(
      switchMap((user) =>
        user?.uid && this._isBrowser
          ? this._users.getPrivateData(user.uid)
          : of(null),
      ),
      catchError((error) => {
        console.warn("Could not load private event lists", error);
        return of(null);
      }),
    ),
    { initialValue: null },
  );
  readonly localSavedEventIds = this._localSavedEventIds.asReadonly();
  readonly goingEventIds = computed(
    () => this.privateData()?.going_events ?? [],
  );
  readonly savedEventIds = computed(() => [
    ...new Set([
      ...(this.privateData()?.saved_events ?? []),
      ...this._localSavedEventIds(),
    ]),
  ]);
  readonly candidateEventIds = computed(() => [
    ...new Set([...this.goingEventIds(), ...this.savedEventIds()]),
  ]);

  constructor() {
    this._auth.authState$
      .pipe(takeUntilDestroyed())
      .subscribe((user) => {
        if (!user?.uid || user.uid === this._migrationUserId) return;
        this._migrationUserId = user.uid;
        void this._migrateLocalSaves(user.uid);
      });
  }

  relationshipFor(eventId: string): MyEventRelationship {
    if (this.goingEventIds().includes(eventId)) return "going";
    return this.savedEventIds().includes(eventId) ? "saved" : null;
  }

  async saveEvent(
    eventId: string,
    defaultNotificationLevel: EventNotificationLevel = "none",
  ): Promise<void> {
    const userId = this.userId();
    if (!userId) {
      this._setLocalSaved(eventId, true);
      return;
    }
    await this.setRsvp(eventId, "interested", defaultNotificationLevel);
  }

  async markGoing(
    eventId: string,
    defaultNotificationLevel: EventNotificationLevel,
  ): Promise<void> {
    await this.setRsvp(eventId, "going", defaultNotificationLevel);
  }

  async setRsvp(
    eventId: string,
    rsvp: EventRSVPOption,
    defaultNotificationLevel: EventNotificationLevel,
  ): Promise<void> {
    const userId = this.userId();
    if (!userId) {
      throw new Error("Sign in before changing event attendance.");
    }

    const permissionRequest = this._notificationPermissionRequest(
      defaultNotificationLevel,
    );
    await this._events.setMyRsvp(eventId, rsvp);
    await this._recordRelationship(
      userId,
      eventId,
      rsvp === "going" ? "going" : rsvp === "interested" ? "saved" : null,
    );

    if (
      (rsvp === "going" || rsvp === "interested") &&
      defaultNotificationLevel !== "none"
    ) {
      void Promise.all([
        this._liveUpdates.ensureDefaultNotificationLevel(
          eventId,
          defaultNotificationLevel,
          this._preferences.preferences().event_reminder_offsets_minutes,
        ),
        permissionRequest,
      ])
        .then(([created]) => {
          if (created) {
            this._analytics.trackEvent("event_notifications_auto_enabled", {
              event_id: eventId,
              notification_level: defaultNotificationLevel,
            });
          }
        })
        .catch((error) =>
          console.warn("Could not apply default event notifications", error),
        );
    }
  }

  async clearRsvp(eventId: string): Promise<void> {
    const userId = this.userId();
    if (!userId) {
      this._setLocalSaved(eventId, false);
      return;
    }
    await this._events.clearMyRsvp(eventId);
    await this._recordRelationship(userId, eventId, null);
  }

  async recordRegistration(
    eventId: string,
    registered: boolean,
  ): Promise<void> {
    const userId = this.userId();
    if (!userId) return;
    if (registered) {
      await this._recordRelationship(userId, eventId, "going");
      return;
    }
    const rsvp = await this._events.getMyRsvp(eventId);
    await this._recordRelationship(
      userId,
      eventId,
      rsvp?.rsvp === "going"
        ? "going"
        : rsvp?.rsvp === "interested"
          ? "saved"
          : null,
    );
  }

  private async _recordRelationship(
    userId: string,
    eventId: string,
    relationship: MyEventRelationship,
  ): Promise<void> {
    try {
      await this._users.updateEventRelationship(
        userId,
        eventId,
        relationship,
      );
      this._setLocalSaved(eventId, false);
    } catch (error) {
      console.warn("Could not update the private My Events index", error);
    }
  }

  private async _migrateLocalSaves(userId: string): Promise<void> {
    for (const eventId of this._localSavedEventIds()) {
      try {
        const existing = await this._events.getMyRsvp(eventId);
        if (!existing) {
          await this._events.setMyRsvp(eventId, "interested");
        }
        await this._users.updateEventRelationship(
          userId,
          eventId,
          existing?.rsvp === "going"
            ? "going"
            : existing?.rsvp === "notgoing"
              ? null
              : "saved",
        );
        this._setLocalSaved(eventId, false);
      } catch (error) {
        console.warn("Could not sync a device-saved event", {
          eventId,
          error,
        });
      }
    }
  }

  private _notificationPermissionRequest(
    level: EventNotificationLevel,
  ): Promise<boolean> {
    const preferences = this._preferences.preferences();
    const globallyEnabled =
      level === "event_updates"
        ? preferences.event_updates
        : level === "reminders"
          ? preferences.event_reminders
          : level === "all" &&
            (preferences.event_updates || preferences.event_reminders);
    return level !== "none" &&
      globallyEnabled &&
      this._push.supported() &&
      !this._push.systemAllowsNotifications()
      ? this._push.requestPermissionFromUserAction().catch(() => false)
      : Promise.resolve(false);
  }

  private _setLocalSaved(eventId: string, saved: boolean): void {
    if (!eventId || !this._isBrowser) return;
    this._localSavedEventIds.update((current) =>
      saved
        ? [...new Set([...current, eventId])]
        : current.filter((id) => id !== eventId),
    );
    localStorage.setItem(
      LOCAL_SAVED_EVENTS_KEY,
      JSON.stringify(this._localSavedEventIds()),
    );
  }

  private _readLocalSavedEvents(): string[] {
    if (!this._isBrowser) return [];
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(LOCAL_SAVED_EVENTS_KEY) ?? "[]",
      );
      return Array.isArray(value)
        ? [
            ...new Set(
              value.filter((id): id is string => typeof id === "string"),
            ),
          ]
        : [];
    } catch {
      return [];
    }
  }
}
