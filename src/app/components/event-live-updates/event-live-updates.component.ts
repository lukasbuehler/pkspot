import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormField, form, maxLength, required, submit } from "@angular/forms/signals";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar } from "@angular/material/snack-bar";
import { RouterLink } from "@angular/router";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventLiveUpdate } from "../../../db/models/EventLiveUpdate";
import {
  EVENT_LIVE_UPDATE_MESSAGE_MAX_LENGTH,
  EVENT_LIVE_UPDATE_TITLE_MAX_LENGTH,
  type EventLiveUpdateType,
} from "../../../db/schemas/EventLiveUpdateSchema";
import { AnalyticsService } from "../../services/analytics.service";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventLiveUpdatesService } from "../../services/firebase/firestore/event-live-updates.service";
import { NotificationPreferencesService } from "../../services/notification-preferences.service";
import { PushNotificationsService } from "../../services/push-notifications.service";

interface UpdateTypeOption {
  type: EventLiveUpdateType;
  label: string;
  defaultTitle: string;
}

const UPDATE_TYPE_OPTIONS: readonly UpdateTypeOption[] = [
  { type: "meet_up_time", label: $localize`Meet-up time`, defaultTitle: $localize`Meet-up time updated` },
  { type: "location_spot_change", label: $localize`Location/Spot change`, defaultTitle: $localize`Meet-up location changed` },
  { type: "schedule_change", label: $localize`Schedule change`, defaultTitle: $localize`Schedule updated` },
  { type: "weather_update", label: $localize`Weather update`, defaultTitle: $localize`Weather update` },
  { type: "session_starting_soon", label: $localize`Session starting soon`, defaultTitle: $localize`Session starting soon` },
  { type: "general_update", label: $localize`General event update`, defaultTitle: $localize`Event update` },
];

