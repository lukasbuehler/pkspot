import { PLATFORM_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { BehaviorSubject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { CommunityFollowsService } from "../../services/firebase/firestore/community-follows.service";
import { LogEntriesService } from "../../services/firebase/firestore/log-entries.service";
import { SeriesService } from "../../services/firebase/firestore/series.service";
import { GeolocationService } from "../../services/geolocation.service";
import { LocationAccessService } from "../../services/location-access.service";
import {
  EventDiscoverySearchResult,
  SearchService,
} from "../../services/search.service";
import { WeatherService } from "../../weather/weather.service";
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

    const locationAccess = {
      enabled: signal(true),
      startWatchingIfEnabled: geolocation.startWatching,
    };
    const component = createComponent({
      geolocation,
      locationAccess,
      search,
      series,
    });

    await vi.waitFor(() => expect(component.loading()).toBe(false));

    expect(locationAccess.startWatchingIfEnabled).toHaveBeenCalledOnce();
    expect(search.searchTopSpotPreviewsNearLocation).toHaveBeenCalledWith(
      { lat: 47.3769, lng: 8.5417 },
      25,
      12,
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
    const locationAccess = {
      enabled: signal(false),
      startWatchingIfEnabled: vi.fn(),
    };
    const component = createComponent({
      geolocation,
      locationAccess,
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

    expect(locationAccess.startWatchingIfEnabled).not.toHaveBeenCalled();
  });

  it("keeps events from followed communities when they are outside the nearby area", async () => {
    const geolocation = {
      currentLocation: signal({
        location: { lat: 47.3769, lng: 8.5417 },
        accuracy: 20,
      }),
      error: signal<unknown | null>(null),
      checkPermissions: vi.fn(),
      startWatching: vi.fn(),
    };
    const remoteEvent = {
      ...eventResult.items[0],
      id: "event-remote",
      name: "Remote Community Jam",
      location: [46.2, 6.15] as [number, number],
    };
    const search = {
      getCommunityPreviewsByKeys: vi.fn().mockResolvedValue([
        {
          id: "country-ch",
          communityKey: "country:ch",
          slug: "switzerland",
          displayName: "Switzerland",
          totalSpots: 20,
        },
      ]),
      searchEventDiscovery: vi
        .fn()
        .mockResolvedValueOnce(eventResult)
        .mockResolvedValueOnce({ ...eventResult, items: [remoteEvent] }),
      searchTopSpotPreviewsNearLocation: vi.fn().mockResolvedValue([]),
    };

    const component = createComponent({
      authUser: { uid: "user-1" },
      geolocation,
      locationAccess: {
        enabled: signal(true),
        startWatchingIfEnabled: vi.fn(),
      },
      search,
      series: { getSeriesByIds: vi.fn().mockResolvedValue({}) },
      follows: {
        listMine: vi.fn().mockResolvedValue([{ community_key: "country:ch" }]),
      },
    });

    await vi.waitFor(() => expect(component.loading()).toBe(false));

    expect(search.searchEventDiscovery).toHaveBeenCalledTimes(2);
    expect(component.communityEventOptions()).toEqual([
      expect.objectContaining({ id: "event-remote" }),
    ]);
  });

  it("builds the history graph from the signed-in user's private log entries", async () => {
    const logs = {
      listMine: vi.fn().mockResolvedValue([
        {
          id: "entry-1",
          owner_id: "user-1",
          note: "Precision practice",
          visibility: "private",
          session_record_ids: ["session-1"],
          session_summaries: [
            {
              session_record_id: "session-1",
              local_date: "2026-08-20",
              duration_minutes: 90,
              spot_count: 2,
            },
          ],
          activity_at: {},
          activity_at_raw_ms: new Date("2026-08-20T18:00:00Z").getTime(),
          time_created: {},
          time_created_raw_ms: 0,
          time_updated: {},
          time_updated_raw_ms: 0,
        },
      ]),
    };
    const component = createComponent({
      authUser: { uid: "user-1" },
      geolocation: {
        currentLocation: signal(null),
        error: signal<unknown | null>(null),
        checkPermissions: vi.fn().mockResolvedValue(false),
        startWatching: vi.fn(),
      },
      locationAccess: { enabled: signal(false), startWatchingIfEnabled: vi.fn() },
      logs,
      search: {
        searchEventDiscovery: vi.fn().mockResolvedValue({ ...eventResult, items: [] }),
        searchTopSpotPreviewsNearLocation: vi.fn().mockResolvedValue([]),
        getCommunityPreviewsByKeys: vi.fn().mockResolvedValue([]),
      },
      series: { getSeriesByIds: vi.fn().mockResolvedValue({}) },
    });

    await vi.waitFor(() => expect(component.loading()).toBe(false));

    expect(logs.listMine).toHaveBeenCalledOnce();
    expect(component.trainingActivityDays()).toEqual([
      {
        key: "2026-08-20",
        entryIds: ["entry-1"],
        sessionCount: 1,
        durationMinutes: 90,
        spotCount: 2,
      },
    ]);
  });
});

function createComponent({
  authUser = null,
  follows = { listMine: vi.fn().mockResolvedValue([]) },
  logs = { listMine: vi.fn().mockResolvedValue([]) },
  geolocation,
  locationAccess,
  search,
  series,
}: {
  authUser?: { uid: string } | null;
  follows?: { listMine: ReturnType<typeof vi.fn> };
  logs?: { listMine: ReturnType<typeof vi.fn> };
  geolocation: {
    currentLocation: ReturnType<typeof signal>;
    error: ReturnType<typeof signal>;
    checkPermissions: ReturnType<typeof vi.fn>;
    startWatching: ReturnType<typeof vi.fn>;
  };
  locationAccess: {
    enabled: ReturnType<typeof signal>;
    startWatchingIfEnabled: ReturnType<typeof vi.fn>;
  };
  search: {
    searchEventDiscovery: ReturnType<typeof vi.fn>;
    searchTopSpotPreviewsNearLocation: ReturnType<typeof vi.fn>;
  };
  series: { getSeriesByIds: ReturnType<typeof vi.fn> };
}): TrainPageComponent {
  const auth = {
    authState$: new BehaviorSubject(authUser),
    user: { uid: null, data: null },
  };

  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: "browser" },
      { provide: AuthenticationService, useValue: auth },
      { provide: CommunityFollowsService, useValue: follows },
      { provide: LogEntriesService, useValue: logs },
      { provide: GeolocationService, useValue: geolocation },
      { provide: LocationAccessService, useValue: locationAccess },
      { provide: SearchService, useValue: search },
      { provide: SeriesService, useValue: series },
      { provide: MatDialog, useValue: { open: vi.fn() } },
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
