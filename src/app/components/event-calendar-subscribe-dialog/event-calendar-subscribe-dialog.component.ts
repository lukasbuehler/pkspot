import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatSnackBar } from "@angular/material/snack-bar";
import { RouterLink } from "@angular/router";
import type { EventCalendarSubscribeLinks } from "../../shared/event-calendar-subscribe";
import { AnalyticsService } from "../../services/analytics.service";

export interface EventCalendarSubscribeDialogData {
  links: EventCalendarSubscribeLinks;
  /** Human summary of the active filters, or empty for all events. */
  filterSummary: string;
  /**
   * Query parameters that open the embed configurator with these filters.
   * Omitted inside an embed, where offering another embed would be confusing.
   */
  embedQueryParams?: Record<string, string>;
}

type SubscribeTarget = "google" | "apple" | "outlook" | "copy";

/**
 * Explains and offers the iCal subscription for the current event filters.
 * Subscribing keeps the calendar app in sync; downloading a file would not.
 */
@Component({
  selector: "app-event-calendar-subscribe-dialog",
  imports: [
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    RouterLink,
  ],
  templateUrl: "./event-calendar-subscribe-dialog.component.html",
  styleUrl: "./event-calendar-subscribe-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventCalendarSubscribeDialogComponent {
  readonly data = inject<EventCalendarSubscribeDialogData>(MAT_DIALOG_DATA);
  private readonly _analytics = inject(AnalyticsService);
  private readonly _snackBar = inject(MatSnackBar);

  track(target: SubscribeTarget): void {
    this._analytics.trackEvent("event_calendar_subscribe_clicked", {
      target,
      filtered: !!this.data.filterSummary,
    });
  }

  async copyFeedUrl(): Promise<void> {
    this.track("copy");
    try {
      await navigator.clipboard.writeText(this.data.links.feedUrl);
      this._snackBar.open($localize`Calendar link copied`, undefined, {
        duration: 2500,
      });
    } catch {
      this._snackBar.open(
        $localize`Could not copy the link. Select it and copy it manually.`,
        undefined,
        { duration: 4000 },
      );
    }
  }
}
