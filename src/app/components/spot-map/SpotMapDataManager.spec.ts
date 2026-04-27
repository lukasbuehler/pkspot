import { Injector, NgZone } from "@angular/core";
import { describe, expect, it, vi } from "vitest";
import { GeoPoint } from "firebase/firestore";
import { Spot } from "../../../db/models/Spot";
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

function makeInjector(): Injector {
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

  return {
    get: (token: unknown) => {
      if (token === SpotClusterService) {
        throw new Error("SpotClusterService intentionally omitted");
      }
      return providers.get(token);
    },
  } as Injector;
}

function makeSpot(id: string, type: SpotTypes): Spot {
  const data = {
    name: { en: "Spot " + id },
    location: new GeoPoint(0, 0),
    location_raw: { lat: 0, lng: 0 },
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
});
