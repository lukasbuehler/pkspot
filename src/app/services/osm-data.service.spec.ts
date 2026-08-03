import { TestBed } from "@angular/core/testing";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getSpotMarkerPriority } from "../components/map/markers/spot-marker-priority";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";
import {
  OsmAmenityTileResponse,
  OsmAmenityTileRequest,
  OsmDataService,
} from "./osm-data.service";
import { MapHelpers } from "../../scripts/MapHelpers";

describe("OsmDataService", () => {
  const functions = { callAppChecked: vi.fn() };
  let service: OsmDataService;

  beforeEach(() => {
    functions.callAppChecked.mockReset();
    TestBed.configureTestingModule({
      providers: [
        OsmDataService,
        { provide: FunctionsAdapterService, useValue: functions },
      ],
    });
    service = TestBed.inject(OsmDataService);
  });

  it("keeps every OSM amenity below Spot markers", async () => {
    functions.callAppChecked.mockResolvedValue(response([
      amenity(1, "drinking_water"),
      amenity(2, "fountain"),
      toilet(3, "no"),
      toilet(4),
      toilet(5, "yes"),
    ]));

    const markers = await service.getAmenityMarkers({
      zoom: 12,
      x: 2145,
      y: 1432,
    });

    expect(functions.callAppChecked).toHaveBeenCalledWith(
      "getOsmAmenityTile",
      { zoom: 12, x: 2145, y: 1432 },
    );
    expect(markers.map((marker) => marker.id)).toEqual([
      "osm-node-1",
      "osm-node-2",
      "osm-node-3",
      "osm-node-4",
      "osm-node-5",
    ]);
    expect(markers.map((marker) => marker.priority)).toEqual([
      -10,
      -10,
      -20,
      -30,
      -40,
    ]);
    expect(markers.map((marker) => marker.color)).toEqual([
      "gray",
      "gray",
      "gray",
      "gray",
      "gray",
    ]);
    expect(
      Math.max(...markers.map((marker) => Number(marker.priority))),
    ).toBeLessThan(
      getSpotMarkerPriority({
        rating: 1,
        access: "off-limits",
        isReported: true,
      }),
    );
  });

  it("deduplicates pending and completed tile requests", async () => {
    functions.callAppChecked.mockResolvedValue(
      response([amenity(1, "drinking_water")]),
    );
    const tile = { zoom: 12, x: 2145, y: 1432 } as const;

    const [first, second] = await Promise.all([
      service.getAmenityMarkers(tile),
      service.getAmenityMarkers(tile),
    ]);
    const third = await service.getAmenityMarkers(tile);

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(functions.callAppChecked).toHaveBeenCalledTimes(1);
  });

  it("maps normalized toilet details without exposing upstream data shapes", async () => {
    functions.callAppChecked.mockResolvedValue(
      response([
        {
          ...toilet(8, "yes"),
          name: "Station WC",
          charge: "CHF 1",
          operator: "SBB",
          openingHours: "06:00-23:00",
        },
      ],
      ),
    );
    const [marker] = await service.getAmenityMarkers({
      zoom: 12,
      x: 2145,
      y: 1432,
    });

    expect(marker).toMatchObject({
      id: "osm-node-8",
      name: "Station WC",
      icons: ["wc", "paid"],
      description: "Fee: CHF 1 • by SBB • Opening hours: 06:00-23:00",
    });
  });

  it("finds a matching amenity in the containing tile and keeps the origin client-side", async () => {
    const origin = { lat: 47.37, lng: 8.54 };
    functions.callAppChecked.mockResolvedValue(
      response([
        { ...toilet(1), lat: 47.3701 },
        { ...amenity(2, "drinking_water"), lat: 47.3705 },
      ]),
    );

    const result = await service.findNearestAmenity(origin, {
      type: "drinking_water",
    });

    expect(result.marker?.id).toBe("osm-node-2");
    expect(result.distanceMeters).toBeGreaterThan(50);
    expect(result.distanceMeters).toBeLessThan(60);
    expect(result).toMatchObject({
      searchedTileCount: 1,
      complete: true,
    });
    expect(functions.callAppChecked).toHaveBeenCalledOnce();
    expect(functions.callAppChecked.mock.calls[0]?.[1]).not.toEqual(origin);
  });

  it("searches a neighbouring tile when it can contain a closer amenity", async () => {
    const startTile = { zoom: 12, x: 2145, y: 1432 } as const;
    const bounds = MapHelpers.getBoundsForTile(
      startTile.zoom,
      startTile.x,
      startTile.y,
    );
    const origin = {
      lat: (bounds.north + bounds.south) / 2,
      lng: bounds.east - 0.00001,
    };
    functions.callAppChecked.mockImplementation(
      (_name: string, tile: OsmAmenityTileRequest) =>
        Promise.resolve(
          response(
            tile.x === startTile.x
              ? [
                  {
                    ...amenity(3, "drinking_water"),
                    lat: origin.lat,
                    lng: origin.lng - 0.01,
                  },
                ]
              : tile.x === startTile.x + 1 && tile.y === startTile.y
                ? [
                    {
                      ...amenity(4, "drinking_water"),
                      lat: origin.lat,
                      lng: bounds.east + 0.0001,
                    },
                  ]
                : [],
            tile,
          ),
        ),
    );

    const result = await service.findNearestAmenity(origin, {
      type: "drinking_water",
    });

    expect(result.marker?.id).toBe("osm-node-4");
    expect(result).toMatchObject({
      searchedTileCount: 2,
      complete: true,
    });
    expect(
      functions.callAppChecked.mock.calls.map((call) => call[1]),
    ).toEqual([
      startTile,
      { zoom: 12, x: startTile.x + 1, y: startTile.y },
    ]);
  });

  it("reports an incomplete best result when the tile safety limit is reached", async () => {
    const startTile = { zoom: 12, x: 2145, y: 1432 } as const;
    const bounds = MapHelpers.getBoundsForTile(
      startTile.zoom,
      startTile.x,
      startTile.y,
    );
    const origin = {
      lat: (bounds.north + bounds.south) / 2,
      lng: bounds.east - 0.00001,
    };
    functions.callAppChecked.mockResolvedValue(
      response([
        {
          ...toilet(5),
          lat: origin.lat,
          lng: origin.lng - 0.01,
        },
      ]),
    );

    const result = await service.findNearestAmenity(origin, {
      type: "wc",
      maxTiles: 1,
    });

    expect(result.marker?.id).toBe("osm-node-5");
    expect(result).toMatchObject({
      searchedTileCount: 1,
      complete: false,
    });
    expect(functions.callAppChecked).toHaveBeenCalledOnce();
  });

  it("returns a complete empty result when no match is inside the radius", async () => {
    functions.callAppChecked.mockResolvedValue(
      response([
        {
          ...amenity(6, "drinking_water"),
          lat: 47.38,
          lng: 8.54,
        },
      ]),
    );

    const result = await service.findNearestAmenity(
      { lat: 47.37, lng: 8.54 },
      {
        type: "drinking_water",
        maxDistanceMeters: 50,
      },
    );

    expect(result).toEqual({
      marker: null,
      distanceMeters: null,
      searchedTileCount: 1,
      complete: true,
    });
  });
});

function amenity(
  id: number,
  type: "drinking_water" | "fountain",
): OsmAmenityTileResponse["amenities"][number] {
  return {
    id,
    type,
    lat: 47.37,
    lng: 8.54,
    drinkingWater: type === "fountain" ? "yes" : undefined,
  };
}

function toilet(
  id: number,
  fee?: "yes" | "no",
): OsmAmenityTileResponse["amenities"][number] {
  return {
    id,
    type: "toilets",
    lat: 47.37,
    lng: 8.54,
    fee,
  };
}

function response(
  amenities: OsmAmenityTileResponse["amenities"],
  tile: OsmAmenityTileRequest = { zoom: 12, x: 2145, y: 1432 },
): OsmAmenityTileResponse {
  return {
    tile,
    fetchedAt: "2026-07-26T12:00:00Z",
    stale: false,
    amenities,
    attribution: {
      text: "© OpenStreetMap contributors",
      url: "https://www.openstreetmap.org/copyright",
      license: "ODbL 1.0",
    },
  };
}
