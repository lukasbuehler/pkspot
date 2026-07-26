import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  LOCALE_ID,
  resource,
  signal,
} from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { ActivatedRoute, ParamMap, Router } from "@angular/router";
import {
  type EventCategory,
  type EventSchema,
} from "../../../db/schemas/EventSchema";
import { AnalyticsService } from "../../services/analytics.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import {
  type SeriesDocument,
  SeriesService,
} from "../../services/firebase/firestore/series.service";
import {
  type EventDiscoveryFacets,
  type EventDiscoveryItem,
  type EventDiscoverySearchResult,
  type EventSearchPreview,
  SearchService,
} from "../../services/search.service";
import { ResizeObserverDirective } from "../../directives/resize-observer.directive";
import { eventImageDisplaySrc } from "../event-display/event-display.helpers";
import { EventCardComponent } from "../event-card/event-card.component";
import {
  type FabMenuAction,
  FabMenuComponent,
} from "../fab-menu/fab-menu.component";
import type { EntityReferenceOption } from "../entity-reference-autocomplete/entity-reference-autocomplete.component";
import {
  buildEventCalendarMonth,
  currentMonthKey,
  eventLocalDateKey,
  isMonthKey,
  shiftMonthKey,
} from "./event-calendar.model";
import { EventCalendarComponent } from "./event-calendar.component";
import { EventDiscoveryListComponent } from "./event-discovery-list.component";
import {
  EventDiscoveryIssuesDialogComponent,
  type EventDiscoveryIssuesDialogData,
} from "./event-discovery-issues-dialog.component";
import {
  type EventCategoryFilterOption,
  EventDiscoveryToolbarComponent,
  type EventSeriesFilterOption,
  type EventsDiscoveryView,
  type EventsListPeriod,
} from "./event-discovery-toolbar.component";

type EventCreateAction = "event" | "session";

interface EventFabMenuAction extends FabMenuAction {
  id: EventCreateAction;
}

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

interface DiscoveryRequest {
  view: EventsDiscoveryView;
  query: string;
  areaKeys: string[];
  categories: EventCategory[];
  seriesIds: string[];
  period: EventsListPeriod;
  month: string;
  limit: number;
}

const WIDE_CALENDAR_MIN_WIDTH = 1120;
const LIST_PAGE_SIZE = 24;
const VIEW_STORAGE_KEY = "eventsDiscoveryView";

