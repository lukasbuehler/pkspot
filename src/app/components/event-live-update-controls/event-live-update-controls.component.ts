import { DOCUMENT } from "@angular/common";
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
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Event as PkEvent } from "../../../db/models/Event";
import type { EventNotificationLevel } from "../../../db/schemas/EventLiveUpdateSchema";
import { AnalyticsService } from "../../services/analytics.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventLiveUpdatesService } from "../../services/firebase/firestore/event-live-updates.service";
import { PushNotificationsService } from "../../services/push-notifications.service";

const escapeCalendarText = (value: string): string =>
  value
    .replace(/\\/gu, "\\\\")
    .replace(/\r?\n/gu, "\\n")
    .replace(/,/gu, "\\,")
    .replace(/;/gu, "\\;");

const calendarTimestamp = (date: Date): string =>
  date.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");

export const buildEventCalendar = (event: PkEvent): string => {
  const location = [event.venueString, event.localityString]
    .filter(Boolean)
    .join(", ");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PK Spot//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:event-${event.id}@pkspot.app`,
    `DTSTAMP:${calendarTimestamp(new Date())}`,
    `DTSTART:${calendarTimestamp(event.start)}`,
    `DTEND:${calendarTimestamp(event.end)}`,
    `SUMMARY:${escapeCalendarText(event.name)}`,
    ...(location ? [`LOCATION:${escapeCalendarText(location)}`] : []),
    ...(event.description
      ? [`DESCRIPTION:${escapeCalendarText(event.description)}`]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
};

@Component({
  selector: "app-event-live-update-controls",
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: "./event-live-update-controls.component.html",
  styleUrl: "./event-live-update-controls.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventLiveUpdateControlsComponent {
  private readonly auth = inject(AuthenticationService);
  private readonly liveUpdates = inject(EventLiveUpdatesService);
  private readonly push = inject(PushNotificationsService);
  private readonly analytics = inject(AnalyticsService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly document = inject(DOCUMENT);

  readonly event = input.required<PkEvent>();
  readonly notificationLevel = signal<EventNotificationLevel>("all");
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly failed = signal(false);
  readonly liveUpdatesAvailable = computed(
    () => Boolean(this.event().organizer) && this.event().published,
  );
  readonly notificationIcon = computed(() =>
    this.notificationLevel() === "none" ? "notifications_off" : "notifications",
  );
  readonly usesSpecificNotificationIcon = computed(() => {
    const level = this.notificationLevel();
    return level === "event_updates" || level === "reminders";
  });
  private readonly userId = signal(this.auth.user.uid ?? "");

  constructor() {
    this.auth.authState$
      .pipe(takeUntilDestroyed())
      .subscribe((user) => this.userId.set(user?.uid ?? ""));

    effect((onCleanup) => {
      const eventId = this.event().id;
      const userId = this.userId();
      this.loading.set(Boolean(userId));
      this.failed.set(false);
      if (!userId) return;
      const subscription = this.liveUpdates
        .observeNotificationLevel(eventId, userId)
        .subscribe({
          next: (level) => {
            this.notificationLevel.set(level ?? "all");
            this.loading.set(false);
          },
          error: (error) => {
            console.warn(
              "Failed to observe event notification preference",
              error,
            );
            this.loading.set(false);
            this.failed.set(true);
          },
        });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  notificationPreferenceChanged(level: EventNotificationLevel): void {
    if (this.saving()) return;
    void this.saveNotificationLevel(level, true);
  }

  private async saveNotificationLevel(
    level: EventNotificationLevel,
    userInitiated: boolean,
  ): Promise<void> {
    const previous = this.notificationLevel();
    this.notificationLevel.set(level);
    this.saving.set(true);
    this.failed.set(false);
    try {
      await this.liveUpdates.setNotificationLevel(this.event().id, level);
      if (userInitiated && level !== "none") {
        if (this.push.supported() && !this.push.systemAllowsNotifications()) {
          await this.push.requestPermissionFromUserAction();
        }
      }
      if (userInitiated) {
        this.analytics.trackEvent(
          level === "none" ? "live_update_opt_out" : "live_update_opt_in",
          { event_id: this.event().id, notification_level: level },
        );
      }
    } catch (error) {
      console.error("Could not update event notifications", error);
      this.notificationLevel.set(previous);
      this.failed.set(true);
      this.snackbar.open(
        $localize`Could not update event notifications. Please try again.`,
        $localize`Dismiss`,
        { duration: 5000 },
      );
    } finally {
      this.saving.set(false);
    }
  }

  addToCalendar(): void {
    const event = this.event();
    const blob = new Blob([buildEventCalendar(event)], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = this.document.createElement("a");
    anchor.href = url;
    anchor.download = `${event.slug ?? event.id}.ics`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.analytics.trackEvent("event_calendar_added", { event_id: event.id });
  }
}
