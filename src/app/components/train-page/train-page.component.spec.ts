import { PLATFORM_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BehaviorSubject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { CommunityFollowsService } from "../../services/firebase/firestore/community-follows.service";
import { SeriesService } from "../../services/firebase/firestore/series.service";
import { GeolocationService } from "../../services/geolocation.service";
import {
  EventDiscoverySearchResult,
  SearchService,
} from "../../services/search.service";
import { WeatherService } from "../../weather/weather.service";
import { NotificationOptInService } from "../../services/notification-opt-in.service";
import { TrainPageComponent } from "./train-page.component";

const eventResult: EventDiscoverySearchResult = {
  items: [
    {
      id: "event-1",
      slug: "event-1",
      name: "Community Jam",
      localityString: "Zurich, Switzerland",
      isSponsored: false,
      hasOrganization: false,
      hasVenueSpot: false,
      venueSpotCount: 0,
      startSeconds: 2_000_000_000,
      endSeconds: 2_000_003_600,
      timeZone: "Europe/Zurich",
      lifecycleStatus: "planned",
      eventLinks: [],
      ticketOptions: [],
      spotIds: [],
      communityKeys: ["country:ch"],
      seriesIds: ["parkour-earth"],
      eventCategories: ["jam"],
      rsvpCounts: { going: 0, interested: 0, notgoing: 0, total: 0 },
      seriesRoles: [],
      qualifiesToKeys: [],
      requiredQualifierKeys: [],
    },
  ],
  found: 1,
  page: 1,
  facets: { categories: [], series: [], communities: [] },
  invalidItems: [],
  invalidItemCount: 0,
};

describe("TrainPageComponent", () => {
  beforeEach(() => TestBed.resetTestingModule());

  it("uses an already-authorized location and loads event series", async () => {
    const currentLocation = signal<{
      location: google.maps.LatLngLiteral;
      accuracy: number;
    } | null>(null);
    const geolocation = {
      currentLocation,
      error: signal<unknown | null>(null),
      checkPermissions: vi.fn().mockResolvedValue(true),
      startWatching: vi.fn(async () => {
        currentLocation.set({
          location: { lat: 47.3769, lng: 8.5417 },
          accuracy: 20,
        });
      }),
    };
    const seriesById = {
      "parkour-earth": {
        id: "parkour-earth",
        name: "Parkour Earth",
      },
    };
    const series = {
      getSeriesByIds: vi.fn().mockResolvedValue(seriesById),
    };
    const search = {
      searchEventDiscovery: vi.fn().mockResolvedValue(eventResult),
      searchTopSpotPreviewsNearLocation: vi.fn().mockResolvedValue([]),
    };

    const component = createComponent({ geolocation, search, series });

    await vi.waitFor(() => expect(component.loading()).toBe(false));

    expect(geolocation.checkPermissions).toHaveBeenCalledOnce();
    expect(geolocation.startWatching).toHaveBeenCalledOnce();
    expect(search.searchTopSpotPreviewsNearLocation).toHaveBeenCalledWith(
      { lat: 47.3769, lng: 8.5417 },
      25,
      4,
      "none",
    );
    expect(series.getSeriesByIds).toHaveBeenCalledWith(["parkour-earth"]);
    expect(component.seriesById()).toEqual(seriesById);
  });

  it("does not request location when permission is not already granted", async () => {
    const geolocation = {
      currentLocation: signal(null),
      error: signal<unknown | null>(null),
      checkPermissions: vi.fn().mockResolvedValue(false),
      startWatching: vi.fn(),
    };
    const component = createComponent({
      geolocation,
      search: {
        searchEventDiscovery: vi.fn().mockResolvedValue({
          ...eventResult,
          items: [],
          found: 0,
        }),
        searchTopSpotPreviewsNearLocation: vi.fn().mockResolvedValue([]),
      },
      series: { getSeriesByIds: vi.fn().mockResolvedValue({}) },
    });

    await vi.waitFor(() => expect(component.loading()).toBe(false));

    expect(geolocation.checkPermissions).toHaveBeenCalledOnce();
    expect(geolocation.startWatching).not.toHaveBeenCalled();
  });
});

function createComponent({
  geolocation,
  search,
  series,
}: {
  geolocation: {
    currentLocation: ReturnType<typeof signal>;
    error: ReturnType<typeof signal>;
    checkPermissions: ReturnType<typeof vi.fn>;
    startWatching: ReturnType<typeof vi.fn>;
  };
  search: {
    searchEventDiscovery: ReturnType<typeof vi.fn>;
    searchTopSpotPreviewsNearLocation: ReturnType<typeof vi.fn>;
  };
  series: { getSeriesByIds: ReturnType<typeof vi.fn> };
}): TrainPageComponent {
  const auth = {
    authState$: new BehaviorSubject(null),
    user: { uid: null, data: null },
  };

  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: "browser" },
      { provide: AuthenticationService, useValue: auth },
      { provide: CommunityFollowsService, useValue: {} },
      { provide: NotificationOptInService, useValue: { maybePrompt: vi.fn() } },
      { provide: GeolocationService, useValue: geolocation },
      { provide: SearchService, useValue: search },
      { provide: SeriesService, useValue: series },
      {
        provide: WeatherService,
        useValue: {
          getCurrentAndNearFutureForTileAt: vi
            .fn()
            .mockResolvedValue({
              current: null,
              insights: {
                precipitationRisk: "none",
                surfaceDrying: { status: "likely_dry" },
              },
            }),
        },
      },
    ],
  });

  return TestBed.runInInjectionContext(() => new TrainPageComponent());
}
