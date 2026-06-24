import { describe, it, expect, beforeEach, vi } from "vitest";
import { TestBed } from "@angular/core/testing";
import { SearchService } from "./search.service";
import { MapsApiService } from "./maps-api.service";
import { PlatformService } from "./platform.service";
import { GeoPoint } from "firebase/firestore";
import {
  SpotFilterMode,
  SPOT_FILTER_CONFIGS,
} from "../components/spot-map/spot-filter-config";

const typesenseSearchMock = vi.hoisted(() => vi.fn());
const typesenseMultiSearchMock = vi.hoisted(() => vi.fn());

// Mock the Typesense SearchClient
vi.mock("typesense", () => ({
  SearchClient: function SearchClient() {
    return {
      multiSearch: {
        perform: typesenseMultiSearchMock,
      },
      collections: vi.fn().mockReturnValue({
        documents: vi.fn().mockReturnValue({
          search: typesenseSearchMock,
        }),
      }),
    };
  },
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
  let platformServiceSpy: { isNative: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    typesenseSearchMock.mockReset();
    typesenseSearchMock.mockResolvedValue({ hits: [], found: 0 });
    typesenseMultiSearchMock.mockReset();
    typesenseMultiSearchMock.mockResolvedValue({
      results: [
        { hits: [], found: 0 },
        { hits: [], found: 0 },
        { hits: [], found: 0 },
        { hits: [], found: 0 },
      ],
    });

    mapsApiServiceSpy = {
      autocompletePlaceSearch: vi.fn().mockResolvedValue([]),
    };
    platformServiceSpy = {
      isNative: vi.fn().mockReturnValue(false),
    };

    TestBed.configureTestingModule({
      providers: [
        SearchService,
        { provide: MapsApiService, useValue: mapsApiServiceSpy },
        { provide: PlatformService, useValue: platformServiceSpy },
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

    it("should parse Firestore-style internal geopoint objects", () => {
      const hit = {
        document: {
          id: "test-id",
          name: "Test",
          location: { _latitude: 47.389738, _longitude: 8.517314 },
          bounds_center: { _latitude: 47.389739, _longitude: 8.517315 },
        },
      };

      const preview = service.getSpotPreviewFromHit(hit);

      expect(preview.location).toBeInstanceOf(GeoPoint);
      expect(preview.location?.latitude).toBe(47.389738);
      expect(preview.location?.longitude).toBe(8.517314);
      expect(preview.bounds_center).toBeInstanceOf(GeoPoint);
      expect(preview.bounds_center?.latitude).toBe(47.389739);
      expect(preview.bounds_center?.longitude).toBe(8.517315);
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

    it("should preserve spot area fields from Typesense hits", () => {
      const hit = {
        document: {
          id: "test-id",
          name: "Test",
          bounds_raw: [
            [47.1, 8.1],
            { lat: 47.2, lng: 8.2 },
            { latitude: 47.3, longitude: 8.3 },
          ],
          bounds_center: [47.2, 8.2],
          bounds_radius_m: "42",
        },
      };

      const preview = service.getSpotPreviewFromHit(hit);

      expect(preview.bounds_raw).toEqual([
        { lat: 47.1, lng: 8.1 },
        { lat: 47.2, lng: 8.2 },
        { lat: 47.3, lng: 8.3 },
      ]);
      expect(preview.bounds?.map((point) => [point.latitude, point.longitude]))
        .toEqual([
          [47.1, 8.1],
          [47.2, 8.2],
          [47.3, 8.3],
        ]);
      expect(preview.bounds_center).toBeInstanceOf(GeoPoint);
      expect(preview.bounds_center?.latitude).toBe(47.2);
      expect(preview.bounds_center?.longitude).toBe(8.2);
      expect(preview.bounds_radius_m).toBe(42);
    });

    it("should preserve Firestore-style internal geopoints in spot bounds", () => {
      const hit = {
        document: {
          id: "test-id",
          name: "Test",
          bounds: [
            { _latitude: 47.389738, _longitude: 8.517314 },
            { _latitude: 47.38974, _longitude: 8.517316 },
            { _latitude: 47.389742, _longitude: 8.517312 },
          ],
        },
      };

      const preview = service.getSpotPreviewFromHit(hit);

      expect(preview.bounds_raw).toEqual([
        { lat: 47.389738, lng: 8.517314 },
        { lat: 47.38974, lng: 8.517316 },
        { lat: 47.389742, lng: 8.517312 },
      ]);
    });
  });

  describe("searchSpotsInRawBounds", () => {
    it("keeps enough coordinate precision for close zoom viewport searches", async () => {
      await service.searchSpotsInRawBounds(
        47.3897383,
        47.3891289,
        8.5179139,
        8.5173139,
        10,
      );

      expect(typesenseSearchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          filter_by:
            "location:(47.389738, 8.517914, 47.389129, 8.517914, 47.389129, 8.517314, 47.389738, 8.517314)",
        }),
        {},
      );
    });
  });

  describe("getCommunityPreviewFromHit", () => {
    it("should parse Typesense community bounds from array values", () => {
      const preview = service.getCommunityPreviewFromHit({
        document: {
          communityKey: "locality:ch:zh:zurich",
          displayName: "Zurich",
          bounds_center: [47.3769, 8.5417],
          bounds_radius_m: 4200,
        },
      });

      expect(preview.boundsCenter).toEqual([47.3769, 8.5417]);
      expect(preview.boundsRadiusM).toBe(4200);
    });

    it("should parse Typesense community bounds from object and string values", () => {
      const preview = service.getCommunityPreviewFromHit({
        document: {
          communityKey: "locality:ch:zh:zurich",
          displayName: "Zurich",
          bounds_center: { latitude: 47.3769, longitude: 8.5417 },
          bounds_radius_m: "4200",
        },
      });

      expect(preview.boundsCenter).toEqual([47.3769, 8.5417]);
      expect(preview.boundsRadiusM).toBe(4200);
    });

    it("rewrites bundled community image URLs for native builds", () => {
      platformServiceSpy.isNative.mockReturnValue(true);

      const preview = service.getCommunityPreviewFromHit({
        document: {
          communityKey: "locality:ch:ag:baden",
          displayName: "Baden",
          image: {
            url: "https://pkspot.app/assets/banner_1200x630.png",
          },
        },
      });

      expect(preview.imageUrl).toBe("/en/assets/banner_1200x630.png");
    });
  });

  describe("listCommunities", () => {
    it("paginates beyond Typesense's per-page limit for map fallback markers", async () => {
      typesenseSearchMock
        .mockResolvedValueOnce({
          found: 300,
          hits: Array.from({ length: 250 }, (_, index) => ({
            document: {
              communityKey: `locality:page-1:${index}`,
              displayName: `Community ${index}`,
            },
          })),
        })
        .mockResolvedValueOnce({
          found: 300,
          hits: Array.from({ length: 50 }, (_, index) => ({
            document: {
              communityKey: `locality:page-2:${index}`,
              displayName: `Community ${index + 250}`,
            },
          })),
        });

      const communities = await service.listCommunities(300);

      expect(communities).toHaveLength(300);
      expect(typesenseSearchMock).toHaveBeenCalledTimes(2);
      expect(typesenseSearchMock.mock.calls[0][0]).toMatchObject({
        page: 1,
        per_page: 250,
      });
      expect(typesenseSearchMock.mock.calls[1][0]).toMatchObject({
        page: 2,
        per_page: 250,
      });
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

    it("groups active filter result lists by viewport tile and sums group counts", async () => {
      const mockBounds = {
        getNorthEast: () => ({ lat: () => 48.2, lng: () => 11.7 }),
        getSouthWest: () => ({ lat: () => 48.1, lng: () => 11.5 }),
        toJSON: () => ({}),
      } as unknown as google.maps.LatLngBounds;

      typesenseSearchMock.mockResolvedValueOnce({
        found: 2,
        grouped_hits: [
          {
            group_key: [33, 21],
            found: 120,
            hits: [
              { document: { id: "spot-a", rating: 5 } },
              { document: { id: "spot-c", rating: 5 } },
              { document: { id: "spot-d", rating: 5 } },
            ],
          },
          {
            group_key: [34, 21],
            found: 2,
            hits: [{ document: { id: "spot-b", rating: 4 } }],
          },
        ],
      });

      const results = await service.searchSpotsInBoundsWithFilter(
        mockBounds,
        SpotFilterMode.ForParkour,
        10,
        6.4,
      );

      const params = typesenseSearchMock.mock.calls[0][0];
      expect(params.group_by).toBe(
        "tile_coordinates.z6.x,tile_coordinates.z6.y",
      );
      expect(params.group_limit).toBe(5);
      expect(typesenseSearchMock).toHaveBeenCalledTimes(1);
      expect(results.found).toBe(122);
      expect(results.hits.map((hit) => hit.document.id)).toEqual([
        "spot-a",
        "spot-b",
        "spot-c",
        "spot-d",
      ]);
    });

    it("omits unsafe world-scale viewport filters for active spot filters", async () => {
      const mockBounds = {
        getNorthEast: () => ({ lat: () => 70, lng: () => 0 }),
        getSouthWest: () => ({ lat: () => -70, lng: () => 0 }),
        toJSON: () => ({}),
      } as unknown as google.maps.LatLngBounds;

      typesenseSearchMock.mockResolvedValueOnce({
        found: 0,
        grouped_hits: [],
      });

      await service.searchSpotsInBoundsWithFilter(
        mockBounds,
        SpotFilterMode.Indoor,
        10,
        2,
      );

      const params = typesenseSearchMock.mock.calls[0][0];
      expect(params.filter_by).not.toContain("location:(");
      expect(params.filter_by).toContain("type:=[");
      expect(params.filter_by).toContain("amenities_true:=[indoor]");
      expect(params.group_by).toBe(
        "tile_coordinates.z2.x,tile_coordinates.z2.y",
      );
      expect(params.group_limit).toBe(5);
    });

    it("falls back to top-level found when grouped hit counts are unavailable", async () => {
      const mockBounds = {
        getNorthEast: () => ({ lat: () => 48.2, lng: () => 11.7 }),
        getSouthWest: () => ({ lat: () => 48.1, lng: () => 11.5 }),
        toJSON: () => ({}),
      } as unknown as google.maps.LatLngBounds;

      typesenseSearchMock.mockResolvedValueOnce({
        found: 1,
        grouped_hits: [
          {
            group_key: [33, 21],
            hits: [
              { document: { id: "spot-a", rating: 5 } },
              { document: { id: "spot-b", rating: 4 } },
            ],
          },
        ],
      });

      const results = await service.searchSpotsInBounds(
        mockBounds,
        10,
        undefined,
        undefined,
        undefined,
        undefined,
        6.4,
      );

      expect(typesenseSearchMock).toHaveBeenCalledTimes(1);
      expect(results.found).toBe(1);
      expect(results.hits.map((hit) => hit.document.id)).toEqual([
        "spot-a",
        "spot-b",
      ]);
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
    it("should ask Typesense for the existing rating sort and apply priority client-side", () => {
      expect(service.spotSearchParameters.sort_by).toBe(
        "rating:desc",
      );
    });

    it("should use spot count as the community search relevance tiebreaker", () => {
      expect(service.communitySearchParameters.sort_by).toBe(
        "_text_match:desc,counts.totalSpots:desc"
      );
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

      const ordered = (service as any).sortHitsByPriorityThenMedia(hits);
      const orderedIds = ordered.map((hit: any) => hit.document.id);

      expect(orderedIds).toEqual([
        "higher-rated-no-media",
        "same-rating-with-media",
        "same-rating-no-media",
        "unrated-with-media",
        "unrated-no-media",
      ]);
    });

    it("applies reported spot priority penalties in the fallback client sort", () => {
      const hits = [
        {
          document: {
            id: "reported-higher-rating",
            rating: 4.8,
            is_reported: true,
          },
        },
        {
          document: {
            id: "normal-lower-rating",
            rating: 3.2,
          },
        },
      ];

      const ordered = (service as any).sortHitsByPriorityThenMedia(hits);
      const orderedIds = ordered.map((hit: any) => hit.document.id);

      expect(orderedIds).toEqual([
        "normal-lower-rating",
        "reported-higher-rating",
      ]);
    });
  });

  describe("getEventPreviewFromHit", () => {
    it("maps Typesense event hits to lightweight previews with resolved media and geo fields", () => {
      const preview = service.getEventPreviewFromHit({
        document: {
          id: "event-123",
          slug: "swissjam26",
          name: "Swiss Jam 2026",
          description: "The annual Zurich jam.",
          venue_string: "Sportzentrum Josef",
          locality_string: "Zurich, Switzerland",
          banner_src: "assets/swissjam/banner.jpg",
          banner_fit: "contain",
          banner_accent_color: "#f8f8f8",
          logo_src: "assets/swissjam/logo.png",
          sponsor: {
            name: "Sponsor",
            logo_src: "assets/sponsors/sponsor.png",
            logo_background_color: "#ffffff",
          },
          is_sponsored: true,
          has_organization: true,
          has_venue_spot: true,
          venue_spot_count: "2",
          start_seconds: "1781431200",
          end_seconds: 1781517600,
          promo_starts_at_seconds: "1781000000",
          location_raw: { lat: "47.37", lng: "8.55" },
          bounds_center: [47.3769, 8.5417],
          bounds_radius_m: "2500",
          promo_region_center: { lat: "47.38", lng: "8.54" },
          promo_region_radius_m: "1200",
          external_source: {
            provider: "instagram",
          },
          url: "https://example.test/swissjam",
          spot_ids: ["spot-a"],
          community_keys: ["ch/zurich"],
          series_ids: ["swissjam"],
          rsvp_counts: {
            going: "7",
            interested: 3,
            notgoing: 1,
            total: "11",
          },
        },
      });

      expect(preview).toMatchObject({
        id: "event-123",
        slug: "swissjam26",
        name: "Swiss Jam 2026",
        description: "The annual Zurich jam.",
        venueString: "Sportzentrum Josef",
        localityString: "Zurich, Switzerland",
        bannerSrc: "assets/swissjam/banner.jpg",
        bannerFit: "contain",
        bannerAccentColor: "#f8f8f8",
        logoSrc: "assets/swissjam/logo.png",
        sponsorName: "Sponsor",
        sponsorLogoSrc: "assets/sponsors/sponsor.png",
        sponsorLogoBackgroundColor: "#ffffff",
        isSponsored: true,
        hasOrganization: true,
        hasVenueSpot: true,
        venueSpotCount: 2,
        startSeconds: 1781431200,
        endSeconds: 1781517600,
        promoStartsAtSeconds: 1781000000,
        location: [47.37, 8.55],
        boundsCenter: [47.3769, 8.5417],
        boundsRadiusM: 2500,
        promoRegionCenter: [47.38, 8.54],
        promoRegionRadiusM: 1200,
        externalProvider: "instagram",
        url: "https://example.test/swissjam",
        spotIds: ["spot-a"],
        communityKeys: ["ch/zurich"],
        seriesIds: ["swissjam"],
        rsvpCounts: {
          going: 7,
          interested: 3,
          notgoing: 1,
          total: 11,
        },
      });
    });

    it("builds an Event model from search hits for map-island ranking", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));

      const event = service.getEventFromHit({
        document: {
          id: "event-123",
          slug: "swissjam26",
          name: "Swiss Jam 2026",
          venue_string: "Sportzentrum Josef",
          locality_string: "Zurich, Switzerland",
          start_seconds: Math.floor(
            new Date("2026-06-14T10:00:00.000Z").getTime() / 1000,
          ),
          end_seconds: Math.floor(
            new Date("2026-06-15T10:00:00.000Z").getTime() / 1000,
          ),
          promo_region_center: [47.3769, 8.5417],
          promo_region_radius_m: 1500,
          bounds_center: [47.3769, 8.5417],
          bounds_radius_m: 3000,
        },
      });

      expect(event?.id).toBe("event-123");
      expect(event?.slug).toBe("swissjam26");
      expect(event?.status()).toBe("upcoming");
      expect(event?.promoRegion).toEqual({
        center: { lat: 47.3769, lng: 8.5417 },
        radius_m: 1500,
      });
      expect(event?.bounds.north).toBeGreaterThan(event!.bounds.south);
      expect(event?.bounds.east).toBeGreaterThan(event!.bounds.west);

      vi.useRealTimers();
    });

    it("uses the event location as the marker anchor instead of bounds center", () => {
      const event = service.getEventFromHit({
        document: {
          id: "event-123",
          name: "WPF Camp",
          venue_string: "Camp venue",
          locality_string: "Basel, Switzerland",
          banner_fit: "contain",
          banner_accent_color: "#111111",
          start_seconds: Math.floor(
            new Date("2026-06-10T10:00:00.000Z").getTime() / 1000,
          ),
          end_seconds: Math.floor(
            new Date("2026-06-14T10:00:00.000Z").getTime() / 1000,
          ),
          location_raw: { lat: 47.5596, lng: 7.5886 },
          bounds_center: [47.35, 7.9],
          bounds_radius_m: 30_000,
          promo_region_center: [47.35, 7.9],
          promo_region_radius_m: 150_000,
          "rsvp_counts.going": "2",
          "rsvp_counts.interested": "4",
          "rsvp_counts.total": "6",
        },
      });

      expect(event?.location).toEqual({ lat: 47.5596, lng: 7.5886 });
      expect(event?.bannerFit).toBe("contain");
      expect(event?.bannerAccentColor).toBe("#111111");
      expect(event?.rsvpCounts).toEqual({
        going: 2,
        interested: 4,
        notgoing: 0,
        total: 6,
      });
    });

    it("fetches map events broadly and filters visible markers locally", async () => {
      const bounds = {
        getNorthEast: () => ({ lat: () => 47.4, lng: () => 8.55 }),
        getSouthWest: () => ({ lat: () => 47.39, lng: () => 8.54 }),
      } as google.maps.LatLngBounds;

      typesenseMultiSearchMock.mockResolvedValueOnce({
        results: [
          { hits: [], found: 0 },
          {
            found: 2,
            hits: [
              {
                document: {
                  id: "visible-event",
                  name: "Visible Event",
                  venue_string: "Visible venue",
                  locality_string: "Zurich",
                  start_seconds: 1_800_000_000,
                  end_seconds: 1_800_086_400,
                  location: [47.395, 8.545],
                },
              },
              {
                document: {
                  id: "outside-event",
                  name: "Outside Event",
                  venue_string: "Outside venue",
                  locality_string: "Bern",
                  start_seconds: 1_800_000_000,
                  end_seconds: 1_800_086_400,
                  location: [46.948, 7.447],
                },
              },
            ],
          },
          { hits: [], found: 0 },
          { hits: [], found: 0 },
        ],
      });

      const events = await service.searchEventsInBounds(bounds);

      const searches = typesenseMultiSearchMock.mock.calls[0][0].searches;
      expect(searches[1].collection).toBe("events_v1");
      expect(searches[1].filter_by).toContain("published:!=false");
      expect(searches[1].filter_by).toContain("end_seconds:>=");
      expect(searches[1].filter_by).not.toContain("location:(");
      expect(searches[1].include_fields).toContain("banner_fit");
      expect(searches[1].include_fields).toContain("banner_accent_color");
      expect(searches[1].per_page).toBe(250);
      expect(events.map((event) => event.id)).toEqual(["visible-event"]);

      expect(searches[2].collection).toBe("events_v1");
      expect(searches[2].filter_by).toContain("promo_radius_m:>0");
      expect(searches[2].filter_by).toContain("promo_bounds_north:>=47.39");
      expect(searches[2].filter_by).toContain("promo_bounds_south:<=47.4");
    });

    it("omits viewport geo filters when bounds cover the world", async () => {
      const bounds = {
        getNorthEast: () => ({ lat: () => 85, lng: () => 180 }),
        getSouthWest: () => ({ lat: () => -85, lng: () => -180 }),
      } as google.maps.LatLngBounds;

      await service.searchMapObjectsInBounds(bounds);

      const searches = typesenseMultiSearchMock.mock.calls[0][0].searches;
      expect(searches[0].filter_by).toBeUndefined();
      expect(searches[1].filter_by).toContain("published:!=false");
      expect(searches[1].filter_by).toContain("end_seconds:>=");
      expect(searches[1].filter_by).not.toContain("location:(");
      expect(searches[2].filter_by).toContain("promo_radius_m:>0");
      expect(searches[2].filter_by).not.toContain("promo_bounds_");
      expect(searches[3].filter_by).toContain("scope:=[locality]");
      expect(searches[3].filter_by).not.toContain("visibility_bounds_");
    });

    it("treats equal east and west longitudes as a full-world viewport", async () => {
      const bounds = {
        getNorthEast: () => ({ lat: () => 70, lng: () => 0 }),
        getSouthWest: () => ({ lat: () => -70, lng: () => 0 }),
      } as google.maps.LatLngBounds;

      await service.searchMapObjectsInBounds(bounds);

      const searches = typesenseMultiSearchMock.mock.calls[0][0].searches;
      expect(searches[0].filter_by).toBeUndefined();
      expect(searches[2].filter_by).not.toContain("promo_bounds_");
      expect(searches[3].filter_by).not.toContain("visibility_bounds_");
    });

    it("splits very wide spot viewports instead of sending one huge geo polygon", async () => {
      const bounds = {
        getNorthEast: () => ({ lat: () => 70, lng: () => 150 }),
        getSouthWest: () => ({ lat: () => -70, lng: () => -130 }),
      } as google.maps.LatLngBounds;

      await service.searchMapObjectsInBounds(bounds);

      const spotFilter = typesenseMultiSearchMock.mock.calls[0][0].searches[0]
        .filter_by;
      expect(spotFilter).toContain(" || ");
      expect(spotFilter.match(/location:\(/g)?.length).toBe(2);
      expect(spotFilter).toContain("70, 0, -70, 0, -70, -130, 70, -130");
      expect(spotFilter).toContain("70, 150, -70, 150, -70, 0, 70, 0");
    });

    it("splits very wide antimeridian spot viewports before multi-searching", async () => {
      const bounds = {
        getNorthEast: () => ({
          lat: () => 87.22105657762411,
          lng: () => -159.51298475337524,
        }),
        getSouthWest: () => ({
          lat: () => -79.80482445119773,
          lng: () => -138.77080436765948,
        }),
      } as google.maps.LatLngBounds;

      await service.searchMapObjectsInBounds(bounds);

      const spotFilter = typesenseMultiSearchMock.mock.calls[0][0].searches[0]
        .filter_by;
      expect(spotFilter.match(/location:\(/g)?.length).toBe(3);
      expect(spotFilter).toContain(
        "87.221, 20.615, -79.805, 20.615, -79.805, -138.771, 87.221, -138.771",
      );
      expect(spotFilter).toContain(
        "87.221, 180, -79.805, 180, -79.805, 20.615, 87.221, 20.615",
      );
      expect(spotFilter).toContain(
        "87.221, -159.513, -79.805, -159.513, -79.805, -180, 87.221, -180",
      );
      expect(spotFilter).not.toContain(
        "87.221, 180, -79.805, 180, -79.805, -138.771, 87.221, -138.771",
      );
    });

    it("groups locality communities by viewport tile and fetches countries only when requested", async () => {
      const bounds = {
        getNorthEast: () => ({ lat: () => 47.4, lng: () => 8.55 }),
        getSouthWest: () => ({ lat: () => 47.39, lng: () => 8.54 }),
      } as google.maps.LatLngBounds;

      typesenseMultiSearchMock.mockResolvedValueOnce({
        results: [
          { hits: [], found: 0 },
          { hits: [], found: 0 },
          { hits: [], found: 0 },
          {
            found: 2,
            grouped_hits: [
              {
                group_key: [134, 91],
                hits: [
                  {
                    document: {
                      communityKey: "locality:ch:zh:zurich",
                      displayName: "Zurich",
                      scope: "locality",
                      counts: { totalSpots: 42 },
                    },
                  },
                ],
              },
            ],
          },
          {
            found: 1,
            hits: [
              {
                document: {
                  communityKey: "country:ch",
                  displayName: "Switzerland",
                  scope: "country",
                  counts: { totalSpots: 120 },
                },
              },
            ],
          },
        ],
      });

      const result = await service.searchMapObjectsInBounds(bounds, {
        includeCountryCommunities: true,
        viewportZoom: 8.7,
      });

      const searches = typesenseMultiSearchMock.mock.calls[0][0].searches;
      expect(searches[3]).toMatchObject({
        collection: "communities_v1",
        group_by: "tile_coordinates.z8.x,tile_coordinates.z8.y",
        group_limit: 2,
      });
      expect(searches[3].filter_by).toContain("scope:=[locality]");
      expect(searches[4].filter_by).toContain("scope:=[country]");
      expect(searches[4].group_by).toBeUndefined();
      expect(result.counts.communities).toBe(3);
      expect(
        result.communities.map((community) => community.communityKey),
      ).toEqual(["locality:ch:zh:zurich", "country:ch"]);
    });
  });
});
