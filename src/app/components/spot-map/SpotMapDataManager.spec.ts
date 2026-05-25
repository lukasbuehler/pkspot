import { Injector, NgZone } from "@angular/core";
import { describe, expect, it, vi } from "vitest";
import { GeoPoint } from "firebase/firestore";
import { Spot } from "../../../db/models/Spot";
import { User } from "../../../db/models/User";
import { SpotId, SpotSchema } from "../../../db/schemas/SpotSchema";
import { SpotTypes } from "../../../db/schemas/SpotTypeAndAccess";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { OsmDataService } from "../../services/osm-data.service";
import { ConsentService } from "../../services/consent.service";
import { SearchService } from "../../services/search.service";
import { SpotClusterService } from "../../services/spot-cluster.service";
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
    [OsmDataService, {}],
    [ConsentService, {}],
    [AuthenticationService, {}],
    [
      SearchService,
      {
        searchSpotsInBoundsWithFilter: vi.fn(),
        getSpotPreviewFromHit: vi.fn(),
      },
    ],
    [NgZone, fakeNgZone],
  ]);

  overrides.forEach((value, token) => providers.set(token, value));

  return {
    get: (token: unknown) => {
      if (token === SpotClusterService) {
        throw new Error("SpotClusterService intentionally omitted");
      }
      return providers.get(token);
    },
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
      _showCachedSpotsAndMarkersForTiles: (tiles: TilesObject) => void;
    }
  )._showCachedSpotsAndMarkersForTiles(visibleTile);
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

  it("keeps coverage spots visible when a preset filter is active", () => {
    const parkourSpot = makeSpot("parkour", SpotTypes.PkPark);
    const regularSpot = makeSpot("regular", SpotTypes.Playground);
    const manager = makeManagerWithSpots([parkourSpot, regularSpot]);

    manager.spotFilterMode.set(SpotFilterMode.ForParkour);
    renderCachedSpots(manager);

    expect(manager.visibleSpots()).toEqual([parkourSpot, regularSpot]);
    expect(manager.visibleHighlightedSpots().map((spot) => spot.id)).toEqual([
      "parkour",
    ]);
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
        _showCachedSpotsAndMarkersForTiles: (tiles: TilesObject) => void;
      }
    )._showCachedSpotsAndMarkersForTiles({
      zoom: 16,
      tiles: [{ x: 34318, y: 22946 }],
      sw: { x: 34318, y: 22946 },
      ne: { x: 34318, y: 22946 },
    });

    expect(manager.visibleSpots()).toEqual([spot]);
  });

  it("does not fetch or retain spot cluster tiles below spot zoom", async () => {
    const spotsService = {
      getSpotClusterTiles: vi.fn(),
    };
    const manager = new SpotMapDataManager(
      "en",
      makeInjector(
        new Map<unknown, unknown>([
          [SpotsService, spotsService],
          [
            ConsentService,
            {
              hasConsent: vi.fn(() => true),
            },
          ],
        ])
      )
    );

    manager.spotFilterMode.set(SpotFilterMode.ForParkour);

    await (
      manager as unknown as {
        _executeSetVisibleTiles: (tiles: TilesObject) => Promise<void>;
      }
    )._executeSetVisibleTiles({
      zoom: 10,
      tiles: [{ x: 532, y: 363 }],
      sw: { x: 532, y: 363 },
      ne: { x: 532, y: 363 },
    });

    expect(spotsService.getSpotClusterTiles).not.toHaveBeenCalled();
    expect(manager.visibleDots()).toEqual([]);
  });
});
