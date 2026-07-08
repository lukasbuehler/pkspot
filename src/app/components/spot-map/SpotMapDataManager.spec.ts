import { Injector, NgZone } from "@angular/core";
import { describe, expect, it, vi } from "vitest";
import { of } from "rxjs";
import { GeoPoint } from "firebase/firestore";
import { Spot } from "../../../db/models/Spot";
import { User } from "../../../db/models/User";
import { SpotId, SpotSchema } from "../../../db/schemas/SpotSchema";
import { SpotTypes } from "../../../db/schemas/SpotTypeAndAccess";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { OsmDataService } from "../../services/osm-data.service";
import { SearchService } from "../../services/search.service";
import { getClusterTileKey } from "../../../db/schemas/SpotClusterTile";
import { SpotMapDataManager, SpotFilterMode } from "./SpotMapDataManager";
import { TilesObject } from "../google-map-2d/google-map-2d.component";

function makeInjector(overrides: Map<unknown, unknown> = new Map()): Injector {
  const fakeNgZone = {
    run: (fn: () => unknown) => fn(),
    runOutsideAngular: (fn: () => unknown) => fn(),
  };

  const providers = new Map<unknown, unknown>([
    [SpotsService, {}],
    [SpotEditsService, {}],
    [UsersService, { getUserByIdOnce: vi.fn().mockResolvedValue(null) }],
    [OsmDataService, { getAmenityMarkers: vi.fn(() => of([])) }],
    [AuthenticationService, {}],
    [
      SearchService,
      {
        searchSpotsInBoundsWithFilter: vi.fn(),
        searchSpotsInRawBounds: vi.fn().mockResolvedValue({ hits: [] }),
        getSpotPreviewFromHit: vi.fn(),
      },
    ],
    [NgZone, fakeNgZone],
  ]);

  overrides.forEach((value, token) => providers.set(token, value));

  return {
    get: (token: unknown) => providers.get(token),
  } as Injector;
}

function makeSpot(
  id: string,
  type: SpotTypes,
  location: google.maps.LatLngLiteral = { lat: 0, lng: 0 }
): Spot {
  const data = {
    name: { en: "Spot " + id },
    location: new GeoPoint(location.lat, location.lng),
    location_raw: location,
    type,
    amenities: {},
    media: [],
  } satisfies Partial<SpotSchema>;

  return new Spot(id as SpotId, data as SpotSchema, "en");
}

function makeManagerWithSpots(spots: Spot[]): SpotMapDataManager {
  const manager = new SpotMapDataManager("en", makeInjector());
  (manager as unknown as { _spots: Map<string, Spot[]> })._spots.set(
    getClusterTileKey(16, 0, 0),
    spots
  );
  return manager;
}

const visibleTile: TilesObject = {
  zoom: 16,
  tiles: [{ x: 0, y: 0 }],
  sw: { x: 0, y: 0 },
  ne: { x: 0, y: 0 },
};

function renderCachedSpots(manager: SpotMapDataManager): void {
  (
    manager as unknown as {
      _showCachedLoadedSpotsAndMarkersForTiles: (tiles: TilesObject) => void;
    }
  )._showCachedLoadedSpotsAndMarkersForTiles(visibleTile);
}

function renderCachedSpotsForTile(
  manager: SpotMapDataManager,
  tile: { x: number; y: number }
): void {
  (
    manager as unknown as {
      _showCachedLoadedSpotsAndMarkersForTiles: (tiles: TilesObject) => void;
    }
  )._showCachedLoadedSpotsAndMarkersForTiles({
    zoom: 16,
    tiles: [tile],
    sw: tile,
    ne: tile,
  });
}

