import { isPlatformBrowser, NgOptimizedImage } from "@angular/common";
import {
  Component,
  inject,
  LOCALE_ID,
  PLATFORM_ID,
  signal,
  afterNextRender,
} from "@angular/core";
import { MatCardModule } from "@angular/material/card";
import { RouterLink } from "@angular/router";
import { LocaleCode } from "../../../db/models/Interfaces";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId } from "../../../db/schemas/EventSchema";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { SWISSJAM25_STATIC } from "../event-page/swissjam25.static";

@Component({
  selector: "app-events-page",
  imports: [NgOptimizedImage, MatCardModule, RouterLink],
  templateUrl: "./events-page.component.html",
  styleUrl: "./events-page.component.scss",
})
export class EventsPageComponent {
  private _locale = inject<LocaleCode>(LOCALE_ID);
  private _platformId = inject(PLATFORM_ID);
  private _eventsService = inject(EventsService);

  events = signal<PkEvent[]>([]);
  loading = signal<boolean>(true);

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
      if (!events.some((e) => e.slug === "swissjam25" || e.id === ("swissjam25" as EventId))) {
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
}