@Component({
  selector: "app-event-live-updates",
  imports: [
    FormField,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RouterLink,
  ],
  templateUrl: "./event-live-updates.component.html",
  styleUrl: "./event-live-updates.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventLiveUpdatesComponent {
  private readonly auth = inject(AuthenticationService);
  private readonly liveUpdates = inject(EventLiveUpdatesService);
  private readonly preferences = inject(NotificationPreferencesService);
  private readonly push = inject(PushNotificationsService);
  private readonly analytics = inject(AnalyticsService);
  private readonly dateTime = inject(DateTimeFormatService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly viewedUpdateIds = new Set<string>();
  private authorizationRequest = 0;

  readonly event = input.required<PkEvent>();

  private readonly userIdState = signal(this.auth.user.uid ?? "");
  private readonly storedUpdates = signal<EventLiveUpdate[]>([]);
  readonly updates = this.storedUpdates.asReadonly();
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly subscribed = signal(false);
  readonly subscriptionLoading = signal(false);
  readonly subscriptionFailed = signal(false);
  readonly canPublish = signal(false);
  readonly publishing = signal(false);
  readonly previewing = signal(false);
  readonly userId = this.userIdState.asReadonly();
  readonly isSignedIn = computed(() => Boolean(this.userIdState()));
  readonly pushUnavailable = computed(
    () => this.push.permissionState() === "unsupported" || !this.push.supported(),
  );
  readonly pushBlocked = computed(() => this.push.blockedBySystem());
  readonly signInQueryParams = computed(() => ({
    returnUrl: `/events/${this.event().slug ?? this.event().id}`,
  }));
  readonly updateTypeOptions = UPDATE_TYPE_OPTIONS;
  readonly titleMaxLength = EVENT_LIVE_UPDATE_TITLE_MAX_LENGTH;
  readonly messageMaxLength = EVENT_LIVE_UPDATE_MESSAGE_MAX_LENGTH;

  readonly formModel = signal({
    type: "general_update" as EventLiveUpdateType,
    title: UPDATE_TYPE_OPTIONS.at(-1)?.defaultTitle ?? "Event update",
    message: "",
    scheduledFor: "",
    eventSpotId: "",
  });
  readonly updateForm = form(this.formModel, (fields) => {
    required(fields.type);
    required(fields.title, { message: $localize`Add a short title.` });
    maxLength(fields.title, EVENT_LIVE_UPDATE_TITLE_MAX_LENGTH);
    maxLength(fields.message, EVENT_LIVE_UPDATE_MESSAGE_MAX_LENGTH);
  });

  readonly linkedSpots = computed(() => [
    ...this.event().inlineSpots.map((spot) => ({ id: spot.id, name: spot.name })),
    ...this.event().spotIds.map((id) => ({ id, name: id })),
  ]);

  constructor() {
    this.auth.authState$
      .pipe(takeUntilDestroyed())
      .subscribe((user) => this.userIdState.set(user?.uid ?? ""));

    effect((onCleanup) => {
      const eventId = this.event().id;
      this.loading.set(true);
      this.failed.set(false);
      const subscription = this.liveUpdates.observeUpdates(eventId).subscribe({
        next: (updates) => {
          this.storedUpdates.set(updates);
          this.loading.set(false);
          for (const update of updates) {
            if (this.viewedUpdateIds.has(update.id)) continue;
            this.viewedUpdateIds.add(update.id);
            this.analytics.trackEvent("live_update_viewed", {
              event_id: eventId,
              update_type: update.type,
            });
          }
        },
        error: (error) => {
          console.warn("Failed to observe event live updates", error);
          this.loading.set(false);
          this.failed.set(true);
        },
      });
      onCleanup(() => subscription.unsubscribe());
    });

    effect((onCleanup) => {
      const eventId = this.event().id;
      const userId = this.userIdState();
      this.subscribed.set(false);
      this.subscriptionFailed.set(false);
      if (!userId) return;
      const subscription = this.liveUpdates
        .observeSubscription(eventId, userId)
        .subscribe({
          next: (active) => this.subscribed.set(active),
          error: (error) => {
            console.warn("Failed to observe event live update subscription", error);
            this.subscriptionFailed.set(true);
          },
        });
      onCleanup(() => subscription.unsubscribe());
    });

    effect(() => {
      const event = this.event();
      const userId = this.userIdState();
      const request = ++this.authorizationRequest;
      this.canPublish.set(false);
      if (!userId) {
        return;
      }
      void this.liveUpdates.canCurrentUserPublish(event).then(
        (allowed) => {
          if (request !== this.authorizationRequest) return;
          this.canPublish.set(allowed);
        },
        (error) => {
          if (request !== this.authorizationRequest) return;
          console.warn("Failed to check event organizer membership", error);
          this.canPublish.set(false);
        },
      );
    });
  }

  async enableUpdates(): Promise<void> {
    if (!this.isSignedIn() || this.subscriptionLoading()) return;
    this.subscriptionLoading.set(true);
    this.subscriptionFailed.set(false);
    try {
      await this.liveUpdates.setSubscription(this.event().id, true);
      await this.preferences.setPreference("event_updates", true);
      this.analytics.trackEvent("live_update_opt_in", { event_id: this.event().id });
      if (this.push.supported() && !this.push.systemAllowsNotifications()) {
        await this.push.requestPermissionFromUserAction();
      }
    } catch (error) {
      console.error("Could not enable event live updates", error);
      this.subscriptionFailed.set(true);
      this.snackbar.open($localize`Could not enable live updates. Please try again.`, $localize`Dismiss`, { duration: 5000 });
    } finally {
      this.subscriptionLoading.set(false);
    }
  }

  async disableUpdates(): Promise<void> {
    if (this.subscriptionLoading()) return;
    this.subscriptionLoading.set(true);
    try {
      await this.liveUpdates.setSubscription(this.event().id, false);
      this.analytics.trackEvent("live_update_opt_out", { event_id: this.event().id });
    } catch (error) {
      console.error("Could not disable event live updates", error);
      this.snackbar.open($localize`Could not turn off live updates. Please try again.`, $localize`Dismiss`, { duration: 5000 });
    } finally {
      this.subscriptionLoading.set(false);
    }
  }

  updateTypeChanged(event: globalThis.Event): void {
    const type = (event.target as HTMLSelectElement).value as EventLiveUpdateType;
    const option = UPDATE_TYPE_OPTIONS.find((candidate) => candidate.type === type);
    if (!option) return;
    this.formModel.update((model) => ({ ...model, type, title: option.defaultTitle }));
  }

  showPreview(): void {
    submit(this.updateForm, async () => this.previewing.set(true));
  }

  cancelPreview(): void {
    this.previewing.set(false);
  }

  async publishUpdate(): Promise<void> {
    if (!this.canPublish() || this.publishing()) return;
    this.publishing.set(true);
    const model = this.formModel();
    try {
      await this.liveUpdates.publish({
        eventId: this.event().id,
        type: model.type,
        title: model.title,
        ...(model.message.trim() ? { message: model.message.trim() } : {}),
        ...(model.scheduledFor ? { scheduledFor: new Date(model.scheduledFor).toISOString() } : {}),
        ...(model.eventSpotId ? { eventSpotId: model.eventSpotId } : {}),
      });
      this.analytics.trackEvent("live_update_published", {
        event_id: this.event().id,
        update_type: model.type,
      });
      this.previewing.set(false);
      this.formModel.set({
        type: "general_update",
        title: UPDATE_TYPE_OPTIONS.at(-1)?.defaultTitle ?? "Event update",
        message: "",
        scheduledFor: "",
        eventSpotId: "",
      });
      this.snackbar.open($localize`Live update published.`, $localize`Dismiss`, { duration: 4000 });
    } catch (error) {
      console.error("Could not publish event live update", error);
      this.snackbar.open(
        error instanceof Error ? error.message : $localize`Could not publish the live update.`,
        $localize`Dismiss`,
        { duration: 6000 },
      );
    } finally {
      this.publishing.set(false);
    }
  }

  updateTypeLabel(type: EventLiveUpdateType): string {
    return UPDATE_TYPE_OPTIONS.find((option) => option.type === type)?.label ?? type;
  }

  formatTimestamp(date: Date): string {
    return this.dateTime.formatPreset(date, "short");
  }

  linkedSpotName(spotId: string | undefined): string {
    return this.linkedSpots().find((spot) => spot.id === spotId)?.name ?? spotId ?? "";
  }
}
