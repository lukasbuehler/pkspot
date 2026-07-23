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
import { ActivatedRoute, ParamMap, Router, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Event as PkEvent } from "../../../db/models/Event";
import {
  EventCategory,
  EventId,
  EventSchema,
} from "../../../db/schemas/EventSchema";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { SWISSJAM25_STATIC } from "../event-page/swissjam25.static";
import { EventCardComponent } from "../event-card/event-card.component";
import {
  SeriesDocument,
  SeriesService,
} from "../../services/firebase/firestore/series.service";
import { eventImageDisplaySrc } from "../event-display/event-display.helpers";
import { AnalyticsService } from "../../services/analytics.service";

type ScreenshotEventSchema = Omit<
  EventSchema,
  "end" | "location" | "start"
> & {
  id: string;
  end: string;
  start: string;
};

interface ScreenshotEventIndex {
  events: ScreenshotEventSchema[];
  seriesById?: Record<string, SeriesDocument>;
}

interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_EVENT_INDEX__?: ScreenshotEventIndex;
}

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
  private _route = inject(ActivatedRoute, { optional: true });
  private _router = inject(Router, { optional: true });
  private _analytics = inject(AnalyticsService);

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
    this._route?.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => this._syncFiltersFromQueryParams(params));

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
      const screenshotIndex = this._screenshotEventIndex();
      if (screenshotIndex) {
        this.events.set(screenshotIndex.events);
        this.seriesById.set(screenshotIndex.seriesById);
        return;
      }

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
    const wasSelected = this.selectedSeriesIds().includes(seriesId);
    this.selectedSeriesIds.update((selected) =>
      wasSelected
        ? selected.filter((id) => id !== seriesId)
        : [...selected, seriesId],
    );
    this._analytics.trackEvent("events_filter_changed", {
      filter_type: "series",
      value: seriesId,
      enabled: !wasSelected,
      selected_series_count: this.selectedSeriesIds().length,
      selected_category_count: this.selectedCategories().length,
    });
    void this._updateFilterQueryParams();
  }

  isSeriesSelected(seriesId: string): boolean {
    return this.selectedSeriesIds().includes(seriesId);
  }

  clearSeriesFilters(): void {
    this.selectedSeriesIds.set([]);
    this._analytics.trackEvent("events_filter_cleared", {
      filter_type: "series",
    });
    void this._updateFilterQueryParams();
  }

  toggleCategoryFilter(category: EventCategory): void {
    const wasSelected = this.selectedCategories().includes(category);
    this.selectedCategories.update((selected) =>
      wasSelected
        ? selected.filter((item) => item !== category)
        : [...selected, category],
    );
    this._analytics.trackEvent("events_filter_changed", {
      filter_type: "category",
      value: category,
      enabled: !wasSelected,
      selected_series_count: this.selectedSeriesIds().length,
      selected_category_count: this.selectedCategories().length,
    });
    void this._updateFilterQueryParams();
  }

  isCategorySelected(category: EventCategory): boolean {
    return this.selectedCategories().includes(category);
  }

  clearCategoryFilters(): void {
    this.selectedCategories.set([]);
    this._analytics.trackEvent("events_filter_cleared", {
      filter_type: "category",
    });
    void this._updateFilterQueryParams();
  }

  trackCreateEventClick(): void {
    this._analytics.trackEvent("event_create_clicked", {
      surface: "events_page",
    });
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

  private _screenshotEventIndex(): {
    events: PkEvent[];
    seriesById: Record<string, SeriesDocument>;
  } | null {
    const fixture = (globalThis as ScreenshotGlobal)
      .__PKSPOT_SCREENSHOT_EVENT_INDEX__;
    if (!fixture || !Array.isArray(fixture.events)) return null;

    return {
      events: fixture.events.map(({ id, ...event }) =>
        new PkEvent(id as EventId, event as unknown as EventSchema),
      ),
      seriesById: fixture.seriesById ?? {},
    };
  }

  private _seriesFallbackLabel(seriesId: string): string {
    return seriesId
      .split("-")
      .filter(Boolean)
      .map((word) => word[0]?.toUpperCase() + word.slice(1))
      .join(" ");
  }

  private _syncFiltersFromQueryParams(params: ParamMap): void {
    const categoryValues = this._parseQueryParamList(params, CATEGORY_QUERY_PARAM)
      .filter(isEventCategoryFilter);
    const seriesValues = this._parseQueryParamList(params, SERIES_QUERY_PARAM);

    if (!areStringListsEqual(this.selectedCategories(), categoryValues)) {
      this.selectedCategories.set(categoryValues);
    }
    if (!areStringListsEqual(this.selectedSeriesIds(), seriesValues)) {
      this.selectedSeriesIds.set(seriesValues);
    }
  }

  private async _updateFilterQueryParams(): Promise<void> {
    if (!this._router || !this._route) return;

    await this._router.navigate([], {
      relativeTo: this._route,
      queryParams: {
        [CATEGORY_QUERY_PARAM]: this._serializeQueryParamList(
          this.selectedCategories(),
        ),
        [SERIES_QUERY_PARAM]: this._serializeQueryParamList(
          this.selectedSeriesIds(),
        ),
      },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  private _parseQueryParamList(params: ParamMap, key: string): string[] {
    const values = params
      .getAll(key)
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);
    return [...new Set(values)];
  }

  private _serializeQueryParamList(values: readonly string[]): string | null {
    return values.length > 0 ? values.join(",") : null;
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

const CATEGORY_QUERY_PARAM = "category";
const SERIES_QUERY_PARAM = "series";

function isEventCategoryFilter(value: string): value is EventCategory {
  return EVENT_CATEGORY_FILTER_SET.has(value as EventCategory);
}

function areStringListsEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}
