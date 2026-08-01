import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatTooltip } from "@angular/material/tooltip";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import type {
  InAppNotificationDocument,
} from "../../services/notification-center.service";
import type { NotificationActionId } from "../../../db/schemas/NotificationSchema";
import { NotificationCenterService } from "../../services/notification-center.service";
import { NotificationActionsService } from "../../services/notification-actions.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { DateTimeFormatService } from "../../services/date-time-format.service";

interface NotificationViewModel {
  id: string;
  title: string;
  body: string;
  icon: string;
  path: string;
  time: string;
  unread: boolean;
  imageUrl?: string;
  actions: Array<{ id: NotificationActionId; label: string; destructive: boolean }>;
  resolvedLabel?: string;
  threadKey: string;
}

interface NotificationThreadViewModel {
  key: string;
  latest: NotificationViewModel;
  history: NotificationViewModel[];
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
  private readonly route = inject(ActivatedRoute);
  private readonly notificationActions = inject(NotificationActionsService);
  private readonly auth = inject(AuthenticationService);
  private readonly authUser = toSignal(this.auth.authState$, {
    initialValue: null,
  });
  private readonly snackbar = inject(MatSnackBar);
  private readonly locale = inject(LOCALE_ID);
  private readonly dateTime = inject(DateTimeFormatService);
  private readonly relativeTime = new Intl.RelativeTimeFormat(this.locale, {
    numeric: "auto",
  });
  private loadedUserId: string | null = null;
  private handledActionKey = "";
  readonly expandedThreads = signal<ReadonlySet<string>>(new Set());
  readonly actingIds = signal<ReadonlySet<string>>(new Set());

