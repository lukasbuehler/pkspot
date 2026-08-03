import { Injectable, inject } from "@angular/core";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Router } from "@angular/router";
import type {
  EventNotificationMigrationStateResponse,
  ReconcileEventNotificationsResponse,
} from "../../db/schemas/NotificationSchema";
import { AnalyticsService } from "./analytics.service";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";
import { NotificationOptInService } from "./notification-opt-in.service";

interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_DISABLE_NOTIFICATION_PROMPTS__?: boolean;
}

@Injectable({ providedIn: "root" })
export class EventNotificationMigrationService {
  private readonly optIn = inject(NotificationOptInService);
  private readonly functions = inject(FunctionsAdapterService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly analytics = inject(AnalyticsService);
  private prompting = false;

  async maybePrompt(upcomingEventCount: number): Promise<void> {
    if (
      (globalThis as ScreenshotGlobal)
        .__PKSPOT_SCREENSHOT_DISABLE_NOTIFICATION_PROMPTS__ === true
    ) {
      return;
    }
    if (this.prompting) return;
    this.prompting = true;
    try {
      const count = upcomingEventCount > 0
        ? upcomingEventCount
        : (await this.functions.call<
            Record<string, never>,
            EventNotificationMigrationStateResponse
          >("getMyEventNotificationMigrationState", {})).eligibleEventCount;
      if (count < 1) return;
      const result = await this.optIn.maybePrompt(
        "event_notifications_migration",
        { upcomingEventCount: count },
      );
      if (result === "customize") {
        await this.router.navigate(["/settings/notifications"]);
        return;
      }
      if (result !== "context" && result !== "all") return;
      await this.reconcile();
    } catch (error) {
      console.error("Could not migrate event notifications", error);
      this.snackbar.open(
        $localize`:@@notification_prompt.event_migration.error:Event notifications could not be enabled for your saved events.`,
        $localize`:@@notification_prompt.ok:OK`,
        { duration: 5000 },
      );
    } finally {
      this.prompting = false;
    }
  }

  async reconcile(): Promise<ReconcileEventNotificationsResponse> {
    const outcome = await this.functions.call<
      Record<string, never>,
      ReconcileEventNotificationsResponse
    >("reconcileMyEventNotifications", {});
    this.analytics.trackEvent("event_notification_migration_reconciled", {
      eligible_event_count: outcome.eligibleEventCount,
      created_subscription_count: outcome.createdSubscriptionCount,
      scheduled_reminder_count: outcome.scheduledReminderCount,
    });
    return outcome;
  }
}
