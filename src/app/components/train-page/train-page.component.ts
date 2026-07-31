import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from "@angular/core";
import { DecimalPipe, isPlatformBrowser } from "@angular/common";
import { RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import {
  getFilterModeFromUrlParam,
  SpotFilterMode,
} from "../spot-map/spot-filter-config";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { CommunityFollowsService } from "../../services/firebase/firestore/community-follows.service";
import { NotificationOptInService } from "../../services/notification-opt-in.service";
import {
  SeriesDocument,
  SeriesService,
} from "../../services/firebase/firestore/series.service";
import { GeolocationService } from "../../services/geolocation.service";
import {
  CommunitySearchPreview,
  EventDiscoveryItem,
  SearchService,
} from "../../services/search.service";
import { WeatherService } from "../../weather/weather.service";
import type { WeatherResponse } from "../../weather/weather.models";
import { getWeatherStateIcon } from "../../weather/weather-display";
import { shouldRecommendDrySpots } from "../../weather/spot-weather-context";
import type { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { EventDiscoveryCardComponent } from "../events-page/event-discovery-card.component";
import { FilterChipsBarComponent } from "../filter-chips-bar/filter-chips-bar.component";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import {
  resolveTrainingCenter,
  resolveTrainingSpotRadiusKm,
} from "./training-area";

interface AreaSelection {
  type: "place" | "spot" | "community" | "event";
  community?: CommunitySearchPreview;
}

interface RankedEvent extends EventDiscoveryItem {
  distanceKm?: number;
  followed: boolean;
  live: boolean;
}

type SpotFilterSource = "user" | "weather" | null;

@Component({
  selector: "app-train-page",
  imports: [
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    EventDiscoveryCardComponent,
    FilterChipsBarComponent,
    SpotPreviewCardComponent,
  ],
  templateUrl: "./train-page.component.html",
  styleUrl: "./train-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainPageComponent {
  private readonly auth = inject(AuthenticationService);
  private readonly follows = inject(CommunityFollowsService);
  private readonly geolocation = inject(GeolocationService);
  private readonly notificationOptIn = inject(NotificationOptInService);
  private readonly search = inject(SearchService);
  private readonly series = inject(SeriesService);
  private readonly weatherService = inject(WeatherService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly loading = signal(true);
  readonly locating = signal(false);
  readonly error = signal("");
  readonly events = signal<RankedEvent[]>([]);
  readonly spots = signal<SpotPreviewData[]>([]);
  readonly selectedSpotFilter = signal("");
  readonly spotFilterSource = signal<SpotFilterSource>(null);
  readonly seriesById = signal<Record<string, SeriesDocument>>({});
  readonly followedCommunities = signal<CommunitySearchPreview[]>([]);
  readonly weather = signal<WeatherResponse | null>(null);
  readonly area = signal<CommunitySearchPreview | null>(null);
  readonly signedIn = signal(false);
  readonly displayName = signal("");
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
  readonly todayOptions = computed(() => this.events().slice(0, 6));
  readonly weatherFilterActive = computed(
    () =>
      this.spotFilterSource() === "weather" &&
      this.selectedSpotFilter() === SpotFilterMode.Dry,
  );

  constructor() {
    this.auth.authState$.pipe(takeUntilDestroyed()).subscribe((user) => {
      this.signedIn.set(!!user?.uid);
      this.displayName.set(
        (this.auth.user.data?.displayName || "")
          .trim()
          .split(/\s+/)[0] ?? "",
      );
      void this.initialize();
    });
  }

  async useMyLocation(): Promise<void> {
    this.locating.set(true);
    try {
      await this.geolocation.startWatching();
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

  chooseArea(selection: AreaSelection): void {
    if (!selection.community) return;
    this.area.set(selection.community);
    void this.load();
  }

  clearArea(): void {
    this.area.set(null);
    void this.load();
  }

  setSpotFilter(value: string): void {
    this.spotFilterSource.set(value ? "user" : null);
    this.selectedSpotFilter.set(value);
    void this.loadSpots();
  }

  async toggleFollow(community: CommunitySearchPreview): Promise<void> {
    if (!this.signedIn()) return;
    const current = this.followedCommunities();
    const exists = current.some(
      (item) => item.communityKey === community.communityKey,
    );
    if (exists) {
      await this.follows.unfollow(community.communityKey);
      this.followedCommunities.set(
        current.filter((item) => item.communityKey !== community.communityKey),
      );
    } else {
      await this.follows.follow(community);
      this.followedCommunities.set([...current, community]);
      const decision = await this.notificationOptIn.maybePrompt("community_updates");
      if (decision === "context" || decision === "all") {
        await this.follows.setNotifications(community.communityKey, {
          eventNotifications: true,
          spotDigestNotifications: true,
        });
      }
    }
    await this.loadEvents();
  }

  isFollowing(communityKey: string): boolean {
    return this.followedCommunities().some(
      (community) => community.communityKey === communityKey,
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
      await Promise.all([this.loadEvents(), this.loadWeather()]);
      await this.loadSpots();
    } catch (error) {
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
      !(await this.geolocation.checkPermissions())
    ) {
      return;
    }

    this.locating.set(true);
    try {
      await this.geolocation.startWatching();
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
    const result = await this.search.searchEventDiscovery({
      endsAfterSeconds: nowSeconds,
      startsBeforeSeconds: nowSeconds + 7 * 24 * 60 * 60,
      sort: "upcoming",
      perPage: 250,
    });
    const center = this.center();
    const followKeys = new Set(
      this.followedCommunities().map((community) => community.communityKey),
    );
    const ranked = result.items.map((event): RankedEvent => {
      const point = event.location ?? event.boundsCenter;
      return {
        ...event,
        distanceKm: center && point ? distanceKm(center, point) : undefined,
        followed: event.communityKeys.some((key) => followKeys.has(key)),
        live: event.startSeconds <= nowSeconds && event.endSeconds >= nowSeconds,
      };
    });
    const availableRadius =
      [25, 50, 100].find((radius) =>
        ranked.some(
          (event) =>
            event.distanceKm === undefined || event.distanceKm <= radius,
        ),
      ) ?? 100;
    this.radiusKm.set(availableRadius);
    const visibleEvents = ranked
      .filter(
        (event) =>
          !center ||
          event.distanceKm === undefined ||
          event.distanceKm <= availableRadius,
      )
      .sort(
        (a, b) =>
          Number(b.live) - Number(a.live) ||
          Number(b.followed) - Number(a.followed) ||
          Number(b.kind === "session" || b.kind === "class") -
            Number(a.kind === "session" || a.kind === "class") ||
          (a.distanceKm ?? Number.MAX_SAFE_INTEGER) -
            (b.distanceKm ?? Number.MAX_SAFE_INTEGER) ||
          a.startSeconds - b.startSeconds,
      );
    this.events.set(visibleEvents);
    await this.loadSeries(visibleEvents.slice(0, 6));
  }

  private async loadSeries(events: readonly RankedEvent[]): Promise<void> {
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
      this.spots.set(
        await this.search.searchTopSpotPreviewsNearLocation(
          { lat: center[0], lng: center[1] },
          resolveTrainingSpotRadiusKm(this.area()),
          4,
          filterMode,
        ),
      );
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

  private applyWeatherSpotFilter(weather: WeatherResponse | null): void {
    if (this.spotFilterSource() === "user") return;
    const useDryFilter = shouldRecommendDrySpots(weather);
    this.selectedSpotFilter.set(useDryFilter ? SpotFilterMode.Dry : "");
    this.spotFilterSource.set(useDryFilter ? "weather" : null);
  }

  private center(): [number, number] | undefined {
    return resolveTrainingCenter(
      this.area(),
      this.geolocation.currentLocation()?.location,
    );
  }
}

function distanceKm(a: [number, number], b: [number, number]): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const lat = toRad(b[0] - a[0]);
  const lng = toRad(b[1] - a[1]);
  const value =
    Math.sin(lat / 2) ** 2 +
    Math.cos(toRad(a[0])) *
      Math.cos(toRad(b[0])) *
      Math.sin(lng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
