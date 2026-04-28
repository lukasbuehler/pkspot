import { describe, it, expect, beforeEach, vi } from "vitest";
import { TestBed } from "@angular/core/testing";
import { SearchService } from "./search.service";
import { MapsApiService } from "./maps-api.service";
import { GeoPoint } from "firebase/firestore";
import {
  SpotFilterMode,
  SPOT_FILTER_CONFIGS,
} from "../components/spot-map/spot-filter-config";

// Mock the Typesense SearchClient
vi.mock("typesense", () => ({
  SearchClient: vi.fn().mockImplementation(() => ({
    collections: vi.fn().mockReturnValue({
      documents: vi.fn().mockReturnValue({
        search: vi.fn().mockResolvedValue({ hits: [], found: 0 }),
      }),
    }),
  })),
}));

// Mock environment
vi.mock("../../environments/environment", () => ({
  environment: {
    keys: {
      typesense: {
        host: "mock-host",
        apiKey: "mock-key",
      },
    },
  },
}));

describe("SearchService", () => {
  let service: SearchService;
  let mapsApiServiceSpy: { autocompletePlaceSearch: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mapsApiServiceSpy = {
      autocompletePlaceSearch: vi.fn().mockResolvedValue([]),
    };

    TestBed.configureTestingModule({
      providers: [
        SearchService,
        { provide: MapsApiService, useValue: mapsApiServiceSpy },
      ],
    });

    service = TestBed.inject(SearchService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  describe("getSpotPreviewFromHit", () => {
    it("should handle string name correctly", () => {
      const hit = {
        document: {
          id: "test-id",
          name: "Test Spot",
          type: "outdoor",
          access: "public",
          location: [48.1234, 11.5678],
        },
      };

      const preview = service.getSpotPreviewFromHit(hit);

      expect(preview.name).toBe("Test Spot");
      expect(preview.id).toBe("test-id");
      expect(preview.type).toBe("outdoor");
    });

    it("should handle locale map name (object)", () => {
      const hit = {
        document: {
          id: "test-id",
          name: {
            en: "English Name",
            de: "German Name",
          },
          location: [48.1234, 11.5678],
        },
      };

      const preview = service.getSpotPreviewFromHit(hit);

      // Should pick first available locale
      expect(preview.name).toBeTruthy();
      expect(["English Name", "German Name"]).toContain(preview.name);
    });

    it("should handle missing name", () => {
      const hit = {
        document: {
          id: "test-id",
          location: [48.1234, 11.5678],
        },
      };

      const preview = service.getSpotPreviewFromHit(hit);

      expect(preview.name).toBe("Unnamed Spot");
    });

    it("should parse location array correctly", () => {
      const hit = {
        document: {
          id: "test-id",
          name: "Test",
          location: [48.1234, 11.5678],
        },
      };

      const preview = service.getSpotPreviewFromHit(hit);

      expect(preview.location).toBeInstanceOf(GeoPoint);
      expect(preview.location?.latitude).toBe(48.1234);
      expect(preview.location?.longitude).toBe(11.5678);
    });

    it("should parse location object correctly", () => {
      const hit = {
        document: {
          id: "test-id",
          name: "Test",
          location: { latitude: 48.1234, longitude: 11.5678 },
        },
      };

      const preview = service.getSpotPreviewFromHit(hit);

      expect(preview.location).toBeInstanceOf(GeoPoint);
      expect(preview.location?.latitude).toBe(48.1234);
      expect(preview.location?.longitude).toBe(11.5678);
    });

    it("should build locality string correctly", () => {
      const hit = {
        document: {
          id: "test-id",
          name: "Test",
          address: {
            sublocality: "Schwabing",
            locality: "Munich",
            country: { code: "de" },
          },
        },
      };

      const preview = service.getSpotPreviewFromHit(hit);

      expect(preview.locality).toBe("Schwabing, Munich, DE");
    });

    it("should handle partial address data", () => {
      const hit = {
        document: {
          id: "test-id",
          name: "Test",
          address: {
            locality: "Berlin",
          },
        },
      };

      const preview = service.getSpotPreviewFromHit(hit);

      expect(preview.locality).toBe("Berlin");
    });

    it("should reconstruct amenities from arrays", () => {
      const hit = {
        document: {
          id: "test-id",
          name: "Test",
          amenities_true: ["dry", "covered"],
          amenities_false: ["toilet"],
        },
      };

      const preview = service.getSpotPreviewFromHit(hit);

      expect(preview.amenities).toEqual({
        dry: true,
        covered: true,
        toilet: false,
      });
    });

    it("should parse isIconic boolean correctly", () => {
      const hit = {
        document: {
          id: "test-id",
          name: "Test",
          isIconic: true,
        },
      };

      const preview = service.getSpotPreviewFromHit(hit);

      expect(preview.isIconic).toBe(true);
    });

    it("should parse isIconic string correctly", () => {
      const hit = {
        document: {
          id: "test-id",
          name: "Test",
          isIconic: "true",
        },
      };

      const preview = service.getSpotPreviewFromHit(hit);

      expect(preview.isIconic).toBe(true);
    });

    it("should handle errors gracefully", () => {
      const hit = null;

      const preview = service.getSpotPreviewFromHit(hit as any);

      expect(preview).toEqual({});
    });

    it("should include slug when present", () => {
      const hit = {
        document: {
          id: "test-id",
          name: "Test",
          slug: "test-spot-slug",
        },
      };

      const preview = service.getSpotPreviewFromHit(hit);

      expect(preview.slug).toBe("test-spot-slug");
    });

    it("should use thumbnail_url for imageSrc", () => {
      const hit = {
        document: {
          id: "test-id",
          name: "Test",
          thumbnail_url: "https://example.com/thumb.jpg",
          image_url: "https://example.com/image.jpg",
        },
      };

      const preview = service.getSpotPreviewFromHit(hit);

      expect(preview.imageSrc).toBe("https://example.com/thumb.jpg");
    });
  });

  describe("searchSpotsInBoundsWithFilter", () => {
    it("should return empty results for unknown filter mode", async () => {
      const mockBounds = {
        getNorthEast: () => ({ lat: () => 48.2, lng: () => 11.7 }),
        getSouthWest: () => ({ lat: () => 48.1, lng: () => 11.5 }),
        toJSON: () => ({}),
      } as unknown as google.maps.LatLngBounds;

      const results = await service.searchSpotsInBoundsWithFilter(
        mockBounds,
        "unknown-filter" as SpotFilterMode
      );

      expect(results.hits).toEqual([]);
      expect(results.found).toBe(0);
    });
  });

  describe("searchSpotsAndPlaces", () => {
    it("should include Google Places autocomplete results with spot results", async () => {
      const places = [
        {
          place_id: "place-1",
          description: "Bern, Switzerland",
          types: ["locality", "political"],
        },
      ] as google.maps.places.AutocompletePrediction[];
      mapsApiServiceSpy.autocompletePlaceSearch.mockResolvedValue(places);

      const results = await service.searchSpotsAndPlaces("bern");

      expect(mapsApiServiceSpy.autocompletePlaceSearch).toHaveBeenCalledWith(
        "bern",
        ["geocode"]
      );
      expect(results.places).toBe(places);
      expect(results.spots).toMatchObject({ hits: [], found: 0 });
    });

    it("should keep place results when the spot search has no hits", async () => {
      const places = [
        {
          place_id: "place-zurich",
          description: "Zurich, Switzerland",
          types: ["locality", "political"],
        },
      ] as google.maps.places.AutocompletePrediction[];
      mapsApiServiceSpy.autocompletePlaceSearch.mockResolvedValue(places);

      const results = await service.searchSpotsAndPlaces("zurich");

      expect(results.places).toEqual(places);
      expect((results.spots as any).hits).toEqual([]);
    });
  });

  describe("SPOT_FILTER_CONFIGS", () => {
    it("should have Valid filter configurations", () => {
      expect(SPOT_FILTER_CONFIGS.size).toBeGreaterThan(0);
    });

    it("should have ForParkour filter configured", () => {
      const config = SPOT_FILTER_CONFIGS.get(SpotFilterMode.ForParkour);
      expect(config).toBeDefined();
    });

    it("should have Indoor filter configured", () => {
      const config = SPOT_FILTER_CONFIGS.get(SpotFilterMode.Indoor);
      expect(config).toBeDefined();
    });
  });

  describe("sort order fallback", () => {
    it("should keep sort_by rating in spot search parameters", () => {
      expect(service.spotSearchParameters.sort_by).toBe("rating:desc");
    });

    it("should prioritize media within same-rating hits while keeping higher ratings first", () => {
      const hits = [
        {
          document: {
            id: "same-rating-no-media",
            rating: 4.2,
          },
        },
        {
          document: {
            id: "higher-rated-no-media",
            rating: 4.8,
          },
        },
        {
          document: {
            id: "same-rating-with-media",
            rating: 4.2,
            thumbnail_small_url: "https://example.com/thumb.jpg",
          },
        },
        {
          document: {
            id: "unrated-with-media",
            rating: 0,
            thumbnail_medium_url: "https://example.com/unrated-thumb.jpg",
          },
        },
        {
          document: {
            id: "unrated-no-media",
            rating: 0,
          },
        },
      ];

      const ordered = (service as any).sortHitsByRatingThenMedia(hits);
      const orderedIds = ordered.map((hit: any) => hit.document.id);

      expect(orderedIds).toEqual([
        "higher-rated-no-media",
        "same-rating-with-media",
        "same-rating-no-media",
        "unrated-with-media",
        "unrated-no-media",
      ]);
    });
  });
});
