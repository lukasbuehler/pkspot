import { SessionRecordsService } from '../../services/firebase/firestore/session-records.service';
import { PLATFORM_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { BehaviorSubject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { CommunityFollowsService } from "../../services/firebase/firestore/community-follows.service";
import { LogEntriesService } from "../../services/firebase/firestore/log-entries.service";
import { RecoveryPausesService } from "../../services/firebase/firestore/recovery-pauses.service";
import { SeriesService } from "../../services/firebase/firestore/series.service";
import { GeolocationService } from "../../services/geolocation.service";
import { MapsApiService } from "../../services/maps-api.service";
import { LocationAccessService } from "../../services/location-access.service";
import {
  EventDiscoverySearchResult,
  SearchService,
} from "../../services/search.service";
import { WeatherService } from "../../weather/weather.service";
import { TrainPageComponent } from "./train-page.component";
import { MyEventsService } from "../../services/my-events.service";
import { PlannedSessionsService } from "../../services/planned-sessions.service";
import { AccountPreferencesService } from "../../services/account-preferences.service";
import type { SessionRecordDocument } from "../../../db/schemas/SessionRecordSchema";

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
    expect(component.comingUp()).toEqual([
      expect.objectContaining({ id: "event-1", title: "Community Jam", community: null }),
    ]);
    await vi.waitFor(() => expect(component.nearbyLocality.value()).toBe("Zürich"));
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
    expect(component.communityEvents()).toEqual([
      expect.objectContaining({ id: "event-remote" }),
    ]);
    expect(component.comingUp()).toContainEqual(
      expect.objectContaining({ id: "event-remote", community: "Switzerland" }),
    );
  });

  it("counts private check-ins independently of optional log entries", async () => {
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
      sessions: {listMine: vi.fn().mockResolvedValue([{
        id: "session-1", source: "check_in", time_zone: "Europe/Zurich",
        started_at_raw_ms: new Date("2026-08-20T18:00:00Z").getTime(),
        last_activity_raw_ms: new Date("2026-08-20T19:30:00Z").getTime(),
        spot_visits: [{spot_id: "spot-1", check_in_id: "confirmed-1"}],
      } as SessionRecordDocument])},
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
        durationMinutes: 0,
        spotCount: 1,
      },
    ]);
    expect(TestBed.inject(SessionRecordsService).listMine).toHaveBeenCalledWith(null);
    component.trainingLogs.set([]);
    expect(component.trainingActivityDays()[0]).toMatchObject({sessionCount: 1, spotCount: 1, durationMinutes: 0, entryIds: []});
    logs.listMine.mockRejectedValue(new Error("Optional notes unavailable"));
    await component.loadTrainingHistory();
    expect(component.trainingHistoryFailed()).toBe(true);
    expect(component.trainingSessionsLoaded()).toBe(true);
    expect(component.trainingActivityDays()[0].sessionCount).toBe(1);
    vi.mocked(TestBed.inject(SessionRecordsService).listMine).mockRejectedValue(new Error("Sessions unavailable"));
    await component.loadTrainingHistory();
    expect(component.trainingHistoryFailed()).toBe(true);
    expect(component.trainingSessionsLoaded()).toBe(false);
  });

  it("shows Spots before the forecast arrives, then prefers dry Spots when rain is likely", async () => {
    let resolveWeather: (value: unknown) => void = () => undefined;
    const weather = {
      getCurrentAndNearFutureForTileAt: vi.fn(
        () => new Promise((resolve) => { resolveWeather = resolve; }),
      ),
    };
    const search = {
      searchEventDiscovery: vi.fn().mockResolvedValue({ ...eventResult, items: [] }),
      searchTopSpotPreviewsNearLocation: vi.fn().mockResolvedValue([
        { id: "spot-1", name: "Riverside", locality: "Zurich", imageSrc: "", isIconic: false },
      ]),
    };
    const component = createComponent({
      geolocation: nearZurich(),
      locationAccess: { enabled: signal(true), startWatchingIfEnabled: vi.fn() },
      search,
      series: { getSeriesByIds: vi.fn() },
      weather,
    });

    await vi.waitFor(() => expect(component.bestSpots()).toHaveLength(1));
    expect(component.weatherLoading()).toBe(true);
    expect(search.searchTopSpotPreviewsNearLocation).toHaveBeenLastCalledWith(
      expect.anything(), 25, 12, "none",
    );

    resolveWeather({
      current: { time: "2026-08-20T12:00:00Z", condition: "rain", precipitationMm: 2 },
      forecast: [],
      insights: { precipitationRisk: "high", surfaceDrying: { status: "wet" } },
    });
    await vi.waitFor(() =>
      expect(search.searchTopSpotPreviewsNearLocation).toHaveBeenLastCalledWith(
        expect.anything(), 25, 12, "dry",
      ),
    );
    expect(component.weatherFilterActive()).toBe(true);
    expect(component.weatherSummary()?.outlook).toBe("Rain now");
  });

  it("keeps Spots available when events fail to load", async () => {
    const component = createComponent({
      geolocation: nearZurich(),
      locationAccess: { enabled: signal(true), startWatchingIfEnabled: vi.fn() },
      search: {
        searchEventDiscovery: vi.fn().mockRejectedValue(new Error("Search offline")),
        searchTopSpotPreviewsNearLocation: vi.fn().mockResolvedValue([
          { id: "spot-1", name: "Riverside", locality: "Zurich", imageSrc: "", isIconic: false },
        ]),
      },
      series: { getSeriesByIds: vi.fn() },
    });

    await vi.waitFor(() => expect(component.loading()).toBe(false));
    expect(component.eventsFailed()).toBe(true);
    expect(component.bestSpots()).toHaveLength(1);
  });

  it("shows a nearby live event in the green card and leaves far-away live events out", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const live = (id: string, location: [number, number]) => ({
      ...eventResult.items[0],
      id,
      slug: id,
      name: id,
      location,
      startSeconds: nowSeconds - 3_600,
      endSeconds: nowSeconds + 3 * 3_600,
    });
    const component = createComponent({
      geolocation: nearZurich(),
      locationAccess: { enabled: signal(true), startWatchingIfEnabled: vi.fn() },
      search: {
        searchEventDiscovery: vi.fn().mockResolvedValue({
          ...eventResult,
          items: [live("zurich-jam", [47.38, 8.54]), live("tokyo-jam", [35.68, 139.69])],
        }),
        searchTopSpotPreviewsNearLocation: vi.fn().mockResolvedValue([]),
      },
      series: { getSeriesByIds: vi.fn() },
    });

    await vi.waitFor(() => expect(component.loading()).toBe(false));
    expect(component.momentViews()).toEqual([
      expect.objectContaining({ key: "event:zurich-jam", eyebrow: "Live now", link: ["/events", "zurich-jam"] }),
    ]);
    expect(component.comingUp().map((item) => item.id)).not.toContain("zurich-jam");
  });
});

