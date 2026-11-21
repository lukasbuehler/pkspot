import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  LOCALE_ID,
  resource,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { ActivatedRoute } from "@angular/router";
import { environment } from "../../../../environments/environment.default";
import { SearchService } from "../../../services/search.service";
import { SeriesService } from "../../../services/firebase/firestore/series.service";
import { AnalyticsService } from "../../../services/analytics.service";
import {
  eventCalendarFilterParams,
  eventCountryName,
  readEventCalendarFilters,
} from "../../../shared/event-calendar-filters";
import { EVENT_REGION_LABELS } from "../../../../db/schemas/EventGeography";
import { eventCalendarFeedName } from "../../../shared/event-calendar-feed-name";
import { eventCalendarSubscribeLinks } from "../../../shared/event-calendar-subscribe";
import { EventDiscoveryListComponent } from "../../events-page/event-discovery-list.component";
import {
  EventCalendarSubscribeDialogComponent,
  type EventCalendarSubscribeDialogData,
} from "../../event-calendar-subscribe-dialog/event-calendar-subscribe-dialog.component";

const PAGE_SIZE = 12;

/**
 * Upcoming-events list for partner websites, such as a national association
 * embedding its country's calendar. It reads the same filter parameters as the
 * Events page and the iCal feed (`country`, `region`, `category`, `tier`,
 * `series`), so all three always agree.
 */
@Component({
  selector: "app-embedded-events-page",
  imports: [MatButtonModule, MatIconModule, EventDiscoveryListComponent],
  templateUrl: "./embedded-events-page.component.html",
  styleUrl: "./embedded-events-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmbeddedEventsPageComponent {
  private readonly _route = inject(ActivatedRoute);
  private readonly _search = inject(SearchService);
  private readonly _series = inject(SeriesService);
  private readonly _dialog = inject(MatDialog);
  private readonly _analytics = inject(AnalyticsService);
  private readonly _locale = inject(LOCALE_ID);

  private readonly _params = toSignal(this._route.queryParamMap, {
    initialValue: this._route.snapshot.queryParamMap,
  });
  readonly filters = computed(() =>
    readEventCalendarFilters((key) => this._params().getAll(key)),
  );
  readonly showSubscribe = computed(
    () => this._params().get("showSubscribe") !== "false",
  );
  readonly limit = signal(PAGE_SIZE);

  readonly eventsResource = resource({
    params: () => ({ filters: this.filters(), limit: this.limit() }),
    loader: ({ params, abortSignal }) =>
      this._search.searchEventDiscovery({
        countryCodes: params.filters.countries,
        regionKeys: params.filters.regions,
        categories: params.filters.categories,
        listingTiers: params.filters.listingTiers,
        seriesIds: params.filters.seriesIds,
        endsAfterSeconds: Math.floor(Date.now() / 1000),
        sort: "upcoming",
        page: 1,
        perPage: params.limit,
        abortSignal,
      }),
  });
  readonly result = computed(() =>
    this.eventsResource.hasValue() ? this.eventsResource.value() : null,
  );
  readonly events = computed(() => this.result()?.items ?? []);

  readonly seriesResource = resource({
    params: () => {
      const ids = [...new Set(this.events().flatMap((event) => event.seriesIds))];
      return ids.length > 0 ? ids : undefined;
    },
    loader: ({ params }) => this._series.getSeriesByIds(params),
  });
  readonly seriesById = computed(() =>
    (this.seriesResource.hasValue() ? this.seriesResource.value() : undefined) ?? {},
  );

  loadMore(): void {
    this.limit.update((limit) => limit + PAGE_SIZE);
  }

  openSubscribe(): void {
    const filters = this.filters();
    const language = this._locale.split("-")[0];
    this._analytics.trackEvent("event_calendar_subscribe_opened", {
      filtered: Object.keys(eventCalendarFilterParams(filters)).length > 0,
      surface: "embed",
    });
    this._dialog.open<
      EventCalendarSubscribeDialogComponent,
      EventCalendarSubscribeDialogData
    >(EventCalendarSubscribeDialogComponent, {
      data: {
        links: eventCalendarSubscribeLinks(
          environment.baseUrl || "https://pkspot.app",
          filters,
          eventCalendarFeedName(filters, language),
          language,
        ),
        // Partner sites mostly filter by place; name it so subscribers know what they get.
        filterSummary: [
          ...filters.countries.map((code) => eventCountryName(code, this._locale)),
          ...filters.regions.map((region) => EVENT_REGION_LABELS[region]),
        ].join(" · "),
      },
      width: "560px",
      maxWidth: "calc(100vw - 32px)",
    });
  }
}
