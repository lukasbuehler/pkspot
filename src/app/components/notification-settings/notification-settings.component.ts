import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import {
  MatChipSelectionChange,
  MatChipsModule,
} from "@angular/material/chips";
import { MatDialog } from "@angular/material/dialog";
import { MatIcon } from "@angular/material/icon";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatTableModule } from "@angular/material/table";
import { RouterLink } from "@angular/router";
import { distinctUntilChanged, map } from "rxjs";
import type { CommunityFollowDocument } from "../../../db/schemas/CommunityFollowSchema";
import {
  EVENT_REMINDER_OFFSET_OPTIONS,
  NOTIFICATION_PREFERENCE_KEYS,
  type EventReminderOffsetMinutes,
  type NotificationPreferenceKey,
} from "../../../db/schemas/NotificationSchema";
import { EventNotificationMigrationService } from "../../services/event-notification-migration.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { CommunityFollowsService } from "../../services/firebase/firestore/community-follows.service";
import { NotificationPreferencesService } from "../../services/notification-preferences.service";
import { PushNotificationsService } from "../../services/push-notifications.service";
import { EventNotificationSubscriptionsDialogComponent } from "../event-notification-subscriptions-dialog/event-notification-subscriptions-dialog.component";

interface NotificationPreferenceRow {
  key: NotificationPreferenceKey;
  title: string;
  description: string;
}

interface ReminderOption {
  minutes: EventReminderOffsetMinutes;
  label: string;
}

type CommunityNotificationKind = "events" | "spots";

