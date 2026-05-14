import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from "@angular/core";
import { NgOptimizedImage } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { LocaleCode } from "../../../db/models/Interfaces";
import { Event as PkEvent } from "../../../db/models/Event";
import { CountdownComponent } from "../countdown/countdown.component";
import { MapInfoPanelComponent } from "../map-info-panel/map-info-panel.component";
import { MediaPlaceholderComponent } from "../media-placeholder/media-placeholder.component";

/**
 * Event preview panel for the map page sidebar (desktop) or bottom-sheet
 * (mobile). It shares the spot details header behavior so the collapsed
 * bottom-sheet keeps the title visible while secondary info fades with the
 * sheet progress.
 *
 * For the full event experience (map, spot list, challenges, etc.) the
 * card has a "See full event" CTA that routes to /events/<slug>.
 */
@Component({
  selector: "app-event-preview",
  imports: [
    NgOptimizedImage,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    CountdownComponent,
    MapInfoPanelComponent,
    MediaPlaceholderComponent,
  ],
  templateUrl: "./event-preview.component.html",
  styleUrl: "./event-preview.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventPreviewComponent {
  private _locale = inject<LocaleCode>(LOCALE_ID);

  /** The event to render. */
  event = input.required<PkEvent>();

  /** Drives the same secondary-info fade used by the spot bottom sheet. */
  openProgress = input<number>(1);

  /** Allow the host to dismiss the preview (e.g. close button → clear selection). */
  dismissable = input<boolean>(true);
  /** Optional browser-history back target shown when this preview came from another panel. */
  backLabel = input<string | null>(null);
  backTypeLabel = input<string | null>(null);
  /** Emitted when the user dismisses the preview. */
  dismiss = output<void>();
  /** Emitted when the user taps the preview's contextual back button. */
  back = output<void>();

  readonly hasValidDates = computed(() => {
    const e = this.event();
    return (
      Number.isFinite(e.start.getTime()) && Number.isFinite(e.end.getTime())
    );
  });
  readonly status = computed<"upcoming" | "live" | "past" | null>(() =>
    this.hasValidDates() ? this.event().status() : null
  );

  readonly countdownTarget = computed<Date | null>(() => {
    const e = this.event();
    if (!this.hasValidDates()) return null;
    const status = this.status();
    if (status === "upcoming") return e.start;
    if (status === "live") return e.end;
    return null;
  });

  readonly dateRange = computed(() => {
    const e = this.event();
    if (!this.hasValidDates()) return "";
    const start = e.start.toLocaleDateString(this._locale, {
      dateStyle: "medium",
    });
    const end = e.end.toLocaleDateString(this._locale, {
      dateStyle: "medium",
    });
    return start === end ? start : `${start} – ${end}`;
  });

  readonly venueLine = computed(() => {
    const e = this.event();
    return [e.venueString, e.localityString].filter(Boolean).join(", ");
  });

  readonly eventIcon = computed(() =>
    this.event().isSponsored ? "paid" : "event",
  );
  readonly eventIconTooltip = computed(() =>
    this.event().isSponsored
      ? $localize`:@@event_preview.sponsored_tooltip:Sponsored event`
      : $localize`:@@event_preview.event_tooltip:Event`,
  );

  readonly fullEventLink = computed(() => {
    const e = this.event();
    return ["/events", e.slug ?? e.id];
  });

  /**
   * Provider-aware label for the external-source CTA. Localized once in
   * the host so the template stays declarative.
   */
  readonly externalSourceLabel = computed<string | null>(() => {
    const source = this.event().externalSource;
    if (!source) return null;
    switch (source.provider) {
      case "eventfrog":
        return $localize`:@@event_preview.view_eventfrog:View on EventFrog`;
      case "spt":
        return $localize`:@@event_preview.view_spt:View on Swiss Parkour Tour`;
      case "spl":
        return $localize`:@@event_preview.view_spl:View on Sport Parkour League`;
      case "parkour_earth":
        return $localize`:@@event_preview.view_parkour_earth:View on Parkour Earth`;
      default:
        return $localize`:@@event_preview.view_source:View source`;
    }
  });

  onDismiss() {
    this.dismiss.emit();
  }

  onBack() {
    this.back.emit();
  }
}
