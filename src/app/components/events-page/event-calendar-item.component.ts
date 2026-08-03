import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { AnalyticsService } from "../../services/analytics.service";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import type { EventDiscoveryItem } from "../../services/search.service";
import { eventDiscoveryAccessibleLabel } from "./event-discovery-accessibility";
import { EventCalendarThumbnailComponent } from "./event-calendar-thumbnail.component";

@Component({
  selector: "app-event-calendar-item",
  imports: [MatIconModule, RouterLink, EventCalendarThumbnailComponent],
  templateUrl: "./event-calendar-item.component.html",
  styleUrl: "./event-calendar-item.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "[style.grid-column]": "gridColumn()",
    "[style.grid-row]": "gridRow()",
  },
})
export class EventCalendarItemComponent {
  private readonly _dateTime = inject(DateTimeFormatService);
  private readonly _analytics = inject(AnalyticsService);

  readonly event = input.required<EventDiscoveryItem>();
  readonly startColumn = input.required<number>();
  readonly span = input.required<number>();
  readonly lane = input.required<number>();
  readonly nowSeconds = input.required<number>();
  readonly continuesBefore = input(false);
  readonly continuesAfter = input(false);

  readonly gridColumn = computed(
    () => `${this.startColumn()} / span ${this.span()}`,
  );
  readonly gridRow = computed(() => String(this.lane() + 2));
  readonly route = computed(() => [
    "/events",
    this.event().slug ?? this.event().id,
  ]);
  readonly isLive = computed(() => {
    if (this.event().timing?.mode === "date_only") return false;
    const now = this.nowSeconds();
    return now >= this.event().startSeconds && now <= this.event().endSeconds;
  });
  readonly isPast = computed(
    () => this.event().endSeconds < this.nowSeconds(),
  );
  readonly accessibleLabel = computed(() => {
    const event = this.event();
    const date =
      event.timing?.mode === "date_only"
        ? this._dateTime.format(
            new Date(`${event.timing.start_date}T12:00:00.000Z`),
            { dateStyle: "full", timeZone: "UTC" },
          )
        : this._dateTime.format(event.startSeconds * 1000, {
            dateStyle: "full",
            timeZone: event.timeZone,
          });
    return eventDiscoveryAccessibleLabel(event, date);
  });

  trackClick(): void {
    const event = this.event();
    this._analytics.trackEvent("event_calendar_item_clicked", {
      event_id: event.id,
      event_slug: event.slug ?? null,
      month_span_days: this.span(),
    });
  }
}