@Component({
  selector: "app-notification-settings",
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatIcon,
    MatTableModule,
    RouterLink,
  ],
  templateUrl: "./notification-settings.component.html",
  styleUrl: "./notification-settings.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationSettingsComponent implements OnInit {
  readonly notificationPreferences = inject(NotificationPreferencesService);
  readonly pushNotifications = inject(PushNotificationsService);

  private readonly snackbar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthenticationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly communityFollowsService = inject(CommunityFollowsService);
  private readonly eventNotificationMigration = inject(
    EventNotificationMigrationService,
  );

  readonly communityFollows = signal<CommunityFollowDocument[]>([]);
  readonly savingPreferences = signal(false);
  readonly savingCommunityPreferences = signal(false);

  readonly notificationColumns = ["notification", "enabled"] as const;
  readonly communityColumns = ["community", "events", "spots"] as const;

  readonly notificationRows: readonly NotificationPreferenceRow[] = [
    {
      key: "follow_requests",
      title: $localize`:@@settings.notifications.follow_requests_heading:Follow activity`,
      description: $localize`:@@settings.notifications.follow_requests_description:Know about follow requests, new followers, and accepted requests.`,
    },
    {
      key: "event_reminders",
      title: $localize`:@@settings.notifications.event_reminders_heading:Event reminders`,
      description: $localize`:@@settings.notifications.event_reminders_description:Choose when to be reminded about events you are going to or interested in.`,
    },
    {
      key: "event_updates",
      title: $localize`:@@settings.notifications.event_updates_heading:Event updates`,
      description: $localize`:@@settings.notifications.event_updates_description:Hear about important time, location, or cancellation changes for events you responded to.`,
    },
    {
      key: "community_events",
      title: $localize`:@@settings.notifications.community_events_heading:Events in followed communities`,
      description: $localize`:@@settings.notifications.community_events_description:Push alerts for newly published public events in communities where event updates are enabled.`,
    },
    {
      key: "community_spot_digest",
      title: $localize`:@@settings.notifications.community_spots_heading:Weekly recommended Spots`,
      description: $localize`:@@settings.notifications.community_spots_description:A Friday digest of newly recommended Spots from communities where Spot updates are enabled.`,
    },
    {
      key: "spot_edit_updates",
      title: $localize`:@@settings.notifications.spot_edits_heading:Your Spot edits`,
      description: $localize`:@@settings.notifications.spot_edits_description:Know when a Spot edit you submitted is approved or rejected.`,
    },
    {
      key: "report_updates",
      title: $localize`:@@settings.notifications.reports_heading:Report updates`,
      description: $localize`:@@settings.notifications.reports_description:Know when a Spot or media report you submitted has been reviewed.`,
    },
    {
      key: "community_info_updates",
      title: $localize`:@@settings.notifications.community_info_heading:Community info submissions`,
      description: $localize`:@@settings.notifications.community_info_description:Know when community information you submitted is approved or rejected.`,
    },
  ];

  readonly reminderOptions: readonly ReminderOption[] = [
    {
      minutes: EVENT_REMINDER_OFFSET_OPTIONS[0],
      label: $localize`:@@settings.notifications.reminder_day:1 day`,
    },
    {
      minutes: EVENT_REMINDER_OFFSET_OPTIONS[1],
      label: $localize`:@@settings.notifications.reminder_two_hours:2 hours`,
    },
    {
      minutes: EVENT_REMINDER_OFFSET_OPTIONS[2],
      label: $localize`:@@settings.notifications.reminder_thirty_minutes:30 min`,
    },
  ];

  readonly allNotificationsEnabled = computed(() =>
    NOTIFICATION_PREFERENCE_KEYS.every(
      (key) => this.notificationPreferences.preferences()[key],
    ),
  );
  readonly someNotificationsEnabled = computed(() =>
    NOTIFICATION_PREFERENCE_KEYS.some(
      (key) => this.notificationPreferences.preferences()[key],
    ),
  );
  readonly notificationSelectionIndeterminate = computed(
    () => this.someNotificationsEnabled() && !this.allNotificationsEnabled(),
  );

  readonly allCommunityEventsEnabled = computed(() =>
    this.allCommunityNotificationsEnabled("events"),
  );
  readonly someCommunityEventsEnabled = computed(() =>
    this.someCommunityNotificationsEnabled("events"),
  );
  readonly communityEventsIndeterminate = computed(
    () =>
      this.someCommunityEventsEnabled() && !this.allCommunityEventsEnabled(),
  );
  readonly allCommunitySpotsEnabled = computed(() =>
    this.allCommunityNotificationsEnabled("spots"),
  );
  readonly someCommunitySpotsEnabled = computed(() =>
    this.someCommunityNotificationsEnabled("spots"),
  );
  readonly communitySpotsIndeterminate = computed(
    () =>
      this.someCommunitySpotsEnabled() && !this.allCommunitySpotsEnabled(),
  );

  ngOnInit(): void {
    this.auth.authState$
      .pipe(
        map((user) => user?.uid ?? null),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((userId) => {
        if (userId) void this.loadCommunityFollows();
        else this.communityFollows.set([]);
      });
  }

  preferenceEnabled(key: NotificationPreferenceKey): boolean {
    return this.notificationPreferences.preferences()[key];
  }

  async setNotificationPreference(
    key: NotificationPreferenceKey,
    enabled: boolean,
  ): Promise<boolean> {
    return this.saveNotificationPreferences([key], enabled);
  }

  async setAllNotificationPreferences(enabled: boolean): Promise<void> {
    await this.saveNotificationPreferences(
      NOTIFICATION_PREFERENCE_KEYS,
      enabled,
    );
  }

  reminderOffsetEnabled(offset: EventReminderOffsetMinutes): boolean {
    return this.notificationPreferences
      .preferences()
      .event_reminder_offsets_minutes.includes(offset);
  }

  onReminderSelectionChange(
    offset: EventReminderOffsetMinutes,
    event: MatChipSelectionChange,
  ): void {
    if (!event.isUserInput) return;

    const current =
      this.notificationPreferences.preferences().event_reminder_offsets_minutes;
    const next = event.selected
      ? [...current, offset]
      : current.filter((value) => value !== offset);
    void this.notificationPreferences
      .setDefaultEventReminderOffsets(next)
      .then(() =>
        this.notificationPreferences.preferences().event_reminders
          ? this.eventNotificationMigration.reconcile()
          : undefined,
      )
      .catch((error: unknown) => {
        console.error("Error saving reminder times:", error);
        this.showPreferenceSaveError();
      });
  }

  async setCommunityNotification(
    follow: CommunityFollowDocument,
    kind: CommunityNotificationKind,
    enabled: boolean,
  ): Promise<void> {
    this.savingCommunityPreferences.set(true);
    try {
      if (enabled && !(await this.ensureGlobalCommunityPreference(kind))) {
        return;
      }
      await this.communityFollowsService.setNotifications(
        follow.community_key,
        this.communitySettings(kind, enabled),
      );
      this.updateCommunityFollows(new Set([follow.community_key]), kind, enabled);
    } catch (error: unknown) {
      console.error("Error saving community notification preference:", error);
      this.showCommunitySaveError();
    } finally {
      this.savingCommunityPreferences.set(false);
    }
  }

  async setAllCommunityNotifications(
    kind: CommunityNotificationKind,
    enabled: boolean,
  ): Promise<void> {
    const follows = this.communityFollows();
    if (follows.length === 0) return;

    this.savingCommunityPreferences.set(true);
    try {
      if (enabled && !(await this.ensureGlobalCommunityPreference(kind))) {
        return;
      }
      const results = await Promise.allSettled(
        follows.map((follow) =>
          this.communityFollowsService.setNotifications(
            follow.community_key,
            this.communitySettings(kind, enabled),
          ),
        ),
      );
      const savedCommunityKeys = new Set(
        follows
          .filter((_, index) => results[index].status === "fulfilled")
          .map((follow) => follow.community_key),
      );
      this.updateCommunityFollows(savedCommunityKeys, kind, enabled);
      if (results.some((result) => result.status === "rejected")) {
        this.showCommunitySaveError();
      }
    } finally {
      this.savingCommunityPreferences.set(false);
    }
  }

  openNotificationSystemSettings(): void {
    void this.pushNotifications.openSystemSettings().catch((error: unknown) => {
      console.error("Could not open system notification settings", error);
    });
  }

  openEventNotificationSubscriptions(): void {
    this.dialog.open(EventNotificationSubscriptionsDialogComponent, {
      width: "min(640px, calc(100vw - 32px))",
      maxWidth: "100vw",
      maxHeight: "calc(100vh - 32px)",
      autoFocus: false,
    });
  }

  private async saveNotificationPreferences(
    keys: readonly NotificationPreferenceKey[],
    enabled: boolean,
  ): Promise<boolean> {
    this.savingPreferences.set(true);
    try {
      let systemEnabled = this.pushNotifications.systemAllowsNotifications();
      if (enabled && !systemEnabled) {
        systemEnabled =
          await this.pushNotifications.requestPermissionFromUserAction();
      }

      await this.notificationPreferences.setPreferences(keys, enabled);
      if (
        enabled &&
        keys.some(
          (key) => key === "event_reminders" || key === "event_updates",
        )
      ) {
        await this.eventNotificationMigration.reconcile();
      }
      if (enabled && !systemEnabled) {
        this.snackbar.open(
          $localize`:@@settings.notifications.system_blocked_snackbar:PK Spot notifications are enabled, but your device is blocking them. You can allow them in system settings.`,
          $localize`:@@settings.notifications.ok:OK`,
          { duration: 7000 },
        );
      }
      return true;
    } catch (error: unknown) {
      console.error("Error saving notification preference:", error);
      this.showPreferenceSaveError();
      return false;
    } finally {
      this.savingPreferences.set(false);
    }
  }

  private async ensureGlobalCommunityPreference(
    kind: CommunityNotificationKind,
  ): Promise<boolean> {
    const key =
      kind === "events" ? "community_events" : "community_spot_digest";
    return this.preferenceEnabled(key)
      ? true
      : this.setNotificationPreference(key, true);
  }

  private communitySettings(
    kind: CommunityNotificationKind,
    enabled: boolean,
  ): {
    eventNotifications?: boolean;
    spotDigestNotifications?: boolean;
  } {
    return kind === "events"
      ? { eventNotifications: enabled }
      : { spotDigestNotifications: enabled };
  }

  private updateCommunityFollows(
    communityKeys: ReadonlySet<string>,
    kind: CommunityNotificationKind,
    enabled: boolean,
  ): void {
    this.communityFollows.update((items) =>
      items.map((item) =>
        communityKeys.has(item.community_key)
          ? {
              ...item,
              ...(kind === "events"
                ? { event_notifications: enabled }
                : { spot_digest_notifications: enabled }),
            }
          : item,
      ),
    );
  }

  private allCommunityNotificationsEnabled(
    kind: CommunityNotificationKind,
  ): boolean {
    const follows = this.communityFollows();
    return (
      follows.length > 0 &&
      follows.every((follow) => this.communityNotificationEnabled(follow, kind))
    );
  }

  private someCommunityNotificationsEnabled(
    kind: CommunityNotificationKind,
  ): boolean {
    return this.communityFollows().some((follow) =>
      this.communityNotificationEnabled(follow, kind),
    );
  }

  private communityNotificationEnabled(
    follow: CommunityFollowDocument,
    kind: CommunityNotificationKind,
  ): boolean {
    return kind === "events"
      ? follow.event_notifications === true
      : follow.spot_digest_notifications === true;
  }

  private async loadCommunityFollows(): Promise<void> {
    try {
      this.communityFollows.set(await this.communityFollowsService.listMine());
    } catch (error: unknown) {
      console.warn("Could not load followed communities", error);
      this.communityFollows.set([]);
    }
  }

  private showPreferenceSaveError(): void {
    this.snackbar.open(
      $localize`:@@settings.notifications.save_error:Could not save notification preference.`,
      $localize`:@@settings.notifications.ok:OK`,
      { duration: 5000 },
    );
  }

  private showCommunitySaveError(): void {
    this.snackbar.open(
      $localize`:@@settings.notifications.community_save_error:Could not save community notification preference.`,
      $localize`:@@settings.notifications.ok:OK`,
      { duration: 5000 },
    );
  }
}
