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
import { eventImageDisplaySrc } from "../event-display/event-display.helpers";
import { eventDiscoveryAccessibleLabel } from "./event-discovery-accessibility";

@Component({
  selector: "app-event-calendar-item",
  imports: [MatIconModule, RouterLink],
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
  readonly logoSrc = computed(() =>
    eventImageDisplaySrc(
      this.event().sponsorLogoSrc ?? this.event().logoSrc,
    ),
  );
  readonly isLive = computed(() => {
    const now = Date.now() / 1000;
    return now >= this.event().startSeconds && now <= this.event().endSeconds;
  });
  readonly accessibleLabel = computed(() => {
    const event = this.event();
    const date = this._dateTime.format(event.startSeconds * 1000, {
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
