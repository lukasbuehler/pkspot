import { NgOptimizedImage } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { MatRippleModule } from "@angular/material/core";
import { MatTooltipModule } from "@angular/material/tooltip";
import { RouterLink } from "@angular/router";
import { LocaleCode } from "../../../db/models/Interfaces";
import { Event as PkEvent } from "../../../db/models/Event";
import { CountdownComponent } from "../countdown/countdown.component";
import { MediaPlaceholderComponent } from "../media-placeholder/media-placeholder.component";

/**
 * Compact preview card for an event, designed to slot into the map page's
 * sidebar (desktop) or bottom-sheet (mobile). Mirrors `SpotPreviewCard`'s
 * shape so the collapsed bottom-sheet shows the key info (name + date +
 * status) without the user having to slide it up.
 *
 * For the full event experience (map, spot list, challenges, etc.) the
 * card has a "See full event" CTA that routes to /events/<slug>.
 */
@Component({
  selector: "app-event-preview",
  imports: [
    NgOptimizedImage,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatRippleModule,
    MatTooltipModule,
    RouterLink,
    CountdownComponent,
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

  /** When true, the panel is shown in compact mode (e.g. collapsed bottom sheet). */
  isCompact = input<boolean>(false);

  /** Allow the host to dismiss the preview (e.g. close button → clear selection). */
  dismissable = input<boolean>(true);
  /** Emitted when the user dismisses the preview. */
  dismiss = output<void>();

  readonly status = computed(() => this.event().status());
  readonly countdownTarget = computed<Date | null>(() => {
    const e = this.event();
    const status = e.status();
    if (status === "upcoming") return e.start;
    if (status === "live") return e.end;
    return null;
  });

  readonly dateRange = computed(() => {
    const e = this.event();
    const start = e.start.toLocaleDateString(this._locale, {
      dateStyle: "medium",
    });
    const end = e.end.toLocaleDateString(this._locale, {
      dateStyle: "medium",
    });
    return start === end ? start : `${start} – ${end}`;
  });

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
}
