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
import type { EventDiscoveryItem } from "../../services/search.service";
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
})
export class EventDiscoveryCardComponent {
  private readonly _dateTime = inject(DateTimeFormatService);
  private readonly _analytics = inject(AnalyticsService);

  readonly event = input.required<EventDiscoveryItem>();
  readonly seriesById = input<Record<string, SeriesDocument>>({});

  readonly route = computed(() => [
    "/events",
    this.event().slug ?? this.event().id,
  ]);
  readonly start = computed(() => new Date(this.event().startSeconds * 1000));
  readonly end = computed(() => new Date(this.event().endSeconds * 1000));
  readonly inclusiveEnd = computed(
    () =>
      new Date(
        Math.max(
          this.start().getTime(),
          this.event().endSeconds * 1000 - 1,
        ),
      ),
  );
  readonly dateRange = computed(() =>
    this._dateTime.formatDateRange(
      this.start(),
      this.inclusiveEnd(),
      "long",
      this.event().timeZone,
    ),
  );
  readonly accessibleLabel = computed(() =>
    eventDiscoveryAccessibleLabel(this.event(), this.dateRange()),
  );
  readonly status = computed<"upcoming" | "live" | "past">(() => {
    const now = Date.now();
    if (now < this.start().getTime()) return "upcoming";
    if (now > this.end().getTime()) return "past";
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
