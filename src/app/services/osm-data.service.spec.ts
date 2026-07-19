import { HttpClient } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { firstValueFrom, of } from "rxjs";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getSpotMarkerPriority } from "../components/map/markers/spot-marker-priority";
import { OsmDataService } from "./osm-data.service";
import type { OverpassResponse } from "./osm-data.service";

describe("OsmDataService", () => {
  const googleGlobal = globalThis as unknown as { google?: typeof google };
  const http = { post: vi.fn() };
  let originalGoogle: typeof google | undefined;
  let service: OsmDataService;

  beforeAll(() => {
    originalGoogle = googleGlobal.google;
    googleGlobal.google = {
      maps: {
        LatLngBounds: class {},
      },
    } as unknown as typeof google;
  });

  afterAll(() => {
    if (originalGoogle) {
      googleGlobal.google = originalGoogle;
    } else {
      delete googleGlobal.google;
    }
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        OsmDataService,
        { provide: HttpClient, useValue: http },
      ],
    });
    service = TestBed.inject(OsmDataService);
  });

  it("keeps every OSM amenity below Spot markers", async () => {
    const response: OverpassResponse = {
      version: 0.6,
      geneartor: "Overpass API",
      osm3s: {
        timestamp_osm_base: "2026-07-18T00:00:00Z",
        copytight: "",
      },
      elements: [
        amenity(1, "drinking_water"),
        amenity(2, "fountain"),
        toilet(3, "no"),
        toilet(4),
        toilet(5, "yes"),
      ],
    };
    http.post.mockReturnValue(of(response));

    const markers = await firstValueFrom(
      service.getAmenityMarkers({
        north: 47.4,
        south: 47.3,
        east: 8.6,
        west: 8.5,
      }),
    );

    expect(markers.map((marker) => marker.priority)).toEqual([
      -10,
      -10,
      -20,
      -30,
      -40,
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
});

function amenity(
  id: number,
  type: "drinking_water" | "fountain",
): OverpassResponse["elements"][number] {
  return {
    type: "node",
    id,
    lat: 47.37,
    lon: 8.54,
    tags: {
      amenity: type,
      drinking_water: type === "fountain" ? "yes" : undefined,
    },
  };
}

function toilet(
  id: number,
  fee?: "yes" | "no",
): OverpassResponse["elements"][number] {
  return {
    type: "node",
    id,
    lat: 47.37,
    lon: 8.54,
    tags: {
      amenity: "toilets",
      fee,
    },
  };
}
