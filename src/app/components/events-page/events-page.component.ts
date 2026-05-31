import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId } from "../../../db/schemas/EventSchema";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { SWISSJAM25_STATIC } from "../event-page/swissjam25.static";
import { EventCardComponent } from "../event-card/event-card.component";
import {
  SeriesDocument,
  SeriesService,
} from "../../services/firebase/firestore/series.service";

@Component({
  selector: "app-events-page",
  imports: [
    EventCardComponent,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    RouterLink,
  ],
  templateUrl: "./events-page.component.html",
  styleUrl: "./events-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsPageComponent implements OnInit {
  private _eventsService = inject(EventsService);
  private _authService = inject(AuthenticationService);
  private _seriesService = inject(SeriesService);

  /** Shows the "+ Create event" button only to admins. */
  readonly isAdmin = computed(() => this._authService.isAdmin());

  events = signal<PkEvent[]>([]);
  seriesById = signal<Record<string, SeriesDocument>>({});
  selectedSeriesIds = signal<string[]>([]);
  loading = signal<boolean>(true);
  private _lastIncludeUnpublished: boolean | null = null;

  /** Events sorted by start date — live + upcoming first, past last. */
  readonly filteredEvents = computed(() => {
    const selected = this.selectedSeriesIds();
    if (selected.length === 0) return this.events();
    return this.events().filter((event) =>
      selected.some((seriesId) => event.seriesIds.includes(seriesId)),
    );
  });

  readonly upcomingEvents = computed(() =>
    this.filteredEvents().filter((e) => !e.isPast()),
  );

  readonly pastEvents = computed(() =>
    this.filteredEvents()
      .filter((e) => e.isPast())
      .sort((a, b) => b.start.getTime() - a.start.getTime()),
  );

  readonly seriesFilterOptions = computed(() => {
    const seriesById = this.seriesById();
    const counts = new Map<string, number>();
    for (const event of this.events()) {
      for (const seriesId of event.seriesIds) {
        counts.set(seriesId, (counts.get(seriesId) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([id, count]) => ({
        id,
        count,
        label: seriesById[id]?.name ?? this._seriesFallbackLabel(id),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  });

  ngOnInit() {
    void this._loadEvents();
  }

  constructor() {
    effect(() => {
      const includeUnpublished = this.isAdmin();
      if (this._lastIncludeUnpublished === null) return;
      if (includeUnpublished === this._lastIncludeUnpublished) return;
      void this._loadEvents();
    });
  }

  private async _loadEvents() {
    const includeUnpublished = this.isAdmin();
    this._lastIncludeUnpublished = includeUnpublished;
    try {
      const events = await this._eventsService.getEvents({
        sortByNext: true,
        ...(includeUnpublished ? { includeUnpublished } : {}),
      });

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
      await this._loadSeriesForEvents(events);
    } catch (err) {
      console.warn("EventsPage: failed to load events", err);
      this.events.set([
        new PkEvent("swissjam25" as EventId, SWISSJAM25_STATIC),
      ]);
      this.seriesById.set({});
    } finally {
      this.loading.set(false);
    }
  }

  toggleSeriesFilter(seriesId: string): void {
    this.selectedSeriesIds.update((selected) =>
      selected.includes(seriesId)
        ? selected.filter((id) => id !== seriesId)
        : [...selected, seriesId],
    );
  }

  isSeriesSelected(seriesId: string): boolean {
    return this.selectedSeriesIds().includes(seriesId);
  }

  clearSeriesFilters(): void {
    this.selectedSeriesIds.set([]);
  }

  private async _loadSeriesForEvents(events: readonly PkEvent[]): Promise<void> {
    const seriesIds = [
      ...new Set(events.flatMap((event) => event.seriesIds)),
    ].filter(Boolean);
    if (seriesIds.length === 0) {
      this.seriesById.set({});
      return;
    }

    try {
      this.seriesById.set(await this._seriesService.getSeriesByIds(seriesIds));
    } catch (err) {
      console.warn("EventsPage: failed to load series metadata", err);
      this.seriesById.set({});
    }
  }

  private _seriesFallbackLabel(seriesId: string): string {
    return seriesId
      .split("-")
      .filter(Boolean)
      .map((word) => word[0]?.toUpperCase() + word.slice(1))
      .join(" ");
  }
}
