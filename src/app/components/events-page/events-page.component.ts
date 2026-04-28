import { isPlatformBrowser, NgOptimizedImage } from "@angular/common";
import {
  Component,
  computed,
  inject,
  LOCALE_ID,
  PLATFORM_ID,
  signal,
  afterNextRender,
} from "@angular/core";
import { MatCardModule } from "@angular/material/card";
import { RouterLink } from "@angular/router";
import { MediaPlaceholderComponent } from "../media-placeholder/media-placeholder.component";
import { LocaleCode } from "../../../db/models/Interfaces";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId } from "../../../db/schemas/EventSchema";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { SWISSJAM25_STATIC } from "../event-page/swissjam25.static";

type EventStatus = "upcoming" | "live" | "past";

@Component({
  selector: "app-events-page",
  imports: [NgOptimizedImage, MatCardModule, RouterLink, MediaPlaceholderComponent],
  templateUrl: "./events-page.component.html",
  styleUrl: "./events-page.component.scss",
})
export class EventsPageComponent {
  private _locale = inject<LocaleCode>(LOCALE_ID);
  private _platformId = inject(PLATFORM_ID);
  private _eventsService = inject(EventsService);

  events = signal<PkEvent[]>([]);
  loading = signal<boolean>(true);

  /** Events sorted by start date — live + upcoming first, past last. */
  readonly upcomingEvents = computed(() =>
    this.events().filter((e) => !e.isPast())
  );

  readonly pastEvents = computed(() =>
    this.events()
      .filter((e) => e.isPast())
      .sort((a, b) => b.start.getTime() - a.start.getTime())
  );

  constructor() {
    if (isPlatformBrowser(this._platformId)) {
      afterNextRender(() => {
        void this._loadEvents();
      });
    }
  }

  private async _loadEvents() {
    try {
      const events = await this._eventsService.getEvents({ sortByNext: true });

      // Surface the swissjam25 static fallback when no Firestore doc exists,
      // so the calendar isn't empty before any events are migrated.
      if (
        !events.some(
          (e) => e.slug === "swissjam25" || e.id === ("swissjam25" as EventId)
        )
      ) {
        events.push(new PkEvent("swissjam25" as EventId, SWISSJAM25_STATIC));
      }

      this.events.set(events);
    } catch (err) {
      console.warn("EventsPage: failed to load events", err);
      this.events.set([
        new PkEvent("swissjam25" as EventId, SWISSJAM25_STATIC),
      ]);
    } finally {
      this.loading.set(false);
    }
  }

  formatDateRange(event: PkEvent): string {
    const start = event.start.toLocaleDateString(this._locale, {
      dateStyle: "full",
    });
    const end = event.end.toLocaleDateString(this._locale, {
      dateStyle: "full",
    });
    return start === end ? start : `${start} - ${end}`;
  }

  status(event: PkEvent): EventStatus {
    return event.status();
  }

  /**
   * Compact relative-time label shown under the date on each card.
   * - upcoming: "Starts in 3 days" / "Starts in 5 hours"
   * - live: "Ongoing — ends in 2 days" / "Ongoing — ends in 4 hours"
   * - past: "Past event"
   */
  statusLabel(event: PkEvent): string {
    const status = event.status();
    if (status === "past") {
      return $localize`:@@events.status.past:Past event`;
    }
    const target = status === "live" ? event.end : event.start;
    const relative = this._relativeFromNow(target);
    if (status === "live") {
      return $localize`:@@events.status.live_with_end:Ongoing — ends ${relative}`;
    }
    return $localize`:@@events.status.upcoming_starts:Starts ${relative}`;
  }

  private _relativeFromNow(target: Date): string {
    const diffMs = target.getTime() - Date.now();
    const absMs = Math.abs(diffMs);
    const minutes = Math.round(absMs / 60_000);
    const hours = Math.round(absMs / 3_600_000);
    const days = Math.round(absMs / 86_400_000);

    let value: string;
    if (days >= 2) value = $localize`:@@events.in_n_days:in ${days} days`;
    else if (hours >= 2) value = $localize`:@@events.in_n_hours:in ${hours} hours`;
    else if (minutes >= 2) value = $localize`:@@events.in_n_minutes:in ${minutes} minutes`;
    else value = $localize`:@@events.soon:soon`;
    return value;
  }
}