@Component({
  selector: "app-events-page",
  imports: [
    MatButtonModule,
    MatIconModule,
    ResizeObserverDirective,
    EventCardComponent,
    EventCalendarComponent,
    EventDiscoveryListComponent,
    EventDiscoveryToolbarComponent,
    FabMenuComponent,
  ],
  templateUrl: "./events-page.component.html",
  styleUrl: "./events-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsPageComponent {
  private readonly _search = inject(SearchService);
  private readonly _events = inject(EventsService);
  private readonly _series = inject(SeriesService);
  private readonly _auth = inject(AuthenticationService);
  private readonly _analytics = inject(AnalyticsService);
  private readonly _dialog = inject(MatDialog);
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _locale = inject(LOCALE_ID);
  private readonly _authState = toSignal(this._auth.authState$, {
    initialValue: this._auth.authState$.value,
  });
  private _hasValidMonthParam = false;
  private _hasValidDayParam = false;
  private _hasPeriodParam = false;
  private _urlCanonicalizationPending = false;

  readonly isAdmin = computed(() => this._auth.isAdmin());
  readonly isSignedIn = computed(() => !!this._authState()?.uid);
  readonly createMenuLabel = $localize`:@@events.create_menu_tooltip:Create an event or session`;
  readonly createActions = computed<EventFabMenuAction[]>(() => {
    const actions: EventFabMenuAction[] = [];
    if (this.isAdmin()) {
      actions.push({
        id: "event",
        icon: "calendar_add_on",
        label: $localize`:@@events.create:Create event`,
      });
    }
    if (this.isSignedIn()) {
      actions.push({
        id: "session",
        icon: "event_upcoming",
        label: $localize`:@@events.plan_session:Plan session`,
      });
    }
    return actions;
  });

  readonly containerWidth = signal(1200);
  readonly explicitView = signal<EventsDiscoveryView | null>(null);
  readonly rememberedView = signal<EventsDiscoveryView | null>(
    readRememberedView(),
  );
  readonly query = signal("");
  readonly areaKey = signal("");
  readonly areaAliases = signal<string[]>([]);
  readonly selectedCategories = signal<EventCategory[]>([]);
  readonly selectedSeriesIds = signal<string[]>([]);
  readonly period = signal<EventsListPeriod>("upcoming");
  readonly month = signal(currentMonthKey());
  readonly requestedDay = signal("");
  readonly resultLimit = signal(LIST_PAGE_SIZE);

  readonly wideCalendar = computed(
    () => this.containerWidth() >= WIDE_CALENDAR_MIN_WIDTH,
  );
  readonly view = computed<EventsDiscoveryView>(
    () =>
      this.explicitView() ??
      this.rememberedView() ??
      (this.wideCalendar() ? "calendar" : "list"),
  );
  readonly calendarRange = computed(() =>
    buildEventCalendarMonth(this.month(), this._locale, []),
  );
  readonly selectedDay = computed(() => {
    const requested = this.requestedDay();
    if (
      /^\d{4}-\d{2}-\d{2}$/u.test(requested) &&
      this.calendarRange().days.some((day) => day.key === requested)
    ) {
      return requested;
    }
    return defaultDayForMonth(this.month());
  });

  readonly discoveryResource = resource({
    params: (): DiscoveryRequest => ({
      view: this.view(),
      query: this.query(),
      areaKeys: this.areaAliases().length
        ? this.areaAliases()
        : this.areaKey()
          ? [this.areaKey()]
          : [],
      categories: this.selectedCategories(),
      seriesIds: this.selectedSeriesIds(),
      period: this.period(),
      month: this.month(),
      limit: this.resultLimit(),
    }),
    loader: async ({ params, abortSignal }) => {
      const screenshot = this._screenshotDiscovery(params);
      if (screenshot) return screenshot;

      const common = {
        query: params.query,
        areaKeys: params.areaKeys,
        categories: params.categories,
        seriesIds: params.seriesIds,
        abortSignal,
      };
      if (params.view === "calendar") {
        const range = buildEventCalendarMonth(
          params.month,
          this._locale,
          [],
        );
        return this._search.searchAllEventDiscovery({
          ...common,
          startsBeforeSeconds: range.queryEndSeconds,
          endsAfterSeconds: range.queryStartSeconds,
          sort: "calendar",
        });
      }

      const nowSeconds = Math.floor(Date.now() / 1000);
      return this._search.searchEventDiscovery({
        ...common,
        ...(params.period === "past"
          ? { endsBeforeSeconds: nowSeconds, sort: "past" as const }
          : { endsAfterSeconds: nowSeconds, sort: "upcoming" as const }),
        page: 1,
        perPage: Math.min(params.limit, 250),
      });
    },
  });

  readonly discoveryResult = computed(
    () => this.discoveryResource.value() ?? null,
  );
  readonly events = computed(() => this.discoveryResult()?.items ?? []);
  readonly invalidEventsResource = resource({
    params: () => (this.isAdmin() ? true : undefined),
    loader: async ({ abortSignal }) =>
      this._screenshotInvalidEvents() ??
      (await this._search.searchInvalidEventDiscovery({ abortSignal })),
  });
  readonly invalidEvents = computed(
    () => this.invalidEventsResource.value() ?? [],
  );
  readonly calendar = computed(() =>
    buildEventCalendarMonth(
      this.month(),
      this._locale,
      this.events(),
    ),
  );
  readonly facetSeriesIds = computed(() => [
    ...new Set([
      ...(this.discoveryResult()?.facets.series.map((facet) => facet.value) ??
        []),
      ...this.selectedSeriesIds(),
      ...this.events().flatMap((event) => event.seriesIds),
      ...this.invalidEvents().flatMap((event) => event.seriesIds),
    ]),
  ]);

  readonly seriesResource = resource({
    params: () => {
      const ids = this.facetSeriesIds();
      return ids.length > 0 ? ids : undefined;
    },
    loader: async ({ params }) =>
      this._screenshotSeriesById() ?? this._series.getSeriesByIds(params),
  });
  readonly seriesById = computed(
    () => this.seriesResource.value() ?? this._screenshotSeriesById() ?? {},
  );

  readonly categoryFilterOptions = computed<EventCategoryFilterOption[]>(() => {
    const counts = new Map(
      (this.discoveryResult()?.facets.categories ?? []).map((facet) => [
        facet.value,
        facet.count,
      ]),
    );
    return EVENT_CATEGORY_FILTERS.map((category) => ({
      id: category,
      icon: categoryIcon(category),
      label: categoryLabel(category),
      count: counts.get(category) ?? 0,
    })).filter(
      (option) =>
        option.count > 0 || this.selectedCategories().includes(option.id),
    );
  });

  readonly seriesFilterOptions = computed<EventSeriesFilterOption[]>(() => {
    const counts = new Map(
      (this.discoveryResult()?.facets.series ?? []).map((facet) => [
        facet.value,
        facet.count,
      ]),
    );
    return this.facetSeriesIds()
      .map((id) => ({
        id,
        label: this.seriesById()[id]?.name ?? seriesFallbackLabel(id),
        count: counts.get(id) ?? 0,
        logoSrc: eventImageDisplaySrc(this.seriesById()[id]?.logo_src),
        logoBackground:
          this.seriesById()[id]?.logo_background_color ??
          "var(--mat-sys-surface-container-high)",
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  });

  readonly draftsResource = resource({
    params: () => (this.isAdmin() ? true : undefined),
    loader: async () => {
      if (this._screenshotEventIndex()) return [];
      const events = await this._events.getEvents({
        includeUnpublished: true,
        sortByNext: true,
      });
      return events.filter((event) => !event.published);
    },
  });
  readonly drafts = computed(() => this.draftsResource.value() ?? []);

  constructor() {
    this._route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => this._readQueryParams(params));
  }

  onContainerResize(rect: DOMRectReadOnly): void {
    this.containerWidth.set(Math.round(rect.width));
    this._ensureShareableUrlDefaults();
  }

  onViewChange(view: EventsDiscoveryView): void {
    this.explicitView.set(view);
    this.rememberedView.set(view);
    rememberView(view);
    this._analytics.trackEvent("events_view_changed", { view });
    void this._updateQueryParams(
      view === "calendar"
        ? { view, month: this.month(), day: this.selectedDay() }
        : { view, when: this.period() },
    );
  }

  onPeriodChange(period: EventsListPeriod): void {
    this.resultLimit.set(LIST_PAGE_SIZE);
    void this._updateQueryParams({ when: period });
  }

  onQueryChange(query: string): void {
    this.resultLimit.set(LIST_PAGE_SIZE);
    void this._updateQueryParams({ q: query || null });
  }

  onAreaChange(option: EntityReferenceOption | null): void {
    const community = option?.communityPreview;
    const key = community?.communityKey ?? option?.id ?? "";
    this.areaAliases.set(
      key
        ? [
            ...new Set([
              key,
              ...(community?.mergedCommunityKeys ?? []),
            ]),
          ]
        : [],
    );
    if (key !== this.areaKey()) {
      this.resultLimit.set(LIST_PAGE_SIZE);
      void this._updateQueryParams({ area: key || null });
    }
  }

  toggleCategory(category: EventCategory): void {
    const values = this.selectedCategories().includes(category)
      ? this.selectedCategories().filter((item) => item !== category)
      : [...this.selectedCategories(), category];
    void this._updateQueryParams({
      category: serializeList(values),
    });
  }

  toggleSeries(seriesId: string): void {
    const values = this.selectedSeriesIds().includes(seriesId)
      ? this.selectedSeriesIds().filter((item) => item !== seriesId)
      : [...this.selectedSeriesIds(), seriesId];
    void this._updateQueryParams({ series: serializeList(values) });
  }

  clearFilters(): void {
    this.areaAliases.set([]);
    this.resultLimit.set(LIST_PAGE_SIZE);
    void this._updateQueryParams({
      q: null,
      area: null,
      category: null,
      series: null,
    });
  }

  changeMonth(offset: number): void {
    const month = shiftMonthKey(this.month(), offset);
    void this._updateQueryParams({
      month,
      day: defaultDayForMonth(month),
    });
  }

  goToToday(): void {
    const month = currentMonthKey();
    const day = eventLocalDateKey(
      new Date(),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    void this._updateQueryParams({ month, day });
  }

  selectDay(day: string): void {
    void this._updateQueryParams({ day });
  }

  loadMore(): void {
    this.resultLimit.update((limit) => Math.min(250, limit + LIST_PAGE_SIZE));
  }

  retry(): void {
    this.discoveryResource.reload();
  }

  openInvalidEventsDialog(): void {
    const invalidEvents = this.invalidEvents();
    if (!this.isAdmin() || invalidEvents.length === 0) return;

    this._dialog.open<
      EventDiscoveryIssuesDialogComponent,
      EventDiscoveryIssuesDialogData
    >(EventDiscoveryIssuesDialogComponent, {
      data: {
        events: invalidEvents,
        seriesById: this.seriesById(),
      },
      width: "860px",
      maxWidth: "calc(100vw - 2rem)",
      maxHeight: "90vh",
      ariaLabel: $localize`Events needing a data update`,
    });
  }

  onCreateAction(action: string): void {
    if (action !== "event" && action !== "session") return;
    this._analytics.trackEvent(
      action === "event" ? "event_create_clicked" : "session_plan_clicked",
      { surface: "events_page" },
    );
    void this._router.navigate([
      action === "event" ? "/events/new" : "/events/session/new",
    ]);
  }

  private _readQueryParams(params: ParamMap): void {
    const view = params.get("view");
    this.explicitView.set(
      view === "list" || view === "calendar" ? view : null,
    );
    this.query.set(params.get("q")?.trim() ?? "");
    const area = params.get("area")?.trim() ?? "";
    if (area !== this.areaKey()) {
      this.areaKey.set(area);
      this.areaAliases.set(area ? [area] : []);
    }
    this.selectedCategories.set(
      parseList(params, "category").filter(isEventCategory),
    );
    this.selectedSeriesIds.set(parseList(params, "series"));
    this.period.set(params.get("when") === "past" ? "past" : "upcoming");
    const month = params.get("month") ?? "";
    this._hasValidMonthParam = isMonthKey(month);
    this.month.set(this._hasValidMonthParam ? month : currentMonthKey());
    const requestedDay = params.get("day") ?? "";
    this.requestedDay.set(requestedDay);
    this._hasValidDayParam =
      /^\d{4}-\d{2}-\d{2}$/u.test(requestedDay) &&
      this.calendarRange().days.some((day) => day.key === requestedDay);
    this._hasPeriodParam =
      params.get("when") === "upcoming" || params.get("when") === "past";
    this.resultLimit.set(LIST_PAGE_SIZE);
  }

  private _updateQueryParams(
    queryParams: Record<string, string | null>,
    replaceUrl = false,
  ): Promise<boolean> {
    return this._router.navigate([], {
      relativeTo: this._route,
      queryParams,
      queryParamsHandling: "merge",
      replaceUrl,
    });
  }

  private _ensureShareableUrlDefaults(): void {
    if (this._urlCanonicalizationPending) return;

    const queryParams: Record<string, string | null> = {};
    if (this.view() === "calendar") {
      if (!this._hasValidMonthParam) queryParams["month"] = this.month();
      if (!this._hasValidDayParam) queryParams["day"] = this.selectedDay();
    } else if (!this._hasPeriodParam) {
      queryParams["when"] = this.period();
    }
    if (Object.keys(queryParams).length === 0) return;

    this._urlCanonicalizationPending = true;
    void this._updateQueryParams(queryParams, true).finally(() => {
      this._urlCanonicalizationPending = false;
    });
  }

  private _screenshotEventIndex(): ScreenshotEventIndex | null {
    return (
      (globalThis as ScreenshotGlobal).__PKSPOT_SCREENSHOT_EVENT_INDEX__ ?? null
    );
  }

  private _screenshotSeriesById(): Record<string, SeriesDocument> | null {
    return this._screenshotEventIndex()?.seriesById ?? null;
  }

  private _screenshotDiscovery(
    request: DiscoveryRequest,
  ): EventDiscoverySearchResult | null {
    const fixture = this._screenshotEventIndex();
    if (!fixture) return null;
    const query = request.query.toLocaleLowerCase();
    const range =
      request.view === "calendar"
        ? buildEventCalendarMonth(request.month, this._locale, [])
        : null;
    const now = Math.floor(Date.now() / 1000);
    const previews = fixture.events.map((event) =>
      screenshotEventPreview(event),
    );
    const invalidItems = previews.filter(
      (event) =>
        !event.id ||
        event.startSeconds === undefined ||
        event.endSeconds === undefined ||
        !event.timeZone,
    );
    let items = previews
      .map((event) => discoveryItemFromPreview(event))
      .filter((event): event is EventDiscoveryItem => !!event)
      .filter((event) => {
        if (
          query &&
          ![
            event.name,
            event.venueString,
            event.localityString,
            event.description,
          ]
            .filter(Boolean)
            .some((value) => value!.toLocaleLowerCase().includes(query))
        ) {
          return false;
        }
        if (
          request.areaKeys.length > 0 &&
          !event.communityKeys.some((key) => request.areaKeys.includes(key))
        ) {
          return false;
        }
        if (
          request.categories.length > 0 &&
          !event.eventCategories.some((category) =>
            request.categories.includes(category as EventCategory),
          )
        ) {
          return false;
        }
        if (
          request.seriesIds.length > 0 &&
          !event.seriesIds.some((id) => request.seriesIds.includes(id))
        ) {
          return false;
        }
        if (range) {
          return (
            event.startSeconds <= range.queryEndSeconds &&
            event.endSeconds >= range.queryStartSeconds
          );
        }
        return request.period === "past"
          ? event.endSeconds < now
          : event.endSeconds >= now;
      })
      .sort((left, right) =>
        request.period === "past"
          ? right.startSeconds - left.startSeconds
          : left.startSeconds - right.startSeconds,
      );
    const found = items.length;
    if (request.view === "list") items = items.slice(0, request.limit);
    return {
      items,
      found,
      page: 1,
      facets: buildFixtureFacets(items),
      invalidItems,
      invalidItemCount: invalidItems.length,
    };
  }

  private _screenshotInvalidEvents(): EventSearchPreview[] | null {
    const fixture = this._screenshotEventIndex();
    if (!fixture) return null;
    return fixture.events
      .map((event) => screenshotEventPreview(event))
      .filter(isInvalidEventPreview);
  }
}

const EVENT_CATEGORY_FILTERS = [
  "competition",
  "jam",
  "camp",
  "workshop",
  "show",
  "awards",
  "social",
  "travel",
] satisfies EventCategory[];

const EVENT_CATEGORY_SET: ReadonlySet<EventCategory> = new Set(
  EVENT_CATEGORY_FILTERS,
);

function isEventCategory(value: string): value is EventCategory {
  return EVENT_CATEGORY_SET.has(value as EventCategory);
}

function categoryLabel(category: EventCategory): string {
  switch (category) {
    case "competition":
      return $localize`:@@event_category.competition:Competition`;
    case "jam":
      return $localize`:@@event_category.jam:Jam`;
    case "camp":
      return $localize`:@@event_category.camp:Camp`;
    case "workshop":
      return $localize`:@@event_category.workshop:Workshop`;
    case "show":
      return $localize`:@@event_category.show:Show`;
    case "awards":
      return $localize`:@@event_category.awards:Awards`;
    case "social":
      return $localize`:@@event_category.social:Social`;
    case "travel":
      return $localize`:@@event_category.travel:Travel`;
    case "other":
      return $localize`:@@event_category.other:Other`;
  }
}

function defaultDayForMonth(month: string, now = new Date()): string {
  const today = eventLocalDateKey(
    now,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  return today.startsWith(`${month}-`) ? today : `${month}-01`;
}

function categoryIcon(category: EventCategory): string {
  switch (category) {
    case "competition":
      return "trophy";
    case "jam":
      return "groups";
    case "camp":
      return "camping";
    case "workshop":
      return "school";
    case "show":
      return "theater_comedy";
    case "awards":
      return "workspace_premium";
    case "social":
      return "celebration";
    case "travel":
      return "travel_explore";
    case "other":
      return "sell";
  }
}

function parseList(params: ParamMap, key: string): string[] {
  return [
    ...new Set(
      params
        .getAll(key)
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function serializeList(values: readonly string[]): string | null {
  return values.length > 0 ? values.join(",") : null;
}

function seriesFallbackLabel(seriesId: string): string {
  return seriesId
    .split("-")
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");
}

function readRememberedView(): EventsDiscoveryView | null {
  if (typeof localStorage === "undefined") return null;
  const value = localStorage.getItem(VIEW_STORAGE_KEY);
  return value === "calendar" || value === "list" ? value : null;
}

function rememberView(view: EventsDiscoveryView): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }
}

function screenshotEventPreview(
  event: ScreenshotEventSchema,
): EventSearchPreview {
  const startSeconds = Math.floor(Date.parse(event.start) / 1000);
  const endSeconds = Math.floor(Date.parse(event.end) / 1000);
  const timeZone = validTimeZone(event.time_zone);
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    description: event.description,
    venueString: event.venue_string,
    localityString: event.locality_string,
    bannerSrc: event.banner_src,
    bannerFit: event.banner_fit,
    bannerAccentColor: event.banner_accent_color,
    logoSrc: event.logo_src,
    logoFit: event.logo_fit,
    logoBackgroundColor: event.logo_background_color,
    sponsorName: event.sponsor?.name,
    sponsorLogoSrc: event.sponsor?.logo_src,
    sponsorLogoFit: event.sponsor?.logo_fit,
    sponsorLogoBackgroundColor: event.sponsor?.logo_background_color,
    isSponsored: event.is_promoted ?? event.is_sponsored ?? false,
    hasOrganization: event.organizer?.type === "organization",
    hasVenueSpot: (event.spot_ids?.length ?? 0) > 0,
    venueSpotCount: event.spot_ids?.length ?? 0,
    startSeconds: Number.isFinite(startSeconds) ? startSeconds : undefined,
    endSeconds: Number.isFinite(endSeconds) ? endSeconds : undefined,
    timeZone: timeZone ?? undefined,
    lifecycleStatus: event.lifecycle_status ?? "planned",
    location: event.location_raw
      ? [event.location_raw.lat, event.location_raw.lng]
      : undefined,
    eventLinks: event.event_links ?? [],
    ticketOptions: event.ticket_options ?? [],
    spotIds: event.spot_ids ?? [],
    communityKeys: event.community_keys ?? [],
    seriesIds: event.series_ids ?? [],
    eventCategories: event.event_categories ?? [],
    rsvpCounts: event.rsvp_counts ?? {
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    },
    seriesRoles: event.series_roles ?? [],
    qualifiesToKeys: event.qualifies_to_keys ?? [],
    requiredQualifierKeys: event.required_qualifier_keys ?? [],
  };
}

function discoveryItemFromPreview(
  event: EventSearchPreview,
): EventDiscoveryItem | null {
  if (
    !event.id ||
    event.startSeconds === undefined ||
    event.endSeconds === undefined ||
    !event.timeZone
  ) {
    return null;
  }
  return {
    ...event,
    startSeconds: event.startSeconds,
    endSeconds: event.endSeconds,
    timeZone: event.timeZone,
    lifecycleStatus: event.lifecycleStatus ?? "planned",
    rsvpCounts: event.rsvpCounts ?? {
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    },
  };
}

function validTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return value;
  } catch {
    return null;
  }
}

function isInvalidEventPreview(event: EventSearchPreview): boolean {
  return (
    !event.id ||
    event.startSeconds === undefined ||
    event.endSeconds === undefined ||
    !event.timeZone
  );
}

function buildFixtureFacets(
  items: readonly EventDiscoveryItem[],
): EventDiscoveryFacets {
  const count = (values: string[]): { value: string; count: number }[] => {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts].map(([value, valueCount]) => ({
      value,
      count: valueCount,
    }));
  };
  return {
    categories: count(items.flatMap((event) => event.eventCategories)),
    series: count(items.flatMap((event) => event.seriesIds)),
    communities: count(items.flatMap((event) => event.communityKeys)),
  };
}
