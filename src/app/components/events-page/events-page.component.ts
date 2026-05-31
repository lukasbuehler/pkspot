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
import { EventCategory, EventId } from "../../../db/schemas/EventSchema";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { SWISSJAM25_STATIC } from "../event-page/swissjam25.static";
import { EventCardComponent } from "../event-card/event-card.component";
import {
  SeriesDocument,
  SeriesService,
} from "../../services/firebase/firestore/series.service";
import { eventImageDisplaySrc } from "../event-display/event-display.helpers";

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
  selectedCategories = signal<EventCategory[]>([]);
  loading = signal<boolean>(true);
  private _lastIncludeUnpublished: boolean | null = null;

  /** Events sorted by start date — live + upcoming first, past last. */
  readonly filteredEvents = computed(() => {
    const selectedSeriesIds = this.selectedSeriesIds();
    const selectedCategories = this.selectedCategories();
    if (selectedSeriesIds.length === 0 && selectedCategories.length === 0) {
      return this.events();
    }
    return this.events().filter(
      (event) =>
        (selectedSeriesIds.length === 0 ||
          selectedSeriesIds.some((seriesId) =>
            event.seriesIds.includes(seriesId),
          )) &&
        (selectedCategories.length === 0 ||
          selectedCategories.some((category) =>
            event.eventCategories.includes(category),
          )),
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
        logoSrc: eventImageDisplaySrc(seriesById[id]?.logo_src),
        logoBackground:
          seriesById[id]?.logo_background_color ??
          "var(--mat-sys-surface-container-high)",
        initials: this._seriesInitials(seriesById[id]?.name ?? id),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  });

  readonly categoryFilterOptions = computed(() => {
    const counts = new Map<EventCategory, number>();
    for (const event of this.events()) {
      for (const category of event.eventCategories) {
        if (EVENT_CATEGORY_FILTER_SET.has(category)) {
          counts.set(category, (counts.get(category) ?? 0) + 1);
        }
      }
    }

    return EVENT_CATEGORY_FILTERS.map((category) => ({
      id: category,
      icon: this.categoryIcon(category),
      label: this.categoryLabel(category),
      count: counts.get(category) ?? 0,
    })).filter((option) => option.count > 0);
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

  toggleCategoryFilter(category: EventCategory): void {
    this.selectedCategories.update((selected) =>
      selected.includes(category)
        ? selected.filter((item) => item !== category)
        : [...selected, category],
    );
  }

  isCategorySelected(category: EventCategory): boolean {
    return this.selectedCategories().includes(category);
  }

  clearCategoryFilters(): void {
    this.selectedCategories.set([]);
  }

  categoryLabel(category: EventCategory): string {
    switch (category) {
      case "competition":
        return $localize`:@@event_category.competition:Competition`;
      case "jam":
        return $localize`:@@event_category.jam:Jam`;
      case "camp":
        return $localize`:@@event_category.camp:Camp`;
      default:
        return category;
    }
  }

  categoryIcon(category: EventCategory): string {
    switch (category) {
      case "competition":
        return "trophy";
      case "jam":
        return "groups";
      case "camp":
        return "camping";
      default:
        return "sell";
    }
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

  private _seriesInitials(label: string): string {
    return label
      .split(/[\s-]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("");
  }
}

const EVENT_CATEGORY_FILTERS = [
  "competition",
  "jam",
  "camp",
] satisfies EventCategory[];

const EVENT_CATEGORY_FILTER_SET: ReadonlySet<EventCategory> = new Set(
  EVENT_CATEGORY_FILTERS,
);