  readonly notifications = computed(() =>
    this.center.items().map((item) => this._viewModel(item)),
  );
  readonly threads = computed<NotificationThreadViewModel[]>(() => {
    const grouped = new Map<string, NotificationViewModel[]>();
    for (const item of this.notifications()) {
      const values = grouped.get(item.threadKey) ?? [];
      values.push(item);
      grouped.set(item.threadKey, values);
    }
    return [...grouped.entries()].map(([key, values]) => ({
      key,
      latest: values[0],
      history: values.slice(1),
    }));
  });

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
    effect(() => {
      const userId = this.authUser()?.uid;
      const notificationId = this.route.snapshot.queryParamMap.get("notification");
      const action = this.route.snapshot.queryParamMap.get("notificationAction");
      if (!userId || !notificationId || !action) return;
      const key = `${notificationId}:${action}`;
      if (this.handledActionKey === key) return;
      this.handledActionKey = key;
      if (action === "tap") {
        const returnTo = this.route.snapshot.queryParamMap.get("returnTo");
        if (returnTo?.startsWith("/")) void this.router.navigateByUrl(returnTo);
        return;
      }
      void this.performAction(notificationId, action as NotificationActionId);
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

  toggleThread(threadKey: string): void {
    this.expandedThreads.update((current) => {
      const next = new Set(current);
      if (next.has(threadKey)) next.delete(threadKey);
      else next.add(threadKey);
      return next;
    });
  }

  async performAction(
    notificationId: string,
    actionId: NotificationActionId,
  ): Promise<void> {
    if (this.actingIds().has(notificationId)) return;
    this.actingIds.update((current) => new Set(current).add(notificationId));
    try {
      await this.notificationActions.perform(notificationId, actionId);
      this.snackbar.open(this._actionSuccess(actionId), $localize`:@@notification_center.ok:OK`, {
        duration: 4000,
      });
    } catch (error) {
      console.error("Notification action failed", error);
      this._showError();
    } finally {
      this.actingIds.update((current) => {
        const next = new Set(current);
        next.delete(notificationId);
        return next;
      });
    }
  }

  private _viewModel(item: InAppNotificationDocument): NotificationViewModel {
    return {
      id: item.id,
      ...this._copy(item),
      path: item.path,
      time: this._relativeDate(item.created_at_raw_ms),
      unread: !item.read_at_raw_ms,
      imageUrl: item.image_url,
      actions: this._actions(item),
      resolvedLabel: this._resolvedLabel(item),
      threadKey: item.thread_key ?? item.id,
    };
  }

  private _actions(
    item: InAppNotificationDocument,
  ): NotificationViewModel["actions"] {
    const state = item.action_state;
    if (state?.status === "completed" && (state.undo_until_raw_ms ?? 0) > Date.now()) {
      if (state.action_id === "decline_follow_request") {
        return [{ id: "undo_decline_follow_request", label: $localize`:@@notification_center.action.undo:Undo`, destructive: false }];
      }
      if (state.action_id === "follow_back") {
        return [{ id: "undo_follow_back", label: $localize`:@@notification_center.action.undo:Undo`, destructive: false }];
      }
    }
    if (state?.status === "completed") return [];
    return (item.actions ?? []).map(({ id, destructive }) => ({
      id,
      label: this._actionLabel(id),
      destructive: destructive === true,
    }));
  }

  private _actionLabel(action: NotificationActionId): string {
    switch (action) {
      case "accept_follow_request": return $localize`:@@notification_center.action.accept:Accept`;
      case "decline_follow_request": return $localize`:@@notification_center.action.decline:Decline`;
      case "follow_back": return $localize`:@@notification_center.action.follow_back:Follow back`;
      case "mark_event_going": return $localize`:@@notification_center.action.going:I'm going`;
      case "save_event_interested": return $localize`:@@notification_center.action.save_event:Save event`;
      case "undo_decline_follow_request":
      case "undo_follow_back":
        return $localize`:@@notification_center.action.undo:Undo`;
    }
  }

  private _resolvedLabel(item: InAppNotificationDocument): string | undefined {
    if (item.action_state?.status !== "completed") return undefined;
    switch (item.action_state.action_id) {
      case "accept_follow_request": return $localize`:@@notification_center.resolved.accepted:Accepted`;
      case "decline_follow_request": return $localize`:@@notification_center.resolved.declined:Declined`;
      case "follow_back": return $localize`:@@notification_center.resolved.following:Following`;
      case "mark_event_going": return $localize`:@@notification_center.resolved.going:Going`;
      case "save_event_interested": return $localize`:@@notification_center.resolved.saved:Saved`;
      default: return undefined;
    }
  }

  private _actionSuccess(action: NotificationActionId): string {
    switch (action) {
      case "accept_follow_request": return $localize`:@@notification_center.success.accepted:Follow request accepted`;
      case "decline_follow_request": return $localize`:@@notification_center.success.declined:Follow request declined`;
      case "follow_back": return $localize`:@@notification_center.success.following:You are now following them`;
      case "undo_decline_follow_request":
      case "undo_follow_back": return $localize`:@@notification_center.success.undone:Action undone`;
      case "mark_event_going": return $localize`:@@notification_center.success.going:Marked as going`;
      case "save_event_interested": return $localize`:@@notification_center.success.saved:Event saved`;
    }
  }

  private _copy(
    item: InAppNotificationDocument,
  ): Pick<NotificationViewModel, "title" | "body" | "icon"> {
    const payload = item.payload;
    switch (item.type) {
      case "follow_request":
        return {
          title: $localize`:@@notification_center.follow_request.title:${payload["requester_name"]}:INTERPOLATION: wants to follow you`,
          body: $localize`:@@notification_center.follow_request.body:Review ${payload["requester_name"]}:INTERPOLATION:'s profile, then accept or decline.`,
          icon: "person_add",
        };
      case "follow_accepted":
        return {
          title: $localize`:@@notification_center.follow_accepted.title:${payload["followed_user_name"]}:INTERPOLATION: accepted your follow request`,
          body: $localize`:@@notification_center.follow_accepted.body:You can now see ${payload["followed_user_name"]}:INTERPOLATION:'s followers-only profile.`,
          icon: "done_all",
        };
      case "new_follower":
        if (payload["relationship"] === "mutual") {
          return {
            title: $localize`:@@notification_center.mutual_follower.title:You and ${payload["follower_name"]}:INTERPOLATION: follow each other`,
            body: $localize`:@@notification_center.mutual_follower.body:${payload["follower_name"]}:INTERPOLATION: follows you back, too.`,
            icon: "group_add",
          };
        }
        return {
          title: $localize`:@@notification_center.new_follower.title:${payload["follower_name"]}:INTERPOLATION: is following you`,
          body: $localize`:@@notification_center.new_follower.body:Take a look at ${payload["follower_name"]}:INTERPOLATION:'s profile or follow them back.`,
          icon: "person_add",
        };
      case "event_reminder":
        return {
          title: this._eventReminderTitle(
            payload["event_name"],
            Number(payload["reminder_offset_minutes"] ?? 120),
          ),
          body:
            payload["rsvp"] === "interested"
              ? $localize`:@@notification_center.event_reminder.interested_body:Still interested? Let people know if you're going.`
              : payload["venue_name"]
                ? $localize`:@@notification_center.event_reminder.venue_body:See you at ${payload["venue_name"]}:INTERPOLATION:.`
                : $localize`:@@notification_center.event_reminder.body:See you there.`,
          icon: "event_upcoming",
        };
      case "event_update":
        if (payload["update_title"]) {
          return {
            title: `${payload["event_name"]}: ${payload["update_title"]}`,
            body:
              payload["update_message"] ||
              $localize`:@@notification_center.event_update.open_body:Open the event for the latest details.`,
            icon: "campaign",
          };
        }
        return {
          ...this._eventUpdateCopy(payload),
          icon: "event",
        };
      case "event_registration_update":
        return {
          title: $localize`:@@notification_center.waitlist.title:You're in for ${payload["event_name"]}:INTERPOLATION:!`,
          body: $localize`:@@notification_center.waitlist.body:A place opened up and your registration is confirmed.`,
          icon: "event_available",
        };
      case "event_ownership_update":
        return {
          title:
            payload["update_title"] ||
            $localize`:@@notification_center.event_ownership.title:Event management update`,
          body: payload["update_message"] || payload["event_name"],
          icon: "admin_panel_settings",
        };
      case "spot_edit_update":
        return {
          title:
            payload["outcome"] === "approved"
              ? $localize`:@@notification_center.spot_edit.approved_title:Your Spot edit was approved!`
              : $localize`:@@notification_center.spot_edit.rejected_title:Your Spot edit needs another look`,
          body:
            payload["outcome"] === "approved"
              ? this._spotApprovalBody(payload)
              : $localize`:@@notification_center.spot_edit.rejected_body:The proposed change to ${payload["spot_name"]}:INTERPOLATION: wasn't approved. Review the feedback before trying again.`,
          icon: payload["outcome"] === "approved" ? "task_alt" : "cancel",
        };
      case "spot_report_update":
        return {
          title:
            payload["outcome"] === "action_taken"
              ? $localize`:@@notification_center.spot_report.action_title:Thanks for reporting ${payload["target_name"]}:INTERPOLATION:`
              : $localize`:@@notification_center.spot_report.reviewed_title:We reviewed your report`,
          body:
            payload["outcome"] === "action_taken"
              ? $localize`:@@notification_center.spot_report.action_body:We reviewed your report about ${payload["target_name"]}:INTERPOLATION: and took action.`
              : $localize`:@@notification_center.spot_report.reviewed_body:No action was needed for ${payload["target_name"]}:INTERPOLATION: based on our review.`,
          icon: "flag",
        };
      case "media_report_update":
        return {
          title:
            payload["outcome"] === "action_taken"
              ? $localize`:@@notification_center.media_report.action_title:Thanks for reporting this media`
              : $localize`:@@notification_center.media_report.reviewed_title:We reviewed your report`,
          body:
            payload["outcome"] === "action_taken"
              ? $localize`:@@notification_center.media_report.action_body:We reviewed it and took action.`
              : $localize`:@@notification_center.media_report.reviewed_body:No action was needed based on our review.`,
          icon: "flag",
        };
      case "community_info_update":
        return {
          title:
            payload["outcome"] === "approved"
              ? $localize`:@@notification_center.community_info.approved_title:${payload["community_name"]}:INTERPOLATION: info is now live`
              : $localize`:@@notification_center.community_info.rejected_title:Your community update wasn't published`,
          body:
            payload["outcome"] === "approved"
              ? $localize`:@@notification_center.community_info.approved_body:Thanks for helping keep the ${payload["community_name"]}:INTERPOLATION: community page accurate.`
              : $localize`:@@notification_center.community_info.rejected_body:Review the feedback for ${payload["community_name"]}:INTERPOLATION: before trying again.`,
          icon: payload["outcome"] === "approved" ? "task_alt" : "cancel",
        };
      case "community_event":
        return {
          title: $localize`:@@notification_center.community_event.title:${payload["event_name"]}:INTERPOLATION: is coming to ${payload["community_name"]}:INTERPOLATION_1:`,
          body: $localize`:@@notification_center.community_event.body:${payload["event_name"]}:INTERPOLATION: is a new public event in a community you follow.`,
          icon: "event_upcoming",
        };
      case "community_spot_digest":
        return {
          title: $localize`:@@notification_center.community_spot_digest.title:${payload["spot_count"]}:INTERPOLATION: new Spots worth a look`,
          body: payload["top_spot_name"]
            ? $localize`:@@notification_center.community_spot_digest.top_body:Starting with ${payload["top_spot_name"]}:INTERPOLATION: and more fresh recommendations.`
            : $localize`:@@notification_center.community_spot_digest.body:${payload["spot_count"]}:INTERPOLATION: fresh recommendations from communities you follow.`,
          icon: "location_city",
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

  private _eventReminderTitle(eventName: string, offset: number): string {
    if (offset === 1440) {
      return $localize`:@@notification_center.event_reminder.day_title:${eventName}:INTERPOLATION: is tomorrow`;
    }
    if (offset === 30) {
      return $localize`:@@notification_center.event_reminder.thirty_title:${eventName}:INTERPOLATION: starts in 30 minutes`;
    }
    return $localize`:@@notification_center.event_reminder.two_hour_title:${eventName}:INTERPOLATION: starts in 2 hours`;
  }

  private _eventUpdateCopy(
    payload: Record<string, string>,
  ): Pick<NotificationViewModel, "title" | "body"> {
    const eventName = payload["event_name"];
    switch (payload["change"]) {
      case "cancelled":
        return {
          title: $localize`:@@notification_center.event_update.cancelled_title:${eventName}:INTERPOLATION: was cancelled`,
          body: $localize`:@@notification_center.event_update.open_body:Open the event for the latest details.`,
        };
      case "restored":
        return {
          title: $localize`:@@notification_center.event_update.restored_title:${eventName}:INTERPOLATION: is back on`,
          body: $localize`:@@notification_center.event_update.restored_body:The event is active again.`,
        };
      case "time":
        return {
          title: $localize`:@@notification_center.event_update.time_title:New time for ${eventName}:INTERPOLATION:`,
          body: $localize`:@@notification_center.event_update.time_body:Check the updated date and time.`,
        };
      default:
        return {
          title: $localize`:@@notification_center.event_update.location_title:New location for ${eventName}:INTERPOLATION:`,
          body: payload["venue_name"]
            ? $localize`:@@notification_center.event_update.location_venue:The event is now at ${payload["venue_name"]}:INTERPOLATION:.`
            : $localize`:@@notification_center.event_update.location_body:Check the updated location.`,
        };
    }
  }

  private _spotApprovalBody(payload: Record<string, string>): string {
    if (payload["decision_source"] === "community_vote") {
      return $localize`:@@notification_center.spot_edit.vote_body:Thanks for improving ${payload["spot_name"]}:INTERPOLATION:. The community approved it with ${payload["yes_count"]}:INTERPOLATION_1: yes and ${payload["no_count"]}:INTERPOLATION_2: no votes.`;
    }
    if (payload["organization_name"]) {
      return $localize`:@@notification_center.spot_edit.organization_body:Thanks for improving ${payload["spot_name"]}:INTERPOLATION:. It was approved by ${payload["organization_name"]}:INTERPOLATION_1:.`;
    }
    return $localize`:@@notification_center.spot_edit.approved_body:Thanks for improving ${payload["spot_name"]}:INTERPOLATION:.`;
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
    return this.dateTime.format(timestamp, { dateStyle: "medium" });
  }

  private _showError(): void {
    this.snackbar.open(
      $localize`:@@notification_center.update_error:Could not update notification.`,
      $localize`:@@notification_center.dismiss_action:Dismiss`,
      { duration: 4000 },
    );
  }
}
