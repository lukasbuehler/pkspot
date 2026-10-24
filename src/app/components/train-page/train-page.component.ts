import { EventCardComponent } from "../event-card/event-card.component";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  PLATFORM_ID,
  computed,
  inject,
  resource,
  signal,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { Router, RouterLink } from "@angular/router";
import { MatSnackBar } from "@angular/material/snack-bar";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatDialog } from "@angular/material/dialog";
import { LocalLegendService } from "../../services/local-legend.service";
import { LocalLegendJoinDialogComponent } from "../local-legend-join-dialog/local-legend-join-dialog.component";
import { MatIconModule } from "@angular/material/icon";
import { MatListModule } from "@angular/material/list";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { environment } from "../../../environments/environment.default";
import type { LocaleCode } from "../../../db/models/Interfaces";
import type { LogEntryDocument } from "../../../db/schemas/LogEntrySchema";
import type { PlannedSession } from "../../../db/schemas/PlannedSessionSchema";
import type { RecoveryPauseDocument } from "../../../db/schemas/RecoveryPauseSchema";
import type { SessionRecordDocument } from "../../../db/schemas/SessionRecordSchema";
import {
  activityDaysFromMonths,
  formatDuration,
  localeFirstWeekday,
  monthKey,
  summarizeTrainingStreaks,
} from "../../features/training-log-activity";
import {
  spotRankDetail,
  spotRankLabel,
  spotRankState,
  type SpotRankState,
} from "../../features/spot-rank";
import {
  checkOutDurationMinutes,
  type TrainingRanksSchema,
  type TrainingMonthSchema,
} from "../../../db/schemas/TrainingSummarySchema";
import { shiftMonth, summarizeTrainingPeriod } from "../../../db/utils/training-summary";
import { TrainingSummaryService } from "../../services/firebase/firestore/training-summary.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { CommunityFollowsService } from "../../services/firebase/firestore/community-follows.service";
import { LogEntriesService } from "../../services/firebase/firestore/log-entries.service";
import { RecoveryPausesService } from "../../services/firebase/firestore/recovery-pauses.service";
import { SessionRecordsService } from "../../services/firebase/firestore/session-records.service";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { FeatureTelemetryService } from "../../services/feature-telemetry.service";
import { GeolocationService } from "../../services/geolocation.service";
import { LocationAccessService } from "../../services/location-access.service";
import { MapsApiService } from "../../services/maps-api.service";
import { MyEventsService } from "../../services/my-events.service";
import { PlannedSessionsService } from "../../services/planned-sessions.service";
import {
  CommunitySearchPreview,
  SearchService,
} from "../../services/search.service";
import { formatDistanceKm } from "../../shared/distance-format";
import { getWeatherForecastState, getWeatherStateIcon } from "../../weather/weather-display";
import { shouldRecommendDrySpots } from "../../weather/spot-weather-context";
import { formatTemperature } from "../../weather/weather-temperature";
import type { WeatherResponse } from "../../weather/weather.models";
import { WeatherService } from "../../weather/weather.service";
import { AccountPreferencesService } from "../../services/account-preferences.service";
import { CheckInLogPromptComponent } from "../check-in-log-prompt/check-in-log-prompt.component";
import {
  FabMenuComponent,
  type FabMenuAction,
} from "../fab-menu/fab-menu.component";
import { FilterChipsBarComponent } from "../filter-chips-bar/filter-chips-bar.component";
import { LocationAccessDialogComponent } from "../location-access-dialog/location-access-dialog.component";
import { PrecipitationChartComponent } from "../precipitation-chart/precipitation-chart.component";
import {
  getFilterModeFromUrlParam,
  SpotFilterMode,
} from "../spot-map/spot-filter-config";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import {
  TrainContextDialogComponent,
  type TrainContextDialogAction,
  type TrainContextDialogData,
} from "../train-context-dialog/train-context-dialog.component";
import { SpotRankIconComponent } from "../spot-rank-icon/spot-rank-icon.component";
import { TrainingActivityContributionGraphComponent } from "../training-activity-contribution-graph/training-activity-contribution-graph.component";
import {
  WeatherForecastDialogComponent,
  type WeatherForecastDialogData,
} from "../weather-forecast-dialog/weather-forecast-dialog.component";
import {
  resolveTrainingCenter,
  resolveTrainingSpotRadiusKm,
} from "./training-area";
import { trainingRainOutlook } from "./training-conditions";
import {
  selectTrainingMoments,
  type TrainingMoment,
} from "./training-moments";
import {
  rankCommunityTrainingEvents,
  rankNearbyTrainingEvents,
  rankTrainingSpots,
  withTrainingEventContext,
  type RankedTrainingEvent,
  type RankedTrainingSpot,
} from "./training-recommendations";

type SpotFilterSource = "user" | "weather" | null;