function createComponent({
  authUser = null,
  follows = { listMine: vi.fn().mockResolvedValue([]) },
  logs = { listMine: vi.fn().mockResolvedValue([]) },
  sessions = { listMine: vi.fn().mockResolvedValue([]) },
  recoveryPauses = { listMine: vi.fn().mockResolvedValue([]) },
  geolocation,
  locationAccess,
  search,
  series,
  weather = {
    getCurrentAndNearFutureForTileAt: vi.fn().mockResolvedValue({
      current: null,
      insights: {
        precipitationRisk: "none",
        surfaceDrying: { status: "likely_dry" },
      },
    }),
  },
  myEvents = {
    goingEventIds: signal<string[]>([]),
    savedEventIds: signal<string[]>([]),
    relationshipFor: () => null,
  },
}: {
  authUser?: { uid: string } | null;
  follows?: { listMine: ReturnType<typeof vi.fn> };
  logs?: { listMine: ReturnType<typeof vi.fn> };
  sessions?: { listMine: ReturnType<typeof vi.fn> };
  recoveryPauses?: { listMine: ReturnType<typeof vi.fn> };
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
  weather?: { getCurrentAndNearFutureForTileAt: ReturnType<typeof vi.fn> };
  myEvents?: {
    goingEventIds: ReturnType<typeof signal<string[]>>;
    savedEventIds: ReturnType<typeof signal<string[]>>;
    relationshipFor: (id: string) => "going" | "saved" | null;
  };
}): TrainPageComponent {
  const auth = {
    authState$: new BehaviorSubject(authUser),
    user: { uid: authUser?.uid ?? null, data: null },
  };

  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: "browser" },
      { provide: AuthenticationService, useValue: auth },
      { provide: CommunityFollowsService, useValue: follows },
      { provide: LogEntriesService, useValue: logs },
      { provide: SessionRecordsService, useValue: sessions },
      { provide: RecoveryPausesService, useValue: recoveryPauses },
      { provide: GeolocationService, useValue: geolocation },
      { provide: MapsApiService, useValue: { getLocalityName: vi.fn().mockResolvedValue("Zürich") } },
      { provide: LocationAccessService, useValue: locationAccess },
      { provide: SearchService, useValue: search },
      { provide: SeriesService, useValue: series },
      { provide: MatDialog, useValue: { open: vi.fn() } },
      { provide: MyEventsService, useValue: myEvents },
      { provide: PlannedSessionsService, useValue: { list: vi.fn().mockResolvedValue([]) } },
      { provide: AccountPreferencesService, useValue: { temperatureUnit: () => "celsius" } },
      { provide: WeatherService, useValue: weather },
    ],
  });

  return TestBed.runInInjectionContext(() => new TrainPageComponent());
}

function nearZurich() {
  return {
    currentLocation: signal({ location: { lat: 47.3769, lng: 8.5417 }, accuracy: 20 }),
    error: signal<unknown | null>(null),
    checkPermissions: vi.fn(),
    startWatching: vi.fn(),
  };
}
