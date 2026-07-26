import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from "@angular/core";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import type { EventSearchPreview } from "../../services/search.service";
import type { SeriesDocument } from "../../services/firebase/firestore/series.service";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { AnalyticsService } from "../../services/analytics.service";
import { eventImageDisplaySrc } from "../event-display/event-display.helpers";
import { EventRsvpComponent } from "../event-rsvp/event-rsvp.component";
import { MediaPlaceholderComponent } from "../media-placeholder/media-placeholder.component";
import { eventDiscoveryAccessibleLabel } from "./event-discovery-accessibility";

@Component({
  selector: "app-event-discovery-card",
  imports: [
    MatCardModule,
    MatIconModule,
    RouterLink,
    EventRsvpComponent,
    MediaPlaceholderComponent,
  ],
  templateUrl: "./event-discovery-card.component.html",
  styleUrl: "./event-discovery-card.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "[class.compact]": "compact()",
  },
})
export class EventDiscoveryCardComponent {
  private readonly _dateTime = inject(DateTimeFormatService);
  private readonly _analytics = inject(AnalyticsService);

  readonly event = input.required<EventSearchPreview>();
  readonly seriesById = input<Record<string, SeriesDocument>>({});
  readonly compact = input(false);

  readonly route = computed(() => [
    "/events",
    this.event().slug ?? this.event().id,
  ]);
  readonly dataIssue = computed(() => {
    const event = this.event();
    if (!event.timeZone && event.startSeconds === undefined) {
      return $localize`Local time zone and start time are missing`;
    }
    if (!event.timeZone && event.endSeconds === undefined) {
      return $localize`Local time zone and end time are missing`;
    }
    if (!event.timeZone) return $localize`Local time zone missing`;
    if (
      event.startSeconds === undefined ||
      event.endSeconds === undefined
    ) {
      return $localize`Start or end time missing`;
    }
    return null;
  });
  readonly start = computed(() => {
    const seconds = this.event().startSeconds;
    return seconds === undefined ? null : new Date(seconds * 1000);
  });
  readonly end = computed(() => {
    const seconds = this.event().endSeconds;
    return seconds === undefined ? null : new Date(seconds * 1000);
  });
  readonly dateRange = computed(() => {
    const event = this.event();
    const start = this.start();
    const end = this.end();
    if (!start || !end || !event.timeZone) return null;
    const inclusiveEnd = new Date(
      Math.max(start.getTime(), end.getTime() - 1),
    );
    return this._dateTime.formatDateRange(
      start,
      inclusiveEnd,
      "long",
      event.timeZone,
    );
  });
  readonly accessibleLabel = computed(() => {
    const event = this.event();
    const dateRange = this.dateRange();
    if (
      dateRange &&
      event.startSeconds !== undefined &&
      event.endSeconds !== undefined &&
      event.timeZone &&
      event.lifecycleStatus &&
      event.rsvpCounts
    ) {
      return eventDiscoveryAccessibleLabel(
        {
          ...event,
          startSeconds: event.startSeconds,
          endSeconds: event.endSeconds,
          timeZone: event.timeZone,
          lifecycleStatus: event.lifecycleStatus,
          rsvpCounts: event.rsvpCounts,
        },
        dateRange,
      );
    }
    return [
      event.name,
      this.dataIssue(),
      event.venueString,
      event.localityString,
    ]
      .filter(Boolean)
      .join("; ");
  });
  readonly status = computed<"upcoming" | "live" | "past" | "invalid">(() => {
    if (this.dataIssue()) return "invalid";
    const start = this.start();
    const end = this.end();
    if (!start || !end) return "invalid";
    const now = Date.now();
    if (now < start.getTime()) return "upcoming";
    if (now > end.getTime()) return "past";
    return "live";
  });
  readonly imageSrc = computed(() =>
    eventImageDisplaySrc(this.event().bannerSrc),
  );
  readonly seriesBadges = computed(() =>
    this.event().seriesIds.map((id) => ({
      id,
      label: this.seriesById()[id]?.name ?? seriesFallbackLabel(id),
      logoSrc: eventImageDisplaySrc(this.seriesById()[id]?.logo_src),
      background:
        this.seriesById()[id]?.logo_background_color ??
        "var(--mat-sys-surface-container-high)",
    })),
  );
  readonly locationLabel = computed(() =>
    [this.event().venueString, this.event().localityString]
      .filter(Boolean)
      .join(", "),
  );

  trackClick(): void {
    const event = this.event();
    this._analytics.trackEvent("event_card_clicked", {
      event_id: event.id,
      event_slug: event.slug ?? null,
      event_name: event.name,
      event_status: this.status(),
      action: "navigate",
      select_mode: false,
      is_promoted: event.isSponsored,
      external_provider: event.externalProvider ?? null,
      surface: "events_discovery",
    });
  }
}

function seriesFallbackLabel(seriesId: string): string {
  return seriesId
    .split("-")
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");
}
