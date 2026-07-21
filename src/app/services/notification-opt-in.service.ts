import { Injectable, inject } from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { firstValueFrom } from "rxjs";
import type {
  NotificationPreferenceKey,
  NotificationPromptContext,
} from "../../db/schemas/NotificationSchema";
import {
  NotificationOptInDialogComponent,
  type NotificationOptInDialogResult,
} from "../components/notification-opt-in-dialog/notification-opt-in-dialog.component";
import { AnalyticsService } from "./analytics.service";
import { AuthenticationService } from "./firebase/authentication.service";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { PushNotificationsService } from "./push-notifications.service";

@Injectable({ providedIn: "root" })
export class NotificationOptInService {
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly auth = inject(AuthenticationService);
  private readonly analytics = inject(AnalyticsService);
  private readonly preferences = inject(NotificationPreferencesService);
  private readonly push = inject(PushNotificationsService);
  private readonly activePrompts = new Set<NotificationPromptContext>();

  async maybePrompt(context: NotificationPromptContext): Promise<void> {
    if (!this._shouldPrompt(context)) return;

    this.activePrompts.add(context);
    this.analytics.trackEvent("notification_prompt_shown", { context });
    try {
      const result =
        (await firstValueFrom(
          this.dialog
            .open<
              NotificationOptInDialogComponent,
              { context: NotificationPromptContext },
              NotificationOptInDialogResult
            >(NotificationOptInDialogComponent, {
              data: { context },
              width: "min(480px, calc(100vw - 32px))",
              maxWidth: "100vw",
              autoFocus: false,
            })
            .afterClosed(),
        )) ?? "dismissed";

      const accepted = result === "context" || result === "all";
      await this.preferences.applyPromptDecision(
        context,
        accepted ? "accepted" : "dismissed",
        result === "all",
      );
      this.analytics.trackEvent("notification_prompt_decided", {
        context,
        decision: result,
      });

      if (accepted && !this.push.systemAllowsNotifications()) {
        const allowed = await this.push.requestPermissionFromUserAction();
        if (!allowed) this._showSystemBlockedMessage();
      }
    } catch (error) {
      console.error("Could not complete notification opt-in", error);
      this.snackbar.open(
        $localize`:@@notification_prompt.save_error:Could not save your notification choice.`,
        $localize`:@@notification_prompt.ok:OK`,
        { duration: 5000 },
      );
    } finally {
      this.activePrompts.delete(context);
    }
  }

  private _shouldPrompt(context: NotificationPromptContext): boolean {
    const preference = this._preferenceForContext(context);
    return Boolean(
      this.auth.user.uid &&
        this.push.supported() &&
        !this.preferences.loading() &&
        !this.preferences.preferences()[preference] &&
        !this.preferences.hasHandledPrompt(context) &&
        !this.activePrompts.has(context),
    );
  }

  private _preferenceForContext(
    context: NotificationPromptContext,
  ): NotificationPreferenceKey {
    return context === "follow_activity" ? "follow_requests" : context;
  }

  private _showSystemBlockedMessage(): void {
    const ref = this.snackbar.open(
      $localize`:@@notification_prompt.system_blocked:Your notification choices are saved, but this device is blocking notifications.`,
      $localize`:@@notification_prompt.open_settings:Open settings`,
      { duration: 8000 },
    );
    ref.onAction().subscribe(() => void this.push.openSystemSettings());
  }
}
