import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { Subscription } from "rxjs";
import { Event as PkEvent } from "../../../db/models/Event";
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

@Component({
  selector: "app-event-registration",
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: "./event-registration.component.html",
  styleUrl: "./event-registration.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventRegistrationComponent {
  private readonly _registrations = inject(EventRegistrationsService);
  private readonly _auth = inject(AuthenticationService);
  private readonly _analytics = inject(AnalyticsService);
  private readonly _liveUpdates = inject(EventLiveUpdatesService);
  private readonly _push = inject(PushNotificationsService);
  private readonly _preferences = inject(NotificationPreferencesService);
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly event = input.required<PkEvent>();
  readonly registration = signal<EventRegistrationSchema | null>(null);
  readonly admissionState = signal<EventAdmissionStateSchema>({
    registered: 0,
    waitlisted: 0,
    time_updated: new Date(0),
  });
  readonly userId = signal<string | null>(this._auth.user.uid ?? null);
  readonly isSaving = signal(false);
  readonly errorMessage = signal("");

  readonly activeStatus = computed(() => {
    const status = this.registration()?.status;
    return status === "registered" || status === "waitlisted" ? status : null;
  });
  readonly isSignedIn = computed(() => this.userId() !== null);
  readonly capacity = computed(() => this.event().attendance.capacity);
  readonly placesRemaining = computed(() => {
    const capacity = this.capacity();
    return capacity === undefined
      ? null
      : Math.max(0, capacity - this.admissionState().registered);
  });
  readonly eventIsFull = computed(() => this.placesRemaining() === 0);
  readonly canJoinWaitlist = computed(
    () => this.eventIsFull() && this.event().attendance.waitlist === true,
  );

  constructor() {
    effect((onCleanup) => {
      const subscription = this._auth.authState$.subscribe((user) =>
        this.userId.set(user?.uid ?? null),
      );
      onCleanup(() => subscription.unsubscribe());
    });

    effect((onCleanup) => {
      if (!this._isBrowser) return;
      const eventId = this.event().id;
      const subscriptions = new Subscription();
      subscriptions.add(
        this._registrations
          .observeMyRegistration(eventId)
          .subscribe({
            next: (registration) => this.registration.set(registration),
            error: (error) => {
              console.warn("Could not observe event registration", error);
              this.errorMessage.set(
                $localize`:@@event_registration.load_failed:Couldn't load your registration.`,
              );
            },
          }),
      );
      subscriptions.add(
        this._registrations
          .observeAdmissionState(eventId)
          .subscribe({
            next: (state) => this.admissionState.set(state),
            error: (error) =>
              console.warn("Could not observe event admission state", error),
          }),
      );
      onCleanup(() => subscriptions.unsubscribe());
    });
  }

  async register(): Promise<void> {
    if (!this.isSignedIn() || this.activeStatus() || this.isSaving()) return;
    const event = this.event();
    const notificationPermission = this._requestNotificationPermission();
    this.errorMessage.set("");
    this.isSaving.set(true);
    this._analytics.trackEvent("event_registration_clicked", {
      event_id: event.id,
      event_full: this.eventIsFull(),
    });
    try {
      const result = await this._registrations.register(event.id);
      if (event.notificationPolicy !== "none") {
        void Promise.all([
          this._liveUpdates.ensureDefaultNotificationLevel(
            event.id,
            event.notificationPolicy,
          ),
          notificationPermission,
        ]).catch((error) =>
          console.warn("Could not apply registration notifications", error),
        );
      }
      this._analytics.trackEvent("event_registration_saved", {
        event_id: event.id,
        registration_status: result.status,
      });
    } catch (error) {
      console.error("Failed to register for event", error);
      this.errorMessage.set(
        $localize`:@@event_registration.register_failed:Couldn't register. Try again in a moment.`,
      );
      this._analytics.trackEvent("event_registration_save_failed", {
        event_id: event.id,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  async cancel(): Promise<void> {
    if (!this.activeStatus() || this.isSaving()) return;
    const eventId = this.event().id;
    this.errorMessage.set("");
    this.isSaving.set(true);
    try {
      await this._registrations.cancel(eventId);
      this._analytics.trackEvent("event_registration_cancelled", {
        event_id: eventId,
      });
    } catch (error) {
      console.error("Failed to cancel event registration", error);
      this.errorMessage.set(
        $localize`:@@event_registration.cancel_failed:Couldn't cancel your registration. Try again in a moment.`,
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  private _requestNotificationPermission(): Promise<boolean> {
    const level = this.event().notificationPolicy;
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
}
