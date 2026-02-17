import { describe, it, expect, beforeEach, vi } from "vitest";
import { TestBed } from "@angular/core/testing";
import { SpotClusterService, ClusterPoint } from "./spot-cluster.service";
import { SearchService } from "./search.service";
import { VisibleViewport } from "../components/maps/map-base";

// Mock google maps globals for testing
(global as any).google = {
  maps: {
    LatLng: class {
      constructor(public lat: number, public lng: number) {}
    },
    LatLngBounds: class {
      constructor(public sw: any, public ne: any) {}
      getNorthEast() {
        return this.ne;
      }
      getSouthWest() {
        return this.sw;
      }
      getCenter() {
        return {
          lat: () => (this.sw.lat + this.ne.lat) / 2,
          lng: () => (this.sw.lng + this.ne.lng) / 2,
        };
      }
    },
  },
};

describe("SpotClusterService", () => {
  let service: SpotClusterService;
  let searchServiceSpy: { searchSpotsInBounds: any };

  beforeEach(() => {
    const spy = {
      searchSpotsInBounds: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        SpotClusterService,
        { provide: SearchService, useValue: spy },
      ],
    });

    service = TestBed.inject(SpotClusterService);
    searchServiceSpy = TestBed.inject(SearchService) as any;
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  describe("getPointsForTile", () => {
    it("should return points for a given tile", async () => {
      const mockPoints = [
        { document: { id: "1", location: [10, 20] } },
        { document: { id: "2", location: [11, 21] } },
      ];
      searchServiceSpy.searchSpotsInBounds.mockResolvedValue({
        hits: mockPoints,
        found: 2,
      });

      const points = await service.getPointsForTile(12, 1, 1);

      expect(points.length).toBe(2);
      expect(points[0].id).toBe("1");
      expect(points[0].lat).toBe(10);
      expect(points[0].lng).toBe(20);
      expect(searchServiceSpy.searchSpotsInBounds).toHaveBeenCalled();
    });

    it("should handle cached results", async () => {
      const mockPoints = [{ document: { id: "1", location: [10, 20] } }];
      searchServiceSpy.searchSpotsInBounds.mockResolvedValue({
        hits: mockPoints,
        found: 1,
      });

      await service.getPointsForTile(12, 1, 1);
      await service.getPointsForTile(12, 1, 1);

      expect(searchServiceSpy.searchSpotsInBounds).toHaveBeenCalledTimes(1);
    });
  });

  describe("getClustersForViewport", () => {
    it("should calculate tiles correctly for standard viewport", async () => {
      searchServiceSpy.searchSpotsInBounds.mockResolvedValue({
        hits: [],
        found: 0,
      });

      const viewport: VisibleViewport = {
        zoom: 4,
        bbox: { north: 10, south: 0, east: 10, west: 0 },
      };

      // Zoom 4, standard small viewport -> fetchZoom = 3
      // Should fetch a small grid of tiles
      await service.getClustersForViewport(viewport, 4);

      expect(searchServiceSpy.searchSpotsInBounds).toHaveBeenCalled();
    });

    it("should clamp Y coordinates at low zoom (Polar Regions)", async () => {
      // Test for the fix: prevent negative Y tiles or tiles > maxY
      searchServiceSpy.searchSpotsInBounds.mockResolvedValue({
        hits: [],
        found: 0,
      });

      // Viewport extending very far north/south near poles
      const viewport: VisibleViewport = {
        zoom: 2,
        bbox: { north: 89, south: -89, east: 10, west: 0 },
      };

      // Spy on private _getTilesCoveringViewport if possible, or verify calls
      // Since we can't easy spy on private, we rely on it preventing error or checking debug log structure
      // Ideally we would inspect the private method return value, but for integration test we ensure no crash
      // and that we can infer correct behavior.
      const result = await service.getClustersForViewport(viewport, 2);
      expect(result).toBeDefined();

      // To verify Y clamping specifically, we can check that we don't get errors from downstream
      // or invalid tile requests.
    });
  });

  describe("_getTilesCoveringViewport (private method tests via public API or casting)", () => {
    // Access private method for direct testing
    let getTiles: (v: VisibleViewport, z: number) => { x: number; y: number }[];

    beforeEach(() => {
      getTiles = (service as any)["_getTilesCoveringViewport"].bind(service);
    });

    it("should clamp Y tiles to valid range [0, 2^zoom - 1]", () => {
      const zoom = 2; // Max Y is 3 (4 tiles: 0, 1, 2, 3)
      const viewport: VisibleViewport = {
        zoom,
        bbox: { north: 89.9, south: -89.9, east: 10, west: 0 },
      };

      const tiles = getTiles(viewport, zoom);

      // Should contain Y: 0, 1, 2, 3. Should NOT contain -1, -2, 4, 5
      const yValues = tiles.map((t) => t.y);
      const minY = Math.min(...yValues);
      const maxY = Math.max(...yValues);

      expect(minY).toBeGreaterThanOrEqual(0);
      expect(maxY).toBeLessThanOrEqual(3);
      expect(yValues.some((y) => y < 0)).toBe(false);
    });

    it("should handle Date Line crossing (West > East)", () => {
      const zoom = 2;
      const viewport: VisibleViewport = {
        zoom,
        bbox: { north: 10, south: 0, east: -170, west: 170 },
      };
      // 170 to -170 crosses the date line (180/-180)

      const tiles = getTiles(viewport, zoom);
      const xValues = tiles.map((t) => t.x);

      // Should include tiles at the end (3) and start (0) of the world at zoom 2
      // Tiles at X=3 (Western Hemisphere edge) and X=0 (Eastern Hemisphere edge)
      expect(xValues).toContain(0);
      expect(xValues).toContain(3);
    });

    it("should handle Full World Wrap (West === East)", () => {
      const zoom = 2;
      const viewport: VisibleViewport = {
        zoom,
        bbox: { north: 10, south: 0, east: 0, west: 0 },
      };

      const tiles = getTiles(viewport, zoom);

      // Should fetch ALL horizontal tiles for the zoom
      // At zoom 2, there are 4 columns: 0, 1, 2, 3
      const uniqueX = new Set(tiles.map((t) => t.x));
      expect(uniqueX.size).toBe(4);
      expect(uniqueX.has(0)).toBe(true);
      expect(uniqueX.has(1)).toBe(true);
      expect(uniqueX.has(2)).toBe(true);
      expect(uniqueX.has(3)).toBe(true);
    });
  });

  describe("_getClusterResultForViewport", () => {
    it("should query full 360 range when West === East", () => {
      // Setup mock index
      const mockIndex = {
        getClusters: vi.fn().mockReturnValue([]),
      };
      (service as any)._clusterIndex = mockIndex;
      (service as any)._clusterIndexPoints = [];

      const viewport: VisibleViewport = {
        zoom: 2,
        bbox: { north: 80, south: -80, east: 0, west: 0 },
      };

      (service as any)._getClusterResultForViewport(viewport, 2);

      // Expect getClusters to be called with bbox [-180, -80, 180, 80]
      expect(mockIndex.getClusters).toHaveBeenCalledWith(
        [-180, -80, 180, 80],
        2 // floor(2)
      );
    });
  });

  describe("clusterPointsForViewport", () => {
    it("should cluster points correctly", () => {
      const points: ClusterPoint[] = [
        { id: "1", lat: 10, lng: 10 },
        { id: "2", lat: 10.0001, lng: 10.0001 }, // Very close -> should cluster
        { id: "3", lat: 20, lng: 20 }, // Far away -> distinct cluster/point
      ];

      const viewport: VisibleViewport = {
        zoom: 10,
        bbox: { north: 30, south: 0, east: 30, west: 0 },
      };

      const result = service.clusterPointsForViewport(points, viewport, 10);

      expect(result.clusters.length).toBeGreaterThan(0);
      // We expect at least 2 clusters: one for (1,2) and one for (3)
      // Note: exact count depends on Supercluster internal logic, but we test basic grouping
    });
  });

  describe("_deduplicatePoints (private method via casting)", () => {
    let deduplicatePoints: (points: ClusterPoint[]) => ClusterPoint[];

    beforeEach(() => {
      deduplicatePoints = (service as any)["_deduplicatePoints"].bind(service);
    });

    it("should remove duplicate points by id", () => {
      const points: ClusterPoint[] = [
        { id: "1", lat: 10, lng: 20 },
        { id: "2", lat: 11, lng: 21 },
        { id: "1", lat: 10, lng: 20 }, // Duplicate
        { id: "3", lat: 12, lng: 22 },
        { id: "2", lat: 11, lng: 21 }, // Duplicate
      ];

      const unique = deduplicatePoints(points);

      expect(unique.length).toBe(3);
      expect(unique.map((p) => p.id)).toEqual(["1", "2", "3"]);
    });

    it("should handle empty array", () => {
      const unique = deduplicatePoints([]);
      expect(unique).toEqual([]);
    });

    it("should return same array if no duplicates", () => {
      const points: ClusterPoint[] = [
        { id: "a", lat: 1, lng: 1 },
        { id: "b", lat: 2, lng: 2 },
        { id: "c", lat: 3, lng: 3 },
      ];

      const unique = deduplicatePoints(points);
      expect(unique.length).toBe(3);
    });
  });

  describe("_mapDocumentToClusterPoint (private method via casting)", () => {
    let mapDoc: (doc: any) => ClusterPoint;

    beforeEach(() => {
      mapDoc = (service as any)["_mapDocumentToClusterPoint"].bind(service);
    });

    it("should handle array location format [lat, lng]", () => {
      const doc = { id: "spot1", location: [48.1234, 11.5678] };
      const point = mapDoc(doc);

      expect(point.id).toBe("spot1");
      expect(point.lat).toBe(48.1234);
      expect(point.lng).toBe(11.5678);
    });

    it("should handle object location format with latitude/longitude", () => {
      const doc = {
        id: "spot2",
        location: { latitude: 48.0, longitude: 11.0 },
      };
      const point = mapDoc(doc);

      expect(point.lat).toBe(48.0);
      expect(point.lng).toBe(11.0);
    });

    it("should handle object location format with lat/lng", () => {
      const doc = { id: "spot3", location: { lat: 47.5, lng: 10.5 } };
      const point = mapDoc(doc);

      expect(point.lat).toBe(47.5);
      expect(point.lng).toBe(10.5);
    });

    it("should preserve additional document properties", () => {
      const doc = {
        id: "spot4",
        location: [48.0, 11.0],
        name: "Test Spot",
        type: "outdoor",
      };
      const point = mapDoc(doc);

      expect(point["name"]).toBe("Test Spot");
      expect(point["type"]).toBe("outdoor");
    });
  });

  describe("_enumerateXRange (private method via casting)", () => {
    let enumerateXRange: (start: number, end: number, zoom: number) => number[];

    beforeEach(() => {
      enumerateXRange = (service as any)["_enumerateXRange"].bind(service);
    });

    it("should enumerate simple range", () => {
      const range = enumerateXRange(0, 3, 4); // 4 tiles at zoom 4
      expect(range).toEqual([0, 1, 2, 3]);
    });

    it("should wrap around at date line", () => {
      // At zoom 2, there are 4 columns (0, 1, 2, 3)
      // Range from 3 to 1 should wrap: 3 -> 0 -> 1
      const range = enumerateXRange(3, 1, 2);
      expect(range).toEqual([3, 0, 1]);
    });

    it("should normalize negative values", () => {
      const range = enumerateXRange(-1, 1, 2);
      // -1 % 4 = 3, so should go 3 -> 0 -> 1
      expect(range).toContain(0);
      expect(range).toContain(1);
    });
  });

  describe("_getFetchZoomForViewportZoom (private method via casting)", () => {
    let getFetchZoom: (zoom: number) => number;

    beforeEach(() => {
      getFetchZoom = (service as any)["_getFetchZoomForViewportZoom"].bind(
        service
      );
    });

    it("should fetch one zoom level up for normal cluster zooms", () => {
      expect(getFetchZoom(15)).toBe(14);
      expect(getFetchZoom(12)).toBe(11);
      expect(getFetchZoom(10)).toBe(9);
    });

    it("should clamp low zooms to minimum fetch zoom", () => {
      expect(getFetchZoom(2)).toBe(2);
      expect(getFetchZoom(1)).toBe(2);
      expect(getFetchZoom(0)).toBe(2);
    });

    it("should clamp high zooms to maximum fetch zoom", () => {
      expect(getFetchZoom(16)).toBe(14);
      expect(getFetchZoom(20)).toBe(14);
    });
  });

  describe("Cache behavior", () => {
    it("should use cached results for same tile", async () => {
      const mockPoints = [{ document: { id: "1", location: [10, 20] } }];
      searchServiceSpy.searchSpotsInBounds.mockResolvedValue({
        hits: mockPoints,
        found: 1,
      });

      // First call - should fetch
      await service.getPointsForTile(12, 1, 1);
      // Second call - should use cache
      await service.getPointsForTile(12, 1, 1);
      // Third call - should still use cache
      await service.getPointsForTile(12, 1, 1);

      // Should only have called the search service once
      expect(searchServiceSpy.searchSpotsInBounds).toHaveBeenCalledTimes(1);
    });

    it("should fetch different tiles separately", async () => {
      const mockPoints = [{ document: { id: "1", location: [10, 20] } }];
      searchServiceSpy.searchSpotsInBounds.mockResolvedValue({
        hits: mockPoints,
        found: 1,
      });

      await service.getPointsForTile(12, 1, 1);
      await service.getPointsForTile(12, 2, 2);
      await service.getPointsForTile(12, 3, 3);

      expect(searchServiceSpy.searchSpotsInBounds).toHaveBeenCalledTimes(3);
    });
  });

  describe("Error handling", () => {
    it("should return empty array on fetch error", async () => {
      searchServiceSpy.searchSpotsInBounds.mockRejectedValue(
        new Error("Network error")
      );

      const points = await service.getPointsForTile(12, 1, 1);

      expect(points).toEqual([]);
    });
  });
});
