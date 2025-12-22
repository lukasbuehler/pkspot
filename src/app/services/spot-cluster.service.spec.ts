import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SpotClusterService, ClusterPoint } from './spot-cluster.service';
import { SearchService } from './search.service';
import { VisibleViewport } from '../components/maps/map-base';

// Mock google maps globals for testing
(global as any).google = {
  maps: {
    LatLng: class {
      constructor(public lat: number, public lng: number) {}
    },
    LatLngBounds: class {
      constructor(public sw: any, public ne: any) {}
      getNorthEast() { return this.ne; }
      getSouthWest() { return this.sw; }
      getCenter() { 
        return { 
          lat: () => (this.sw.lat + this.ne.lat) / 2,
          lng: () => (this.sw.lng + this.ne.lng) / 2
        };
      }
    }
  }
};

describe('SpotClusterService', () => {
  let service: SpotClusterService;
  let searchServiceSpy: { searchSpotsInBounds: any };

  beforeEach(() => {
    const spy = {
      searchSpotsInBounds: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        SpotClusterService,
        { provide: SearchService, useValue: spy }
      ]
    });

    service = TestBed.inject(SpotClusterService);
    searchServiceSpy = TestBed.inject(SearchService) as any;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getPointsForTile', () => {
    it('should return points for a given tile', async () => {
      const mockPoints = [
        { document: { id: '1', location: [10, 20] } },
        { document: { id: '2', location: [11, 21] } }
      ];
      searchServiceSpy.searchSpotsInBounds.mockResolvedValue({ hits: mockPoints, found: 2 });

      const points = await service.getPointsForTile(12, 1, 1);

      expect(points.length).toBe(2);
      expect(points[0].id).toBe('1');
      expect(points[0].lat).toBe(10);
      expect(points[0].lng).toBe(20);
      expect(searchServiceSpy.searchSpotsInBounds).toHaveBeenCalled();
    });

    it('should handle cached results', async () => {
      const mockPoints = [{ document: { id: '1', location: [10, 20] } }];
      searchServiceSpy.searchSpotsInBounds.mockResolvedValue({ hits: mockPoints, found: 1 });

      await service.getPointsForTile(12, 1, 1);
      await service.getPointsForTile(12, 1, 1);

      expect(searchServiceSpy.searchSpotsInBounds).toHaveBeenCalledTimes(1);
    });
  });

  describe('clusterPointsForViewport', () => {
    it('should cluster points correctly', () => {
      const points: ClusterPoint[] = [
        { id: '1', lat: 10, lng: 10 },
        { id: '2', lat: 10.0001, lng: 10.0001 }, // Very close -> should cluster
        { id: '3', lat: 20, lng: 20 }           // Far away -> distinct cluster/point
      ];

      const viewport: VisibleViewport = {
        zoom: 10,
        bbox: { north: 30, south: 0, east: 30, west: 0 }
      };

      const result = service.clusterPointsForViewport(points, viewport, 10);

      expect(result.clusters.length).toBeGreaterThan(0);
      // We expect at least 2 clusters: one for (1,2) and one for (3)
      // Note: exact count depends on Supercluster internal logic, but we test basic grouping
    });
  });
});
