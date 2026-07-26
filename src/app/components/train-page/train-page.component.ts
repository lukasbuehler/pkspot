import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { DatePipe, DecimalPipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { CommunityFollowsService } from "../../services/firebase/firestore/community-follows.service";
import { GeolocationService } from "../../services/geolocation.service";
import {
  CommunitySearchPreview,
  EventDiscoveryItem,
  SearchService,
} from "../../services/search.service";
import { WeatherService } from "../../weather/weather.service";
import type { WeatherResponse } from "../../weather/weather.models";
import { getWeatherStateIcon } from "../../weather/weather-display";
import { SearchFieldComponent } from "../search-field/search-field.component";

interface AreaSelection {
  type: "place" | "spot" | "community" | "event";
  community?: CommunitySearchPreview;
}

interface RankedEvent extends EventDiscoveryItem {
  distanceKm?: number;
  followed: boolean;
  live: boolean;
}

@Component({
  selector: "app-train-page",
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    SearchFieldComponent,
  ],
  templateUrl: "./train-page.component.html",
  styleUrl: "./train-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainPageComponent {
  private readonly auth = inject(AuthenticationService);
  private readonly follows = inject(CommunityFollowsService);
  private readonly geolocation = inject(GeolocationService);
  private readonly search = inject(SearchService);
  private readonly weatherService = inject(WeatherService);

  readonly loading = signal(true);
  readonly locating = signal(false);
  readonly error = signal("");
  readonly events = signal<RankedEvent[]>([]);
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
  readonly todayOptions = computed(() => this.events().slice(0, 6));
  readonly followedOptions = computed(() =>
    this.events().filter((event) => event.followed).slice(0, 6),
  );

  constructor() {
    this.auth.authState$.pipe(takeUntilDestroyed()).subscribe((user) => {
      this.signedIn.set(!!user?.uid);
      this.displayName.set(
        (this.auth.user.data?.displayName || "")
          .trim()
          .split(/\s+/)[0] ?? "",
      );
      void this.load();
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
    } catch (error) {
      console.error("[Train] failed to load dashboard", error);
      this.error.set($localize`:@@train.loadError:Training options could not be loaded.`);
    } finally {
      this.loading.set(false);
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
    this.events.set(
      ranked
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
        ),
    );
  }

  private async loadWeather(): Promise<void> {
    const center = this.center();
    if (!center) {
      this.weather.set(null);
      return;
    }
    try {
      this.weather.set(
        await this.weatherService.getCurrentAndNearFutureForTileAt(
          { lat: center[0], lng: center[1] },
          12,
        ),
      );
    } catch (error) {
      console.warn("[Train] weather unavailable", error);
      this.weather.set(null);
    }
  }

  private center(): [number, number] | undefined {
    const location = this.geolocation.currentLocation()?.location;
    if (location) return [location.lat, location.lng];
    return this.area()?.boundsCenter;
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
