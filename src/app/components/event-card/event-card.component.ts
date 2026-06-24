import { NgOptimizedImage, NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { LocaleCode } from "../../../db/models/Interfaces";
import { Event as PkEvent } from "../../../db/models/Event";
import { MediaPlaceholderComponent } from "../media-placeholder/media-placeholder.component";
import { EventRsvpComponent } from "../event-rsvp/event-rsvp.component";
import { MatTooltip } from "@angular/material/tooltip";
import { formatDateRange } from "../../../scripts/Helpers";
import { SeriesDocument } from "../../services/firebase/firestore/series.service";
import {
  eventImageDisplaySrc,
  eventStatusLabel,
  type EventStatus,
} from "../event-display/event-display.helpers";
import { AnalyticsService } from "../../services/analytics.service";

@Component({
  selector: "app-event-card",
  imports: [
    NgOptimizedImage,
    NgTemplateOutlet,
    MatCardModule,
    MatIconModule,
    RouterLink,
    MediaPlaceholderComponent,
    EventRsvpComponent,
    MatTooltip,
  ],
  templateUrl: "./event-card.component.html",
  styleUrl: "./event-card.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventCardComponent {
  private _locale = inject<LocaleCode>(LOCALE_ID);
  private _analytics = inject(AnalyticsService);

  event = input.required<PkEvent>();
  seriesById = input<Record<string, SeriesDocument>>({});
  selectMode = input(false);
  showVenue = input(true);
  select = output<PkEvent>();

  readonly status = computed<EventStatus>(() => this.event().status());
  readonly dateRange = computed(() => {
    const event = this.event();
    return formatDateRange(event.start, event.end, this._locale, "long");
  });
  readonly route = computed(() => [
    "/events",
    this.event().slug ?? this.event().id,
  ]);
  readonly href = computed(
    () => `/events/${encodeURIComponent(this.event().slug ?? this.event().id)}`,
  );
  readonly statusLabel = computed(() =>
    eventStatusLabel(this.event(), this.status(), this._locale, "compact"),
  );
  readonly bannerImageSrc = computed(() => {
    const bannerSrc = this.event().bannerSrc;
    return eventImageDisplaySrc(bannerSrc);
  });
  readonly seriesBadges = computed(() =>
    this.event().seriesIds.map((seriesId) => {
      const series = this.seriesById()[seriesId];
      return {
        id: seriesId,
        label: series?.name ?? this._seriesFallbackLabel(seriesId),
        shortLabel: this._seriesShortLabel(series?.name ?? seriesId),
        logoSrc: eventImageDisplaySrc(series?.logo_src),
        background:
          series?.logo_background_color ??
          "var(--mat-sys-surface-container-high)",
      };
    }),
  );

  onSelectClick(event: MouseEvent): void {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    this.trackEventCardClick("panel_select");
    this.select.emit(this.event());
  }

  trackEventCardClick(action: "navigate" | "panel_select"): void {
    const event = this.event();
    this._analytics.trackEvent("event_card_clicked", {
      event_id: event.id,
      event_slug: event.slug ?? null,
      event_name: event.name,
      event_status: event.status(),
      action,
      select_mode: this.selectMode(),
      is_promoted: event.isPromoted,
      external_provider: event.externalSource?.provider ?? null,
    });
  }

  private _seriesShortLabel(label: string): string {
    const normalized = label.trim().toLowerCase();
    if (normalized === "parkour-earth" || normalized === "parkour earth") {
      return "PKE";
    }
    if (
      normalized === "sport-parkour-league" ||
      normalized === "sport parkour league"
    ) {
      return "SPL";
    }
    if (
      normalized === "swiss-parkour-tour" ||
      normalized === "swiss parkour tour"
    ) {
      return "SPT";
    }
    return label
      .split(/[\s-]+/u)
      .filter(Boolean)
      .slice(0, 3)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("");
  }

  private _seriesFallbackLabel(seriesId: string): string {
    return seriesId
      .split("-")
      .filter(Boolean)
      .map((word) => word[0]?.toUpperCase() + word.slice(1))
      .join(" ");
  }
}