/** How many "now" cards may stack above the recommendations. */
const MAX_MOMENTS = 2;
const MAX_COMING_UP = 5;
/** The rail shows the current week; the full history lives in "Looking back". */
const RHYTHM_WEEKS = 1;
const RECENT_SESSIONS = 30;
const MAX_TOP_RANKS = 3;
type RankedState = Extract<SpotRankState, { kind: "ranked" }>;
/** Days into a new month during which last month's final ranks are shown. */
const LAST_MONTH_RANK_DAYS = 7;
const CLOCK_INTERVAL_MS = 60_000;

export interface TrainingMomentView {
  key: string;
  icon: string;
  eyebrow: string;
  title: string;
  detail: string;
  link: string[];
  queryParams?: Record<string, string>;
  actionLabel: string;
  /** Set for a running check-in session, which can be checked out from the card. */
  checkOutSessionId?: string;
}

export interface ComingUpItem {
  id: string;
  link: string[];
  month: string;
  day: string;
  title: string;
  detail: string;
  /** Straight-line distance from the training area, shown below the card. */
  distance: string | null;
  community: string | null;
  relationship: string | null;
}

export interface TopRankView {
  spotId: string;
  rank: number;
  name: string;
  label: string;
  /** "Tied with 2 others", when the rank is shared. */
  detail: string | null;
  legend: boolean;
}

export interface RecentEntryView {
  id: string;
  weekday: string;
  title: string;
  detail: string;
}

