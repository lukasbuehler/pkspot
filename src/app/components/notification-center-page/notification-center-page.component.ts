import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  effect,
  inject,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatTooltip } from "@angular/material/tooltip";
import { Router, RouterLink } from "@angular/router";
import type {
  InAppNotificationDocument,
} from "../../services/notification-center.service";
import { NotificationCenterService } from "../../services/notification-center.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";

interface NotificationViewModel {
  id: string;
  title: string;
  body: string;
  icon: string;
  path: string;
  time: string;
  unread: boolean;
}

@Component({
  selector: "app-notification-center-page",
  imports: [
    MatButtonModule,
    MatIcon,
    MatProgressSpinner,
    MatTooltip,
    RouterLink,
  ],
  templateUrl: "./notification-center-page.component.html",
  styleUrl: "./notification-center-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationCenterPageComponent {
  readonly center = inject(NotificationCenterService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthenticationService);
  private readonly authUser = toSignal(this.auth.authState$, {
    initialValue: null,
  });
  private readonly snackbar = inject(MatSnackBar);
  private readonly locale = inject(LOCALE_ID);
  private readonly relativeTime = new Intl.RelativeTimeFormat(this.locale, {
    numeric: "auto",
  });
  private loadedUserId: string | null = null;

  readonly notifications = computed(() =>
    this.center.items().map((item) => this._viewModel(item)),
  );

  constructor() {
    effect(() => {
      const userId = this.authUser()?.uid ?? null;
      if (userId && userId !== this.loadedUserId) {
        this.loadedUserId = userId;
        void this.center.refresh();
      } else if (this.auth.initialAuthStateResolved() && !userId) {
        void this.router.navigateByUrl("/account");
      }
    });
  }

  refresh(): void {
    void this.center.refresh();
  }

  open(notification: NotificationViewModel): void {
    void this.center.markRead(notification.id).catch(() => this._showError());
    void this.router.navigateByUrl(notification.path);
  }

  dismiss(notificationId: string): void {
    void this.center.dismiss(notificationId).catch(() => this._showError());
  }

  markAllRead(): void {
    void this.center.markAllRead().catch(() => this._showError());
  }

  private _viewModel(item: InAppNotificationDocument): NotificationViewModel {
    return {
      id: item.id,
      ...this._copy(item),
      path: item.path,
      time: this._relativeDate(item.created_at_raw_ms),
      unread: !item.read_at_raw_ms,
    };
  }

  private _copy(
    item: InAppNotificationDocument,
  ): Pick<NotificationViewModel, "title" | "body" | "icon"> {
    const payload = item.payload;
    switch (item.type) {
      case "follow_request":
        return {
          title: $localize`:@@notification_center.follow_request.title:Follow request`,
          body: $localize`:@@notification_center.follow_request.body:${payload["requester_name"]}:INTERPOLATION: wants to follow you.`,
          icon: "person_add",
        };
      case "event_reminder":
        return {
          title: payload["event_name"],
          body: $localize`:@@notification_center.event_reminder.body:Starts in two hours.`,
          icon: "event_upcoming",
        };
      case "event_update":
        return {
          title: $localize`:@@notification_center.event_update.title:Event updated`,
          body: `${payload["event_name"]}: ${this._eventChange(payload["change"])}`,
          icon: "event",
        };
      case "spot_edit_update":
        return {
          title:
            payload["outcome"] === "approved"
              ? $localize`:@@notification_center.spot_edit.approved_title:Spot edit approved`
              : $localize`:@@notification_center.spot_edit.rejected_title:Spot edit rejected`,
          body:
            payload["outcome"] === "approved"
              ? $localize`:@@notification_center.spot_edit.approved_body:${payload["spot_name"]}:INTERPOLATION: was approved.`
              : $localize`:@@notification_center.spot_edit.rejected_body:${payload["spot_name"]}:INTERPOLATION: was rejected.`,
          icon: payload["outcome"] === "approved" ? "task_alt" : "cancel",
        };
      case "check_in":
        return {
          title: $localize`:@@notification_center.check_in.title:Check-in`,
          body: $localize`:@@notification_center.check_in.body:${payload["user_name"]}:INTERPOLATION: checked in at ${payload["spot_name"]}:INTERPOLATION_1:.`,
          icon: "beenhere",
        };
      case "weather_alert":
        return {
          title:
            payload["title"] ||
            $localize`:@@notification_center.weather.title:Weather update`,
          body: payload["body"] || "",
          icon: "weather_mix",
        };
    }
  }

  private _eventChange(change: string): string {
    switch (change) {
      case "cancelled":
        return $localize`:@@notification_center.event_update.cancelled:cancelled`;
      case "time":
        return $localize`:@@notification_center.event_update.time:time changed`;
      case "location":
        return $localize`:@@notification_center.event_update.location:location changed`;
      default:
        return $localize`:@@notification_center.event_update.details:details changed`;
    }
  }

  private _relativeDate(timestamp: number): string {
    const difference = timestamp - Date.now();
    const absolute = Math.abs(difference);
    if (absolute < 60_000) return this.relativeTime.format(0, "second");
    if (absolute < 3_600_000) {
      return this.relativeTime.format(Math.round(difference / 60_000), "minute");
    }
    if (absolute < 86_400_000) {
      return this.relativeTime.format(Math.round(difference / 3_600_000), "hour");
    }
    if (absolute < 604_800_000) {
      return this.relativeTime.format(Math.round(difference / 86_400_000), "day");
    }
    return new Intl.DateTimeFormat(this.locale, { dateStyle: "medium" }).format(
      timestamp,
    );
  }

  private _showError(): void {
    this.snackbar.open(
      $localize`:@@notification_center.update_error:Could not update notification.`,
      $localize`:@@notification_center.dismiss_action:Dismiss`,
      { duration: 4000 },
    );
  }
}