describe("SpotMapDataManager filters", () => {
  it("uses the live auth uid for spot edit user references", async () => {
    const staleProfileUser = new User("stale-profile-uid", {
      display_name: "Stale Profile",
    });
    const spotEditsService = {
      createSpotUpdateEdit: vi.fn().mockResolvedValue("edit-id"),
    };
    const authService = {
      isSignedIn: true,
      user: {
        uid: "live-auth-uid",
        email: "live@example.test",
        data: staleProfileUser,
      },
    };
    const manager = new SpotMapDataManager(
      "en",
      makeInjector(
        new Map<unknown, unknown>([
          [SpotEditsService, spotEditsService],
          [AuthenticationService, authService],
        ])
      )
    );
    const spot = makeSpot("spot-1", SpotTypes.Park);

    await manager.saveSpot(spot);

    expect(spotEditsService.createSpotUpdateEdit).toHaveBeenCalledWith(
      "spot-1",
      expect.any(Object),
      expect.objectContaining({
        uid: "live-auth-uid",
        display_name: "Stale Profile",
      }),
      undefined
    );
  });

  it("does not create an edit when an existing spot has no data changes", async () => {
    const spotEditsService = {
      createSpotUpdateEdit: vi.fn(),
    };
    const authService = {
      isSignedIn: true,
      user: {
        uid: "live-auth-uid",
        email: "live@example.test",
        data: new User("live-auth-uid", {
          display_name: "Live User",
        }),
      },
    };
    const manager = new SpotMapDataManager(
      "en",
      makeInjector(
        new Map<unknown, unknown>([
          [SpotEditsService, spotEditsService],
          [AuthenticationService, authService],
        ])
      )
    );
    const spot = makeSpot("spot-1", SpotTypes.Park);

    const spotId = await manager.saveSpot(spot, spot);

    expect(spotId).toBe("spot-1");
    expect(spotEditsService.createSpotUpdateEdit).not.toHaveBeenCalled();
  });

  it("loads the profile before saving when auth state has no hydrated user data", async () => {
    const spotEditsService = {
      createSpotUpdateEdit: vi.fn().mockResolvedValue("edit-id"),
    };
    const usersService = {
      getUserByIdOnce: vi.fn().mockResolvedValue(
        new User("live-auth-uid", {
          display_name: "Live User",
        })
      ),
    };
    const authService = {
      isSignedIn: true,
      user: {
        uid: "live-auth-uid",
        email: "live@example.test",
        data: undefined,
      },
    };
    const manager = new SpotMapDataManager(
      "en",
      makeInjector(
        new Map<unknown, unknown>([
          [SpotEditsService, spotEditsService],
          [UsersService, usersService],
          [AuthenticationService, authService],
        ])
      )
    );
    const spot = makeSpot("spot-1", SpotTypes.Park);

    await manager.saveSpot(spot);

    expect(usersService.getUserByIdOnce).toHaveBeenCalledWith("live-auth-uid");
    expect(spotEditsService.createSpotUpdateEdit).toHaveBeenCalledWith(
      "spot-1",
      expect.any(Object),
      {
        uid: "live-auth-uid",
        display_name: "Live User",
      },
      undefined
    );
  });

  it("does not store the auth email as a spot edit display name when the profile cannot be loaded", async () => {
    const spotEditsService = {
      createSpotUpdateEdit: vi.fn().mockResolvedValue("edit-id"),
    };
    const usersService = {
      getUserByIdOnce: vi.fn().mockResolvedValue(null),
    };
    const authService = {
      isSignedIn: true,
      user: {
        uid: "live-auth-uid",
        email: "live@example.test",
        data: undefined,
      },
    };
    const manager = new SpotMapDataManager(
      "en",
      makeInjector(
        new Map<unknown, unknown>([
          [SpotEditsService, spotEditsService],
          [UsersService, usersService],
          [AuthenticationService, authService],
        ])
      )
    );
    const spot = makeSpot("spot-1", SpotTypes.Park);

    await manager.saveSpot(spot);

    expect(spotEditsService.createSpotUpdateEdit).toHaveBeenCalledWith(
      "spot-1",
      expect.any(Object),
      { uid: "live-auth-uid" },
      undefined
    );
  });

  it("keeps cached full spots visible when a preset filter is active", () => {
    const parkourSpot = makeSpot("parkour", SpotTypes.PkPark);
    const regularSpot = makeSpot("regular", SpotTypes.Playground);
    const manager = makeManagerWithSpots([parkourSpot, regularSpot]);

    manager.spotFilterMode.set(SpotFilterMode.ForParkour);
    renderCachedSpots(manager);

    expect(manager.visibleSpots()).toEqual([parkourSpot, regularSpot]);
    expect(manager.visibleHighlightedSpots()).toEqual([]);
  });

  it("uses manual filter results for pins without replacing coverage spots", () => {
    const parkourSpot = makeSpot("parkour", SpotTypes.PkPark);
    const regularSpot = makeSpot("regular", SpotTypes.Playground);
    const manager = makeManagerWithSpots([parkourSpot, regularSpot]);
    const manualPreview = regularSpot.makePreviewData();

    manager.spotFilterMode.set(SpotFilterMode.ForParkour);
    manager.setManualHighlightedSpots([manualPreview]);
    renderCachedSpots(manager);

    expect(manager.visibleSpots()).toEqual([parkourSpot, regularSpot]);
    expect(manager.visibleHighlightedSpots()).toEqual([manualPreview]);
  });

  it("adds a selected spot with missing tile coordinates to the z16 cache", () => {
    const spot = makeSpot("missing-tile", SpotTypes.PkPark, {
      lat: 47.38973830840186,
      lng: 8.51731398695088,
    });
    const manager = new SpotMapDataManager("en", makeInjector());

    manager.addLoadedSpot(spot);

    expect(spot.tileCoordinates?.z16).toEqual({ x: 34318, y: 22946 });

    (
      manager as unknown as {
        _showCachedLoadedSpotsAndMarkersForTiles: (tiles: TilesObject) => void;
      }
    )._showCachedLoadedSpotsAndMarkersForTiles({
      zoom: 16,
      tiles: [{ x: 34318, y: 22946 }],
      sw: { x: 34318, y: 22946 },
      ne: { x: 34318, y: 22946 },
    });

    expect(manager.visibleSpots()).toEqual([spot]);
  });

  it("does not fetch Firestore spot tiles or cluster tiles during viewport updates", async () => {
    const searchService = {
      searchSpotsInBoundsWithFilter: vi.fn(),
      searchSpotsInRawBounds: vi.fn().mockResolvedValue({ hits: [] }),
      getSpotPreviewFromHit: vi.fn(),
    };
    const manager = new SpotMapDataManager(
      "en",
      makeInjector(
        new Map<unknown, unknown>([
          [SpotsService, {}],
          [SearchService, searchService],
        ])
      )
    );

    await (
      manager as unknown as {
        _executeSetVisibleTiles: (tiles: TilesObject) => Promise<void>;
      }
    )._executeSetVisibleTiles({
      zoom: 10,
      tiles: [{ x: 532, y: 363 }],
      sw: { x: 532, y: 363 },
      ne: { x: 532, y: 363 },
      viewportBounds: {
        north: 48,
        south: 47,
        east: 9,
        west: 8,
      },
    });

    expect(searchService.searchSpotsInRawBounds).toHaveBeenCalled();
    expect(searchService.searchSpotsInBoundsWithFilter).not.toHaveBeenCalled();
  });

  it("loads close-zoom base spot previews from Typesense without Firestore tile reads", async () => {
    vi.useFakeTimers();

    const preview = makeSpot("typesense-preview", SpotTypes.PkPark, {
      lat: 47.3897,
      lng: 8.5173,
    }).makePreviewData();
    const searchService = {
      searchSpotsInBoundsWithFilter: vi.fn(),
      searchSpotsInRawBounds: vi.fn().mockResolvedValue({
        hits: [{ document: { id: preview.id } }],
      }),
      getSpotPreviewFromHit: vi.fn(() => preview),
    };
    const manager = new SpotMapDataManager(
      "en",
      makeInjector(
        new Map<unknown, unknown>([
          [SpotsService, {}],
          [SearchService, searchService],
        ])
      )
    );

    await (
      manager as unknown as {
        _executeSetVisibleTiles: (tiles: TilesObject) => Promise<void>;
      }
    )._executeSetVisibleTiles({
      zoom: 16,
      tiles: [{ x: 34318, y: 22946 }],
      sw: { x: 34318, y: 22946 },
      ne: { x: 34318, y: 22946 },
      viewportBounds: {
        north: 47.4,
        south: 47.3,
        east: 8.6,
        west: 8.5,
      },
    });

    await Promise.resolve();

    expect(searchService.searchSpotsInRawBounds).toHaveBeenCalledWith(
      47.4,
      47.3,
      8.6,
      8.5,
      250,
      undefined,
      undefined,
      undefined,
      undefined,
      false
    );
    expect(manager.visibleHighlightedSpots()).toEqual([preview]);

    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("moves a loaded spot to its new z16 tile when its location changes", () => {
    const originalSpot = makeSpot("moved", SpotTypes.PkPark, {
      lat: 47.38973830840186,
      lng: 8.51731398695088,
    });
    const updatedSpot = makeSpot("moved", SpotTypes.PkPark, {
      lat: 47.39973830840186,
      lng: 8.52731398695088,
    });
    const manager = new SpotMapDataManager("en", makeInjector());

    manager.addLoadedSpot(originalSpot);
    const oldTile = originalSpot.tileCoordinates?.z16;
    expect(oldTile).toBeDefined();

    manager.addLoadedSpot(updatedSpot);
    const newTile = updatedSpot.tileCoordinates?.z16;
    expect(newTile).toBeDefined();
    expect(newTile).not.toEqual(oldTile);

    renderCachedSpotsForTile(manager, oldTile!);
    expect(manager.visibleSpots()).toEqual([]);

    renderCachedSpotsForTile(manager, newTile!);
    expect(manager.visibleSpots()).toEqual([updatedSpot]);
  });

  it("keeps a local preview update when Typesense still returns stale spot data", () => {
    const stalePreview = makeSpot("rated", SpotTypes.PkPark, {
      lat: 47.3897,
      lng: 8.5173,
    }).makePreviewData();
    stalePreview.rating = 3;

    const updatedSpot = makeSpot("rated", SpotTypes.PkPark, {
      lat: 47.3997,
      lng: 8.5273,
    });
    updatedSpot.rating = 4.5;
    updatedSpot.numReviews = 2;

    const searchService = {
      searchSpotsInBoundsWithFilter: vi.fn(),
      searchSpotsInRawBounds: vi.fn().mockResolvedValue({ hits: [] }),
      getSpotPreviewFromHit: vi.fn(() => stalePreview),
    };
    const manager = new SpotMapDataManager(
      "en",
      makeInjector(
        new Map<unknown, unknown>([[SearchService, searchService]])
      )
    );

    manager.setManualHighlightedSpots([stalePreview]);
    manager.updatePreviewFromSpot(updatedSpot);

    const locallyUpdatedPreview = manager.visibleHighlightedSpots()[0];
    expect(locallyUpdatedPreview?.location_raw).toEqual(updatedSpot.location());
    expect(locallyUpdatedPreview?.rating).toBe(4.5);

    const staleSearchPreview = (
      manager as unknown as {
        _getOrCreateSpotPreviewFromHit: (hit: {
          document: { id: string };
        }) => SpotPreviewData;
      }
    )._getOrCreateSpotPreviewFromHit({ document: { id: "rated" } });

    expect(staleSearchPreview).toBe(locallyUpdatedPreview);
    expect(staleSearchPreview.location_raw).toEqual(updatedSpot.location());
    expect(staleSearchPreview.rating).toBe(4.5);
  });
});
