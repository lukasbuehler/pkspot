import { isPlatformBrowser } from "@angular/common";
import {
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
  afterNextRender,
} from "@angular/core";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId } from "../../../db/schemas/EventSchema";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { SWISSJAM25_STATIC } from "../event-page/swissjam25.static";
import { EventCardComponent } from "../event-card/event-card.component";

@Component({
  selector: "app-events-page",
  imports: [EventCardComponent],
  templateUrl: "./events-page.component.html",
  styleUrl: "./events-page.component.scss",
})
export class EventsPageComponent {
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

}
