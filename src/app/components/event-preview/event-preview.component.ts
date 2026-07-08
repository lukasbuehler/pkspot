import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { RouterLink } from "@angular/router";
import { Event as PkEvent, EventTicketOption } from "../../../db/models/Event";
import type { EventLinkSchema } from "../../../db/schemas/EventSchema";
import { MapInfoPanelComponent } from "../map-info-panel/map-info-panel.component";
import { AnalyticsService } from "../../services/analytics.service";
import { EventHeroMediaComponent } from "../event-display/event-hero-media.component";
import { EventSummaryMetaComponent } from "../event-display/event-summary-meta.component";
import {
  eventHeroMedia,
  isRemoteExternalMedia,
  type EventStatus,
} from "../event-display/event-display.helpers";

interface PreviewExternalLink {
  url: string;
  label: string;
  kind: EventLinkSchema["kind"];
  provider?: string;
}

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
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RouterLink,
    MapInfoPanelComponent,
    EventHeroMediaComponent,
    EventSummaryMetaComponent,
  ],
  templateUrl: "./event-preview.component.html",
  styleUrl: "./event-preview.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventPreviewComponent {
  private _analytics = inject(AnalyticsService);

  /** The event to render. */
  event = input<PkEvent | null>(null);
  loading = input(false);
  loadingTitle = input<string>("");

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
    if (!e) return false;
    return (
      Number.isFinite(e.start.getTime()) && Number.isFinite(e.end.getTime())
    );
  });
  readonly status = computed<EventStatus | null>(() =>
    this.hasValidDates() ? (this.event()?.status() ?? null) : null
  );

  readonly eventIcon = computed(() =>
    this.event()?.isSponsored ? "handshake" : "event",
  );
  readonly eventIconTooltip = computed(() =>
    this.event()?.isSponsored
      ? $localize`:@@event_preview.sponsored_tooltip:Promoted event`
      : $localize`:@@event_preview.event_tooltip:Event`,
  );

  readonly fullEventLink = computed(() => {
    const e = this.event();
    if (!e) return ["/events"];
    return ["/events", e.slug ?? e.id];
  });

  readonly hasPreviewHeroMedia = computed(() => {
    const event = this.event();
    if (!event) return false;
    return eventHeroMedia(event).some((item) => !isRemoteExternalMedia(item));
  });

  readonly websiteLink = computed<PreviewExternalLink | null>(() => {
    const event = this.event();
    if (!event) return null;

    const editableLink =
      event.eventLinks.find((link) => link.primary === true) ??
      event.eventLinks.find((link) => link.kind !== "tickets");
    const editableUrl = this._safeExternalUrl(editableLink?.url);
    if (editableLink && editableUrl) {
      return {
        url:
          this._analytics.addUtmToUrl(editableUrl, "map_event_preview") ??
          editableUrl,
        label: editableLink.label,
        kind: editableLink.kind,
        provider: editableLink.provider,
      };
    }

    const eventUrl = this._safeExternalUrl(event.url);
    if (eventUrl) {
      return {
        url:
          this._analytics.addUtmToUrl(eventUrl, "map_event_preview") ??
          eventUrl,
        label: $localize`:@@event_preview.website:Website`,
        kind: "website",
      };
    }

    const sourceUrl = this._safeExternalUrl(event.externalSource?.url);
    if (sourceUrl) {
      return {
        url:
          this._analytics.addUtmToUrl(sourceUrl, "map_event_preview") ??
          sourceUrl,
        label: this._externalSourceLabel(event.externalSource?.provider),
        kind: "other",
        provider: event.externalSource?.provider,
      };
    }

    return null;
  });

  readonly websiteUrl = computed<string | null>(() => {
    return this.websiteLink()?.url ?? null;
  });

  readonly ticketLink = computed<EventTicketOption | null>(() => {
    const event = this.event();
    if (!event) return null;
    return (
      event.ticketOptions.find((ticket) => this._safeExternalUrl(ticket.url)) ??
      null
    );
  });

  /**
   * Provider-aware label for the website CTA. Localized once in the host so
   * the template stays declarative.
   */
  readonly websiteLabel = computed<string>(() => {
    return this.websiteLink()?.label ?? $localize`:@@event_preview.website:Website`;
  });

  private _externalSourceLabel(provider: string | undefined): string {
    switch (provider) {
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
  }

  private _safeExternalUrl(value: string | undefined): string | null {
    if (!value) return null;
    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.toString();
      }
    } catch {
      return null;
    }
    return null;
  }

  trackWebsiteClick() {
    const event = this.event();
    this._analytics.trackEvent("click_event_website", {
      surface: "map_event_preview",
      event_id: event?.id,
      event_slug: event?.slug,
      event_name: event?.name,
      event_status: this.status(),
      is_sponsored: event?.isSponsored ?? false,
      sponsor_name: event?.sponsor?.name,
      external_provider: this.websiteLink()?.provider,
      link_kind: this.websiteLink()?.kind,
      link_label: this.websiteLink()?.label,
      url: this.websiteUrl(),
    });
    return true;
  }

  trackTicketClick(ticket: EventTicketOption): boolean {
    const event = this.event();
    this._analytics.trackEvent("click_event_link", {
      surface: "map_event_preview",
      event_id: event?.id,
      event_slug: event?.slug,
      event_name: event?.name,
      event_status: this.status(),
      link_kind: "tickets",
      link_label: ticket.label,
      url: ticket.url,
    });
    return true;
  }

  onDismiss() {
    this.dismiss.emit();
  }

  onBack() {
    this.back.emit();
  }
}