@Component({
  selector: "app-train-page",
  imports: [
    CheckInLogPromptComponent,
    EventCardComponent,
    FabMenuComponent,
    FilterChipsBarComponent,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    PrecipitationChartComponent,
    RouterLink,
    SpotPreviewCardComponent,
    TrainingActivityContributionGraphComponent,
    SpotRankIconComponent,
  ],
  templateUrl: "./train-page.component.html",
  styleUrl: "./train-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainPageComponent {
  private readonly featureTelemetry = inject(FeatureTelemetryService);
  private readonly auth = inject(AuthenticationService);
  private readonly follows = inject(CommunityFollowsService);
  private readonly geolocation = inject(GeolocationService);
  private readonly mapsApi = inject(MapsApiService);
  private readonly locationAccess = inject(LocationAccessService);
  private readonly dialog = inject(MatDialog);
  readonly localLegend = inject(LocalLegendService);
  /** Invite people who have not chosen yet, once they have verified training this month. */
  readonly showLocalLegendInvite = computed(() => {
    if (this.localLegend.state() !== "undecided") return false;
    const month = this.trainingMonths().find((item) => item.month === this.currentMonthKey());
    return Object.values(month?.spots ?? {}).some((spot) => spot.verified_days > 0);
  });

  openLocalLegend(): void {
    LocalLegendJoinDialogComponent.open(this.dialog);
  }
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly search = inject(SearchService);
  private readonly weatherService = inject(WeatherService);
  private readonly sessionsService = inject(SessionRecordsService);
  private readonly logsService = inject(LogEntriesService);
  private readonly recoveryPausesService = inject(RecoveryPausesService);
  private readonly trainingSummaries = inject(TrainingSummaryService);
  private readonly plannedSessionsService = inject(PlannedSessionsService);
  private readonly myEvents = inject(MyEventsService);
  private readonly dateTime = inject(DateTimeFormatService);
  private readonly accountPreferences = inject(AccountPreferencesService);
  private readonly locale = inject(LOCALE_ID) as LocaleCode;
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // Every section loads on its own so a slow or failed source never blocks
  // the rest of the page. Generations drop responses from superseded loads.
  private eventsGeneration = 0;
  private spotsGeneration = 0;
  private weatherGeneration = 0;
  private historyGeneration = 0;
  private plannedGeneration = 0;

  /** Ticks once a minute so "starts in" labels and the now card stay current. */
  readonly now = signal(Date.now());
  readonly signedIn = signal(false);
  readonly locating = signal(false);
  readonly area = signal<CommunitySearchPreview | null>(null);

  readonly eventsLoading = signal(true);
  readonly eventsFailed = signal(false);
  readonly spotsLoading = signal(true);
  readonly weatherLoading = signal(true);
  readonly loading = computed(
    () => this.eventsLoading() || this.spotsLoading() || this.weatherLoading(),
  );

  readonly followedCommunities = signal<CommunitySearchPreview[]>([]);
  /** Every upcoming event with distance, before any radius filtering. */
  readonly upcomingEvents = signal<RankedTrainingEvent[]>([]);
  readonly nearbyEvents = signal<RankedTrainingEvent[]>([]);
  readonly communityEvents = signal<RankedTrainingEvent[]>([]);
  readonly radiusKm = signal(25);
  readonly spots = signal<RankedTrainingSpot[]>([]);
  readonly selectedSpotFilter = signal("");
  readonly spotFilterSource = signal<SpotFilterSource>(null);
  readonly weather = signal<WeatherResponse | null>(null);

  /** Recent sessions only: the active-session card and the log prompt need no more. */
  readonly trainingSessions = signal<SessionRecordDocument[]>([]);
  /** Private monthly summaries; the source for rhythm, streaks and month stats. */
  readonly trainingMonths = signal<TrainingMonthSchema[]>([]);
  /** Published ranks for this month and last month. */
  readonly spotRanks = signal<TrainingRanksSchema[]>([]);
  readonly trainingLogs = signal<LogEntryDocument[]>([]);
  readonly recoveryPauses = signal<RecoveryPauseDocument[]>([]);
  readonly trainingHistoryFailed = signal(false);
  readonly trainingSessionsLoaded = signal(false);
  /** The session being checked out, to disable its button while saving. */
  readonly checkingOut = signal<string | null>(null);
  readonly plannedSessions = signal<PlannedSession[]>([]);

  readonly nearbyLocality = resource({
    params: () => {
      const location = this.geolocation.currentLocation()?.location;
      if (!this.isBrowser || this.area() || !location) return undefined;
      // Avoid another lookup for every small GPS correction.
      return `${location.lat.toFixed(3)},${location.lng.toFixed(3)}`;
    },
    loader: ({ params }) => {
      const [lat, lng] = params.split(",").map(Number);
      return this.mapsApi.getLocalityName({ lat, lng });
    },
  });

  readonly hasTrainingArea = computed(
    () => !!this.geolocation.currentLocation()?.location || !!this.area(),
  );

  readonly rhythmWeeks = RHYTHM_WEEKS;
  readonly fabLabel = $localize`:@@trainingLog.add:Add to training log`;
  readonly fabActions: readonly FabMenuAction[] = [
    { id: "activity", icon: "add", label: $localize`:@@trainingLog.new:New training entry` },
    ...(environment.features.plannedSessions
      ? [{ id: "session", icon: "groups", label: $localize`:@@planned.plan:Plan a session` }]
      : []),
  ];

  // Context -----------------------------------------------------------------

  readonly weatherSummary = computed(() => {
    const weather = this.weather();
    if (!weather) return null;
    const current = weather.current ?? weather.forecast?.[0];
    const condition = current?.condition ?? "unknown";
    const unit = this.accountPreferences.temperatureUnit(weather.countryCode);
    const outlook = trainingRainOutlook(weather);
    return {
      icon: getWeatherStateIcon(condition, current?.isDay),
      temperature:
        current?.temperatureC === undefined
          ? null
          : formatTemperature(current.temperatureC, unit, false),
      condition: current
        ? getWeatherForecastState({ ...current, condition }).label
        : null,
      outlook:
        outlook.kind === "raining"
          ? $localize`:@@train.conditions.rainNow:Rain now`
          : outlook.kind === "dry-until"
            ? $localize`:@@train.conditions.dryUntil:Dry until ${this.formatTime(outlook.time, weather.timeZone)}:time:`
            : $localize`:@@train.conditions.dry:Dry for now`,
      timeZone: weather.timeZone,
    };
  });
  private readonly contextDialogWeather = computed(() => {
    const summary = this.weatherSummary();
    return summary
      ? {
          icon: summary.icon,
          temperature: summary.temperature,
          summary: [summary.condition, summary.outlook].filter(Boolean).join(" · "),
        }
      : null;
  });
  readonly forecastPoints = computed(() => this.weather()?.forecast ?? []);
  readonly weatherFilterActive = computed(
    () =>
      this.spotFilterSource() === "weather" &&
      this.selectedSpotFilter() === SpotFilterMode.Dry,
  );

  // Now and soon --------------------------------------------------------------

  readonly moments = computed(() =>
    selectTrainingMoments({
      nowMs: this.now(),
      sessions: this.trainingSessions(),
      events: this.upcomingEvents(),
      goingEventIds: this.myEvents.goingEventIds(),
      savedEventIds: this.myEvents.savedEventIds(),
      plannedSessions: this.plannedSessions(),
      sessionIdleWindowMs: SessionRecordsService.CHECK_IN_IDLE_WINDOW_MS,
    }).slice(0, MAX_MOMENTS),
  );
  /**
   * The log prompt asks about a finished check-in. While a check-in session is
   * still running, the green "Training now" card already offers notes.
   */
  readonly promptSessions = computed(() => {
    const active = new Set(
      this.moments()
        .filter((moment) => moment.kind === "active-session")
        .map((moment) => moment.session.id),
    );
    return this.trainingSessions().filter((session) => !active.has(session.id));
  });
  readonly momentViews = computed(() =>
    this.moments().map((moment) => this.toMomentView(moment)),
  );

  // Recommendations -------------------------------------------------------------

  readonly bestSpots = computed(() => this.spots().slice(0, 4));
  readonly comingUp = computed<ComingUpItem[]>(() => {
    const featured = new Set(
      this.moments()
        .filter((moment) => moment.kind === "event")
        .map((moment) => moment.event.id),
    );
    const communityEventIds = new Set(this.communityEvents().map((event) => event.id));
    const events = new Map<string, RankedTrainingEvent>();
    for (const event of [
      ...this.nearbyEvents().slice(0, 4),
      ...this.communityEvents().slice(0, 3),
    ]) {
      if (!featured.has(event.id)) events.set(event.id, event);
    }
    return [...events.values()]
      .sort((left, right) => left.startSeconds - right.startSeconds)
      .slice(0, MAX_COMING_UP)
      .map((event) =>
        this.toComingUpItem(event, communityEventIds.has(event.id)),
      );
  });

  /**
   * Full events for the Coming up cards (media, series, dates). Loaded in one
   * search call; the compact list stays as the fallback while it loads or if
   * it fails.
   */
  private readonly comingUpEvents = resource({
    params: () => {
      const ids = this.comingUp().map((item) => item.id);
      return this.isBrowser && ids.length ? ids : undefined;
    },
    loader: ({ params }) => this.search.getEventCardsByIds(params),
  });

  readonly comingUpCards = computed(() => {
    const events = this.comingUpEvents.hasValue() ? this.comingUpEvents.value() : [];
    const byId = new Map(events.map((event) => [String(event.id), event]));
    const cards = this.comingUp().flatMap((item) => {
      const event = byId.get(item.id);
      return event ? [{ item, event }] : [];
    });
    return cards.length === this.comingUp().length ? cards : [];
  });

  // Rhythm and reflection --------------------------------------------------------

  readonly trainingActivityDays = computed(() =>
    activityDaysFromMonths(this.trainingMonths()),
  );
  private readonly currentMonthKey = computed(() => monthKey(this.now()));
  readonly monthStats = computed(() =>
    summarizeTrainingPeriod(this.trainingMonths(), new Set([this.currentMonthKey()])),
  );
  private readonly previousMonthStats = computed(() =>
    summarizeTrainingPeriod(
      this.trainingMonths(),
      new Set([shiftMonth(this.currentMonthKey(), -1)]),
    ),
  );
  readonly monthSessionDelta = computed(
    () => this.monthStats().sessions - this.previousMonthStats().sessions,
  );
  readonly monthDeltaLabel = computed(() => {
    const delta = this.monthSessionDelta();
    const signed = new Intl.NumberFormat(this.locale, {
      signDisplay: "exceptZero",
    }).format(delta);
    return $localize`:@@train.reflection.vsLastMonth:${signed}:delta: vs last month`;
  });
  readonly monthName = computed(() =>
    this.dateTime.format(new Date(this.now()), { month: "long" }),
  );
  readonly streaks = computed(() =>
    summarizeTrainingStreaks(
      this.trainingActivityDays(),
      this.recoveryPauses(),
      localeFirstWeekday(this.locale),
      new Date(this.now()),
    ),
  );
  readonly weekSessionCount = computed(() => {
    const firstWeekday = localeFirstWeekday(this.locale);
    const today = new Date(this.now());
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    start.setDate(start.getDate() - ((start.getDay() - firstWeekday + 7) % 7));
    const startKey = localDateKey(start);
    return this.trainingActivityDays()
      .filter((day) => day.key >= startKey && day.key <= localDateKey(today))
      .reduce((total, day) => total + day.sessionCount, 0);
  });
  readonly hasTrainingHistory = computed(
    () => this.trainingActivityDays().length > 0,
  );
  /**
   * The month whose ranks the rail shows. Early in a month, before anyone has
   * a rank, last month's final ranks keep the card from going blank.
   */
  private readonly rankMonth = computed<TrainingRanksSchema | null>(() => {
    const current = this.currentMonthKey();
    const hasRanked = (ranks: TrainingRanksSchema | undefined) =>
      !!ranks && Object.values(ranks.spots).some((spot) => spot.status === "ranked");
    const ranks = this.spotRanks();
    const now = ranks.find((item) => item.month === current);
    if (hasRanked(now)) return now!;
    const previous = ranks.find((item) => item.month === shiftMonth(current, -1));
    return new Date(this.now()).getDate() <= LAST_MONTH_RANK_DAYS && hasRanked(previous) ? previous! : null;
  });
  readonly topRanksTitle = computed(() => {
    const ranks = this.rankMonth();
    if (!ranks || ranks.month === this.currentMonthKey()) {
      return $localize`:@@train.ranks.title:Your Spot ranks this month`;
    }
    const [year, month] = ranks.month.split("-").map(Number);
    const name = this.dateTime.format(new Date(year, month - 1, 15), { month: "long" });
    return $localize`:@@train.ranks.titleLastMonth:Your Spot ranks in ${name}:month:`;
  });
  /** Your best private ranks, with names from your own summary. */
  readonly topRanks = computed<TopRankView[]>(() => {
    const ranks = this.rankMonth();
    // Ranks are shown only to Local Legend participants.
    if (!ranks || !this.localLegend.enabled()) return [];
    const summary = this.trainingMonths().find((item) => item.month === ranks.month);
    return Object.entries(ranks.spots)
      .flatMap(([spotId, spot]) => {
        const state = spotRankState(ranks, spotId, spot.verified_days);
        return state?.kind === "ranked" ? [{ spotId, state: state as RankedState }] : [];
      })
      .sort((left, right) => left.state.rank - right.state.rank || right.state.verifiedDays - left.state.verifiedDays)
      .slice(0, MAX_TOP_RANKS)
      .map(({ spotId, state }) => ({
        spotId,
        rank: state.rank,
        name: summary?.spots[spotId]?.name ?? $localize`:@@trainingStats.unnamedSpot:Spot`,
        label: spotRankLabel(state),
        detail: state.tiedWith > 0 ? spotRankDetail(state) : null,
        legend: state.legend,
      }));
  });
  readonly recentEntries = computed<RecentEntryView[]>(() =>
    [...this.trainingLogs()]
      .sort((left, right) => right.activity_at_raw_ms - left.activity_at_raw_ms)
      .slice(0, 3)
      .map((entry) => this.toRecentEntry(entry)),
  );

  constructor() {
    if (this.isBrowser) {
      const timer = setInterval(() => this.now.set(Date.now()), CLOCK_INTERVAL_MS);
      inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }
    this.auth.authState$.pipe(takeUntilDestroyed()).subscribe((user) => {
      this.signedIn.set(!!user?.uid);
      void this.initialize();
    });
  }

  openContext(): void {
    this.dialog
      .open<
        TrainContextDialogComponent,
        TrainContextDialogData,
        TrainContextDialogAction
      >(TrainContextDialogComponent, {
        data: {
          area: this.area(),
          weather: this.contextDialogWeather(),
        },
        width: "520px",
        maxWidth: "calc(100vw - 24px)",
        autoFocus: "dialog",
        restoreFocus: true,
      })
      .afterClosed()
      .subscribe((action) => this.handleContextAction(action));
  }

  openWeatherForecast(): void {
    const weather = this.weather();
    if (!weather) return;
    this.dialog.open<WeatherForecastDialogComponent, WeatherForecastDialogData>(
      WeatherForecastDialogComponent,
      {
        data: {
          spotName: "",
          response: weather,
          context: "map-region",
        },
        width: "680px",
        maxWidth: "calc(100vw - 24px)",
        maxHeight: "calc(100dvh - 24px)",
        autoFocus: "dialog",
        restoreFocus: true,
      },
    );
  }

  onFabAction(action: string): void {
    if (action === "activity") void this.router.navigateByUrl("/train/log/new");
    if (action === "session") void this.router.navigateByUrl("/events/session/new");
  }

  async useMyLocation(): Promise<void> {
    if (!this.locationAccess.enabled()) {
      this.dialog
        .open(LocationAccessDialogComponent, {
          maxWidth: "min(420px, 92vw)",
        })
        .afterClosed()
        .subscribe((enabled) => {
          if (enabled) void this.useMyLocation();
        });
      return;
    }

    this.locating.set(true);
    try {
      if (!(await this.locationAccess.startWatchingIfEnabled({ requestPermission: true }))) return;
      const timeoutAt = Date.now() + 10_000;
      while (!this.geolocation.currentLocation() && Date.now() < timeoutAt) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (this.geolocation.currentLocation()) {
        this.area.set(null);
      }
      await this.load();
    } finally {
      this.locating.set(false);
    }
  }

  chooseArea(area: CommunitySearchPreview): void {
    this.area.set(area);
    void this.load();
  }

  clearTrainingArea(): void {
    this.area.set(null);
    void this.load();
  }

  setSpotFilter(value: string): void {
    this.spotFilterSource.set(value ? "user" : null);
    this.selectedSpotFilter.set(value);
    void this.loadSpots();
  }

  retryEvents(): void {
    void this.loadEvents();
  }

  trainingDurationLabel(minutes: number): string {
    return formatDuration(minutes);
  }

  /**
   * Ends a running check-in session now. Optional: sessions also end on their
   * own when idle, and the duration stays editable in the log.
   */
  async checkOut(sessionId: string): Promise<void> {
    const session = this.trainingSessions().find((item) => item.id === sessionId);
    if (!session || this.checkingOut()) return;
    const minutes = checkOutDurationMinutes(session.started_at_raw_ms, Date.now());
    this.checkingOut.set(sessionId);
    try {
      const { endedAtRawMs } = await this.trainingSummaries.setCheckInSessionDuration({
        sessionRecordId: sessionId,
        durationMinutes: minutes,
      });
      this.trainingSessions.update((sessions) =>
        sessions.map((item) => item.id === sessionId ? { ...item, ended_at_raw_ms: endedAtRawMs } : item),
      );
      this.snackbar
        .open(
          $localize`:@@train.checkOut.done:Checked out after ${formatDuration(minutes)}:duration:`,
          $localize`:@@train.now.addNotes:Add notes`,
          { duration: 8_000 },
        )
        .onAction()
        .subscribe(() => {
          void this.router.navigate(["/train/log/new"], { queryParams: { sessionRecord: sessionId } });
        });
    } catch (error) {
      console.warn("[Train] check-out failed", error);
      this.snackbar.open(
        $localize`:@@train.checkOut.failed:Couldn't check out. Please try again.`,
        undefined,
        { duration: 5_000 },
      );
    } finally {
      this.checkingOut.set(null);
    }
  }

  async loadTrainingHistory(): Promise<void> {
    const generation = ++this.historyGeneration;
    const uid = this.auth.user.uid;
    this.trainingLogs.set([]);
    this.trainingSessions.set([]);
    this.trainingMonths.set([]);
    this.spotRanks.set([]);
    this.recoveryPauses.set([]);
    this.trainingHistoryFailed.set(false);
    this.trainingSessionsLoaded.set(false);
    if (!uid) return;
    try {
      const [logs, sessions, months, pauses, ranks] = await Promise.allSettled([
        this.logsService.listMine(),
        this.sessionsService.listMine(RECENT_SESSIONS),
        this.trainingSummaries.listMyMonths(),
        this.recoveryPausesService.listMine(),
        Promise.all([
          this.trainingSummaries.getMyRanks(monthKey(Date.now())),
          this.trainingSummaries.getMyRanks(shiftMonth(monthKey(Date.now()), -1)),
        ]),
      ]);
      if (generation !== this.historyGeneration || uid !== this.auth.user.uid) return;
      if (logs.status === "fulfilled") this.trainingLogs.set(logs.value);
      if (sessions.status === "fulfilled" && months.status === "fulfilled") {
        this.trainingSessions.set(sessions.value);
        this.trainingMonths.set(months.value);
        this.trainingSessionsLoaded.set(true);
      }
      // Recovery pauses and ranks only refine the page; their absence is not an error.
      if (pauses.status === "fulfilled") this.recoveryPauses.set(pauses.value);
      if (ranks.status === "fulfilled") {
        this.spotRanks.set(ranks.value.filter((item): item is TrainingRanksSchema => item !== null));
      }
      this.trainingHistoryFailed.set(
        logs.status === "rejected" ||
          sessions.status === "rejected" ||
          months.status === "rejected",
      );
    } catch (error) {
      if (generation !== this.historyGeneration || uid !== this.auth.user.uid) return;
      this.trainingHistoryFailed.set(true);
      console.warn("[Train] training history unavailable", error);
    }
  }

  private async initialize(): Promise<void> {
    await this.useAvailableLocation();
    await this.load();
  }

  private async load(): Promise<void> {
    await Promise.allSettled([
      this.loadSpots(),
      this.loadWeather(),
      this.loadEvents(),
      this.loadTrainingHistory(),
      this.loadPlannedSessions(),
    ]);
  }

  private async useAvailableLocation(): Promise<void> {
    if (
      !this.isBrowser ||
      this.area() ||
      this.geolocation.currentLocation() ||
      !this.locationAccess.enabled()
    ) {
      return;
    }

    this.locating.set(true);
    try {
      await this.locationAccess.startWatchingIfEnabled();
      const timeoutAt = Date.now() + 5_000;
      while (
        !this.geolocation.currentLocation() &&
        !this.geolocation.error() &&
        Date.now() < timeoutAt
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } finally {
      this.locating.set(false);
    }
  }

  private async loadEvents(): Promise<void> {
    const generation = ++this.eventsGeneration;
    this.eventsLoading.set(true);
    this.eventsFailed.set(false);
    try {
      const followed = this.signedIn() ? await this.loadFollowedCommunities() : [];
      if (generation !== this.eventsGeneration) return;
      this.followedCommunities.set(followed);

      const nowSeconds = Math.floor(Date.now() / 1000);
      const followedCommunityKeys = followed.map(
        (community) => community.communityKey,
      );
      const [nearbyResult, communityResult] = await Promise.all([
        this.search.searchEventDiscovery({
          endsAfterSeconds: nowSeconds,
          startsBeforeSeconds: nowSeconds + 14 * 24 * 60 * 60,
          sort: "upcoming",
          perPage: 250,
        }),
        followedCommunityKeys.length
          ? this.search.searchEventDiscovery({
              endsAfterSeconds: nowSeconds,
              startsBeforeSeconds: nowSeconds + 30 * 24 * 60 * 60,
              areaKeys: followedCommunityKeys,
              sort: "upcoming",
              perPage: 250,
            })
          : Promise.resolve({ items: [] }),
      ]);
      if (generation !== this.eventsGeneration) return;

      const center = this.center();
      const nearby = rankNearbyTrainingEvents(nearbyResult.items, nowSeconds, center);
      this.radiusKm.set(nearby.radiusKm);
      this.nearbyEvents.set(nearby.items);

      const nearbyEventIds = new Set(nearby.items.map((event) => event.id));
      this.communityEvents.set(
        rankCommunityTrainingEvents(communityResult.items, nowSeconds, center)
          .filter((event) => !nearbyEventIds.has(event.id)),
      );
      const allEvents = new Map(
        [...nearbyResult.items, ...communityResult.items].map((event) => [event.id, event]),
      );
      this.upcomingEvents.set(
        withTrainingEventContext([...allEvents.values()], nowSeconds, center),
      );
    } catch (error) {
      if (generation !== this.eventsGeneration) return;
      this.featureTelemetry.failure("train-page", "load-events", error);
      console.warn("[Train] events unavailable", error);
      this.nearbyEvents.set([]);
      this.communityEvents.set([]);
      this.upcomingEvents.set([]);
      this.eventsFailed.set(true);
    } finally {
      if (generation === this.eventsGeneration) this.eventsLoading.set(false);
    }
  }

  private async loadFollowedCommunities(): Promise<CommunitySearchPreview[]> {
    try {
      const records = await this.follows.listMine();
      return await this.search.getCommunityPreviewsByKeys(
        records.map((record) => record.community_key),
      );
    } catch (error) {
      // Nearby events are still useful without followed communities.
      console.warn("[Train] followed communities unavailable", error);
      return [];
    }
  }

  private async loadSpots(): Promise<void> {
    const generation = ++this.spotsGeneration;
    const center = this.center();
    if (!center) {
      this.spots.set([]);
      this.spotsLoading.set(false);
      return;
    }
    this.spotsLoading.set(true);
    try {
      const filterMode = getFilterModeFromUrlParam(this.selectedSpotFilter());
      const radiusKm = resolveTrainingSpotRadiusKm(this.area());
      const candidates = await this.search.searchTopSpotPreviewsNearLocation(
        { lat: center[0], lng: center[1] },
        radiusKm,
        12,
        filterMode,
      );
      if (generation !== this.spotsGeneration) return;
      this.spots.set(rankTrainingSpots(candidates, center, radiusKm, 4));
    } catch (error) {
      if (generation !== this.spotsGeneration) return;
      console.warn("[Train] nearby spots unavailable", error);
      this.spots.set([]);
    } finally {
      if (generation === this.spotsGeneration) this.spotsLoading.set(false);
    }
  }

  private async loadWeather(): Promise<void> {
    const generation = ++this.weatherGeneration;
    const center = this.center();
    if (!center) {
      this.weather.set(null);
      this.weatherLoading.set(false);
      return;
    }
    this.weatherLoading.set(true);
    let weather: WeatherResponse | null = null;
    try {
      weather = await this.weatherService.getCurrentAndNearFutureForTileAt(
        { lat: center[0], lng: center[1] },
        12,
      );
    } catch (error) {
      console.warn("[Train] weather unavailable", error);
    }
    if (generation !== this.weatherGeneration) return;
    this.weather.set(weather);
    this.weatherLoading.set(false);
    // Spots are already showing; re-rank them only if the forecast changes
    // whether dry Spots should be preferred.
    if (this.applyWeatherSpotFilter(weather)) void this.loadSpots();
  }

  private async loadPlannedSessions(): Promise<void> {
    const generation = ++this.plannedGeneration;
    this.plannedSessions.set([]);
    if (!environment.features.plannedSessions || !this.signedIn()) return;
    try {
      const views = await this.plannedSessionsService.list("mine");
      if (generation !== this.plannedGeneration) return;
      this.plannedSessions.set(views.map((view) => view.session));
    } catch (error) {
      console.warn("[Train] planned sessions unavailable", error);
    }
  }

  /** Returns true when the selected Spot filter changed. */
  private applyWeatherSpotFilter(weather: WeatherResponse | null): boolean {
    if (this.spotFilterSource() === "user") return false;
    const useDryFilter = shouldRecommendDrySpots(weather);
    const next = useDryFilter ? SpotFilterMode.Dry : "";
    const changed = this.selectedSpotFilter() !== next;
    this.selectedSpotFilter.set(next);
    this.spotFilterSource.set(useDryFilter ? "weather" : null);
    return changed;
  }

  private handleContextAction(action: TrainContextDialogAction | undefined): void {
    if (!action) return;
    switch (action.kind) {
      case "use-location":
        void this.useMyLocation();
        return;
      case "choose-area":
        this.chooseArea(action.area);
        return;
      case "clear-area":
        this.clearTrainingArea();
        return;
      case "show-weather":
        this.openWeatherForecast();
        return;
    }
  }

  private center(): [number, number] | undefined {
    return resolveTrainingCenter(
      this.area(),
      this.geolocation.currentLocation()?.location,
    );
  }

  private toMomentView(moment: TrainingMoment): TrainingMomentView {
    switch (moment.kind) {
      case "active-session": {
        const place = moment.session.spot_visits
          .map((visit) => visit.spot_name)
          .filter((name): name is string => !!name)
          .join(", ");
        const since = this.formatTime(new Date(moment.session.started_at_raw_ms).toISOString());
        return {
          key: moment.key,
          icon: "sports_gymnastics",
          eyebrow: $localize`:@@train.now.training:Training now`,
          title: place || $localize`:@@train.now.yourSession:Your session`,
          detail: $localize`:@@train.now.checkedInAt:Checked in at ${since}:time:`,
          link: ["/train/log/new"],
          queryParams: { sessionRecord: moment.session.id },
          actionLabel: $localize`:@@train.now.addNotes:Add notes`,
          checkOutSessionId: moment.session.id,
        };
      }
      case "planned-session":
        return {
          key: moment.key,
          icon: "groups",
          eyebrow: this.momentTiming(moment.phase, moment.minutesUntilStart, moment.session.startsAt, moment.session.timeZone),
          title: moment.session.title,
          detail: $localize`:@@train.now.yourPlan:Your planned session`,
          link: ["/events/session", moment.session.id],
          actionLabel: $localize`:@@train.now.openSession:Open session`,
        };
      case "event": {
        const { event } = moment;
        const timing = this.momentTiming(
          moment.phase,
          moment.minutesUntilStart,
          event.startSeconds * 1000,
          event.timeZone,
        );
        const relationship =
          moment.relationship === "going"
            ? $localize`:@@train.now.going:You're going`
            : moment.relationship === "saved"
              ? $localize`:@@event_rsvp.interested:Interested`
              : null;
        return {
          key: moment.key,
          icon: "event",
          eyebrow: relationship ? `${timing} · ${relationship}` : timing,
          title: event.name,
          detail: this.eventDetail(event),
          link: ["/events", event.slug ?? event.id],
          actionLabel: $localize`:@@train.now.openEvent:Open event`,
        };
      }
    }
  }

  private momentTiming(
    phase: "live" | "soon",
    minutesUntilStart: number,
    startMs: number,
    timeZone: string | undefined,
  ): string {
    if (phase === "live") return $localize`:@@train.now.live:Live now`;
    if (minutesUntilStart < 60) {
      return $localize`:@@train.now.startsInMinutes:Starts in ${minutesUntilStart}:minutes: min`;
    }
    const time = this.formatTime(new Date(startMs).toISOString(), timeZone);
    return $localize`:@@train.now.startsAt:Starts at ${time}:time:`;
  }

  private toComingUpItem(
    event: RankedTrainingEvent,
    fromCommunity: boolean,
  ): ComingUpItem {
    const start = new Date(event.startSeconds * 1000);
    const community = fromCommunity
      ? this.followedCommunities().find((item) =>
          event.communityKeys.includes(item.communityKey),
        )?.displayName ?? null
      : null;
    const relationship = this.myEvents.relationshipFor(event.id);
    return {
      id: event.id,
      link: ["/events", event.slug ?? event.id],
      month: this.dateTime.format(start, { month: "short", timeZone: event.timeZone }),
      day: this.dateTime.format(start, { day: "numeric", timeZone: event.timeZone }),
      title: event.name,
      detail: this.eventDetail(event),
      distance: formatDistanceKm(event.distanceKm, this.locale),
      community,
      relationship:
        relationship === "going"
          ? $localize`:@@train.comingUp.going:Going`
          : relationship === "saved"
            ? $localize`:@@event_rsvp.interested:Interested`
            : null,
    };
  }

  private eventDetail(event: RankedTrainingEvent): string {
    const going = event.rsvpCounts?.going ?? 0;
    return [
      event.venueString ?? event.localityString,
      formatDistanceKm(event.distanceKm, this.locale),
      going > 0 ? $localize`:@@train.event.goingCount:${going}:count: going` : null,
    ]
      .filter((part): part is string => !!part)
      .join(" · ");
  }

  private toRecentEntry(entry: LogEntryDocument): RecentEntryView {
    const date = new Date(entry.activity_at_raw_ms);
    const minutes = entry.session_summaries.reduce(
      (total, session) => total + (session.duration_minutes ?? 0),
      0,
    );
    const spotCount = entry.session_summaries.reduce(
      (total, session) => total + session.spot_count,
      0,
    );
    const note = entry.note.trim().split("\n")[0];
    return {
      id: entry.id,
      weekday: this.dateTime.format(date, { weekday: "short" }),
      title: note || $localize`:@@train.reflection.untitledEntry:Training session`,
      detail: [
        this.dateTime.format(date, { day: "numeric", month: "short" }),
        minutes > 0 ? formatDuration(minutes) : null,
        spotCount > 0
          ? spotCount === 1
            ? $localize`:@@train.reflection.oneSpot:1 Spot`
            : $localize`:@@train.reflection.spotCount:${spotCount}:count: Spots`
          : null,
      ]
        .filter((part): part is string => !!part)
        .join(" · "),
    };
  }

  private formatTime(value: string, timeZone?: string): string {
    return this.dateTime.format(new Date(value), {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
  }
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}
