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
  OsmDataService,
} from "./osm-data.service";

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
): OsmAmenityTileResponse {
  return {
    tile: { zoom: 12, x: 2145, y: 1432 },
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
