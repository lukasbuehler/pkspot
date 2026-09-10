import { inject as injectFeatureTelemetry } from "@angular/core";
import { FeatureTelemetryService } from "../../services/feature-telemetry.service";
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import {
  getFilterModeFromUrlParam,
  SpotFilterMode,
} from "../spot-map/spot-filter-config";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { CommunityFollowsService } from "../../services/firebase/firestore/community-follows.service";
import {
  SeriesDocument,
  SeriesService,
} from "../../services/firebase/firestore/series.service";
import { GeolocationService } from "../../services/geolocation.service";
import { LocationAccessService } from "../../services/location-access.service";
import {
  CommunitySearchPreview,
  SearchService,
} from "../../services/search.service";
import { WeatherService } from "../../weather/weather.service";
import type { WeatherResponse } from "../../weather/weather.models";
import { getWeatherStateIcon } from "../../weather/weather-display";
import { shouldRecommendDrySpots } from "../../weather/spot-weather-context";
import type { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import type { LogEntryDocument } from "../../../db/schemas/LogEntrySchema";
import type { RecoveryPauseDocument } from "../../../db/schemas/RecoveryPauseSchema";
import { EventDiscoveryCardComponent } from "../events-page/event-discovery-card.component";
import { FilterChipsBarComponent } from "../filter-chips-bar/filter-chips-bar.component";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import { TrainingActivityContributionGraphComponent } from "../training-activity-contribution-graph/training-activity-contribution-graph.component";
import {
  resolveTrainingCenter,
  resolveTrainingSpotRadiusKm,
} from "./training-area";
import { LocationAccessDialogComponent } from "../location-access-dialog/location-access-dialog.component";
import {
  TrainContextDialogComponent,
  type TrainContextDialogAction,
  type TrainContextDialogData,
} from "../train-context-dialog/train-context-dialog.component";
import {
  rankCommunityTrainingEvents,
  rankNearbyTrainingEvents,
  rankTrainingSpots,
  type RankedTrainingEvent,
} from "./training-recommendations";
import {
  WeatherForecastDialogComponent,
  type WeatherForecastDialogData,
} from "../weather-forecast-dialog/weather-forecast-dialog.component";
import {
  buildTrainingActivityDays,
  formatDuration,
  monthKey,
  summarizeTrainingMonth,
} from "../../features/training-log-activity";
import { LogEntriesService } from "../../services/firebase/firestore/log-entries.service";
import { RecoveryPausesService } from "../../services/firebase/firestore/recovery-pauses.service";

type SpotFilterSource = "user" | "weather" | null;

@Component({
  selector: "app-train-page",
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    EventDiscoveryCardComponent,
    FilterChipsBarComponent,
    SpotPreviewCardComponent,
    TrainingActivityContributionGraphComponent,
  ],
  templateUrl: "./train-page.component.html",
  styleUrl: "./train-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainPageComponent {
  private readonly featureTelemetry = injectFeatureTelemetry(FeatureTelemetryService);

  private readonly auth = inject(AuthenticationService);
  private readonly follows = inject(CommunityFollowsService);
  private readonly geolocation = inject(GeolocationService);
  private readonly locationAccess = inject(LocationAccessService);
  private readonly dialog = inject(MatDialog);
  private readonly search = inject(SearchService);
  private readonly series = inject(SeriesService);
  private readonly weatherService = inject(WeatherService);
  private readonly logsService = inject(LogEntriesService);
  private readonly recoveryPausesService = inject(RecoveryPausesService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly loading = signal(true);
  readonly locating = signal(false);
  readonly error = signal("");
  readonly nearbyEvents = signal<RankedTrainingEvent[]>([]);
  readonly communityEvents = signal<RankedTrainingEvent[]>([]);
  readonly spots = signal<SpotPreviewData[]>([]);
  readonly trainingLogs = signal<LogEntryDocument[]>([]);
  readonly trainingRecoveryPauses = signal<RecoveryPauseDocument[]>([]);
  readonly selectedSpotFilter = signal("");
  readonly spotFilterSource = signal<SpotFilterSource>(null);
  readonly seriesById = signal<Record<string, SeriesDocument>>({});
  readonly followedCommunities = signal<CommunitySearchPreview[]>([]);
  readonly weather = signal<WeatherResponse | null>(null);
  readonly area = signal<CommunitySearchPreview | null>(null);
  readonly signedIn = signal(false);
  readonly radiusKm = signal(25);
  readonly weatherIcon = computed(() =>
    getWeatherStateIcon(
      this.weather()?.current?.condition ?? "unknown",
      this.weather()?.current?.isDay,
    ),
  );
  readonly hasTrainingArea = computed(
    () => !!this.geolocation.currentLocation()?.location || !!this.area(),
  );
  readonly bestSpots = computed(() => this.spots().slice(0, 4));
  readonly trainingActivityDays = computed(() =>
    buildTrainingActivityDays(this.trainingLogs()),
  );
  readonly trainingMonthSummary = computed(() =>
    summarizeTrainingMonth(this.trainingActivityDays(), monthKey(Date.now())),
  );
  readonly nearbyEventOptions = computed(() => this.nearbyEvents().slice(0, 3));
  readonly communityEventOptions = computed(() =>
    this.communityEvents().slice(0, 3),
  );
  readonly contextWeather = computed(() => {
    const weather = this.weather();
    if (!weather) return null;
    const temperature = weather.current?.temperatureC;
    return {
      icon: this.weatherIcon(),
      summary: weather.insights.summary,
      temperature:
        temperature === undefined ? null : `${Math.round(temperature)}°`,
    };
  });
  readonly weatherFilterActive = computed(
    () =>
      this.spotFilterSource() === "weather" &&
      this.selectedSpotFilter() === SpotFilterMode.Dry,
  );

  constructor() {
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
          weather: this.contextWeather(),
        },
        width: "520px",
        maxWidth: "calc(100vw - 24px)",
        autoFocus: "dialog",
        restoreFocus: true,
      })
      .afterClosed()
      .subscribe((action) => this.handleContextAction(action));
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
      if (!(await this.locationAccess.startWatchingIfEnabled())) return;
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

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set("");
    try {
      if (this.signedIn()) {
        const records = await this.follows.listMine();
        this.followedCommunities.set(
          await this.search.getCommunityPreviewsByKeys(
            records.map((record) => record.community_key),
          ),
        );
      } else {
        this.followedCommunities.set([]);
      }
      await Promise.all([
        this.loadEvents(),
        this.loadWeather(),
        this.loadTrainingHistory(),
      ]);
      await this.loadSpots();
    } catch (error) {
      this.featureTelemetry.failure("train-page", "load", error);
      console.error("[Train] failed to load dashboard", error);
      this.error.set($localize`:@@train.loadError:Training options could not be loaded.`);
    } finally {
      this.loading.set(false);
    }
  }

  private async initialize(): Promise<void> {
    await this.useAvailableLocation();
    await this.load();
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
    const nowSeconds = Math.floor(Date.now() / 1000);
    const followedCommunityKeys = this.followedCommunities().map(
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
    const center = this.center();
    const nearby = rankNearbyTrainingEvents(
      nearbyResult.items,
      nowSeconds,
      center,
    );
    this.radiusKm.set(nearby.radiusKm);
    this.nearbyEvents.set(nearby.items);

    const nearbyEventIds = new Set(nearby.items.map((event) => event.id));
    const communityEvents = rankCommunityTrainingEvents(
      communityResult.items,
      nowSeconds,
      center,
    ).filter((event) => !nearbyEventIds.has(event.id));
    this.communityEvents.set(communityEvents);
    await this.loadSeries([
      ...nearby.items.slice(0, 3),
      ...communityEvents.slice(0, 3),
    ]);
  }

  private async loadSeries(
    events: readonly RankedTrainingEvent[],
  ): Promise<void> {
    const ids = [...new Set(events.flatMap((event) => event.seriesIds))];
    if (ids.length === 0) {
      this.seriesById.set({});
      return;
    }

    try {
      this.seriesById.set(await this.series.getSeriesByIds(ids));
    } catch (error) {
      console.warn("[Train] event series unavailable", error);
      this.seriesById.set({});
    }
  }

  private async loadSpots(): Promise<void> {
    const center = this.center();
    if (!center) {
      this.spots.set([]);
      return;
    }
    try {
      const filterMode = getFilterModeFromUrlParam(
        this.selectedSpotFilter(),
      );
      const radiusKm = resolveTrainingSpotRadiusKm(this.area());
      const candidates = await this.search.searchTopSpotPreviewsNearLocation(
        { lat: center[0], lng: center[1] },
        radiusKm,
        12,
        filterMode,
      );
      this.spots.set(rankTrainingSpots(candidates, center, radiusKm, 4));
    } catch (error) {
      console.warn("[Train] nearby spots unavailable", error);
      this.spots.set([]);
    }
  }

  private async loadWeather(): Promise<void> {
    const center = this.center();
    if (!center) {
      this.weather.set(null);
      return;
    }
    try {
      const weather =
        await this.weatherService.getCurrentAndNearFutureForTileAt(
          { lat: center[0], lng: center[1] },
          12,
        );
      this.weather.set(weather);
      this.applyWeatherSpotFilter(weather);
    } catch (error) {
      console.warn("[Train] weather unavailable", error);
      this.weather.set(null);
      this.applyWeatherSpotFilter(null);
    }
  }

  trainingDurationLabel(minutes: number): string {
    return formatDuration(minutes);
  }

  private async loadTrainingHistory(): Promise<void> {
    if (!this.signedIn()) {
      this.trainingLogs.set([]);
      this.trainingRecoveryPauses.set([]);
      return;
    }
    try {
      const [logs, recoveryPauses] = await Promise.all([
        this.logsService.listMine(),
        this.recoveryPausesService.listMine(),
      ]);
      this.trainingLogs.set(logs);
      this.trainingRecoveryPauses.set(recoveryPauses);
    } catch (error) {
      console.warn("[Train] training history unavailable", error);
      this.trainingLogs.set([]);
      this.trainingRecoveryPauses.set([]);
    }
  }

  private applyWeatherSpotFilter(weather: WeatherResponse | null): void {
    if (this.spotFilterSource() === "user") return;
    const useDryFilter = shouldRecommendDrySpots(weather);
    this.selectedSpotFilter.set(useDryFilter ? SpotFilterMode.Dry : "");
    this.spotFilterSource.set(useDryFilter ? "weather" : null);
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
}
